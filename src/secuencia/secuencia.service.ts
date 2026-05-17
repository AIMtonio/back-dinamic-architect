import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { CreateSecuenciaDto } from './dto/create-secuencia.dto';

type EncryptedEnvelope = {
  alg?: string;
  iv?: string;
  data: string;
  digest?: string;
  ts?: string;
};

@Injectable()
export class SecuenciaService {
  private readonly aiModel = process.env.ARCHITECTURE_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  private readonly aiBaseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  private readonly openAiApiKey = process.env.OPENAI_API_KEY;
  private readonly aiTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 18_000);
  private readonly encryptedAlgorithm = 'AES-256-GCM';
  private readonly digestValidationMode = (process.env.SECUENCIA_DECRYPT_DIGEST_MODE || process.env.DIAGRAM_DECRYPT_DIGEST_MODE || 'auto').toLowerCase();
  private readonly maxSkewMs = Number(process.env.SECUENCIA_DECRYPT_MAX_SKEW_SECONDS || process.env.DIAGRAM_DECRYPT_MAX_SKEW_SECONDS || 300) * 1000;

  private getSecret(): string {
    const secret = process.env.SECUENCIA_DECRYPT_SECRET || process.env.DIAGRAM_DECRYPT_SECRET || process.env.APP_CRYPTO_SECRET;
    if (!secret) {
      throw new BadRequestException('Falta SECUENCIA_DECRYPT_SECRET para procesar payload cifrado.');
    }
    return secret;
  }

  isEncryptedPayload(payload: unknown): payload is EncryptedEnvelope {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return false;
    }
    const c = payload as Partial<EncryptedEnvelope>;
    return typeof c.data === 'string' && c.data.length > 0;
  }

  encryptResponse(payload: unknown): EncryptedEnvelope {
    const secret = this.getSecret();
    const key = createHash('sha256').update(secret).digest();
    const iv = randomBytes(12);
    const plainBuffer = Buffer.from(JSON.stringify(payload ?? {}), 'utf8');
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const cipherText = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const data = Buffer.concat([iv, cipherText, authTag]).toString('base64');
    return { data };
  }

  private compareDigest(a: string, b: string): boolean {
    const ea = a.trim().toLowerCase();
    const eb = b.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(ea) || !/^[a-f0-9]{64}$/.test(eb)) return false;
    return timingSafeEqual(Buffer.from(ea, 'hex'), Buffer.from(eb, 'hex'));
  }

  private verifyDigest(envelope: EncryptedEnvelope, secret: string): void {
    if (!envelope.digest) return;
    const ivV = envelope.iv || '';
    const algV = envelope.alg || this.encryptedAlgorithm;
    const base = `${algV}.${ivV}.${envelope.data}.${envelope.ts || ''}`;
    const baseNoAlg = `${ivV}.${envelope.data}.${envelope.ts || ''}`;
    const candidates = [
      createHash('sha256').update(envelope.data).digest('hex'),
      createHash('sha256').update(`${envelope.data}${envelope.ts || ''}`).digest('hex'),
      createHash('sha256').update(`${ivV}${envelope.data}`).digest('hex'),
      createHash('sha256').update(`${ivV}${envelope.data}${envelope.ts || ''}`).digest('hex'),
      createHash('sha256').update(base).digest('hex'),
      createHash('sha256').update(baseNoAlg).digest('hex'),
      createHmac('sha256', secret).update(base).digest('hex'),
      createHmac('sha256', secret).update(baseNoAlg).digest('hex'),
    ];
    const mode = this.digestValidationMode;
    if (mode === 'off' || mode === 'none' || mode === 'disabled') return;
    const valid = candidates.some((c, i) => {
      if (mode === 'sha256' && i >= 6) return false;
      if (mode === 'hmac' && i < 6) return false;
      return this.compareDigest(c, envelope.digest as string);
    });
    if (!valid) {
      if (mode === 'auto') return;
      throw new BadRequestException('Digest invalido para payload cifrado.');
    }
  }

  private validateTs(ts?: string): void {
    if (!ts) return;
    const value = Date.parse(ts);
    if (Number.isNaN(value)) throw new BadRequestException('Campo ts invalido.');
    if (Math.abs(Date.now() - value) > this.maxSkewMs) {
      throw new BadRequestException('El payload cifrado expiro.');
    }
  }

  decryptPayload(payload: unknown): CreateSecuenciaDto {
    if (!this.isEncryptedPayload(payload)) {
      const plain = payload as CreateSecuenciaDto;
      if (!Array.isArray(plain.pasos) || plain.pasos.length === 0) {
        throw new BadRequestException('pasos debe ser un arreglo con al menos 1 elemento.');
      }
      return plain;
    }
    const envelope = payload as EncryptedEnvelope;
    if (envelope.alg && envelope.alg !== this.encryptedAlgorithm) {
      throw new BadRequestException(`Algoritmo no soportado. Usa ${this.encryptedAlgorithm}.`);
    }
    const secret = this.getSecret();
    this.validateTs(envelope.ts);
    this.verifyDigest(envelope, secret);
    try {
      const encrypted = Buffer.from(envelope.data, 'base64');
      if (encrypted.length <= 28) throw new BadRequestException('Data cifrada invalida.');
      let iv: Buffer;
      let cipherText: Buffer;
      let authTag: Buffer;
      if (envelope.iv) {
        iv = Buffer.from(envelope.iv, 'base64');
        if (iv.length < 12) throw new BadRequestException('IV invalido.');
        authTag = encrypted.subarray(encrypted.length - 16);
        cipherText = encrypted.subarray(0, encrypted.length - 16);
      } else {
        iv = encrypted.subarray(0, 12);
        authTag = encrypted.subarray(encrypted.length - 16);
        cipherText = encrypted.subarray(12, encrypted.length - 16);
      }
      const key = createHash('sha256').update(secret).digest();
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8');
      const decoded = JSON.parse(plain) as CreateSecuenciaDto;
      if (!Array.isArray(decoded.pasos) || decoded.pasos.length === 0) {
        throw new BadRequestException('pasos debe ser un arreglo con al menos 1 elemento.');
      }
      return decoded;
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('No se pudo desencriptar el payload de secuencia.');
    }
  }

  async generateUmlRaw(payload: CreateSecuenciaDto): Promise<string> {
    const wasEncrypted = this.isEncryptedPayload(payload);
    const result = await this.generateUml(payload);
    if (wasEncrypted) {
      return (result as any).data as string;
    }
    return (result as any).data.uml as string;
  }

  async generateUml(payload: CreateSecuenciaDto) {
    const wasEncrypted = this.isEncryptedPayload(payload);
    const decrypted = this.decryptPayload(payload);
    const fallbackUml = this.buildFallbackPlantUml(decrypted);

    const wrap = (result: unknown) => wasEncrypted ? this.encryptResponse(result) : result;

    if (!this.openAiApiKey) {
      return wrap({
        message: 'Diagrama UML generado con fallback local (OPENAI_API_KEY no configurada).',
        data: { uml: fallbackUml, model: 'template-fallback', aiError: null },
      });
    }

    const prompt = this.buildSequencePrompt(decrypted);

    try {
      const response = await fetch(`${this.aiBaseUrl}/chat/completions`, {
        method: 'POST',
        signal: AbortSignal.timeout(this.aiTimeoutMs),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: this.aiModel,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: [
                'Eres experto en diagramas UML de secuencia.',
                'Devuelve UNICAMENTE codigo PlantUML valido entre @startuml y @enduml.',
                'No incluyas markdown, no incluyas explicaciones.',
              ].join(' '),
            },
            { role: 'user', content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429 || response.status >= 500) {
          return wrap({
            message: 'Diagrama UML generado con fallback local por error temporal de IA.',
            data: { uml: fallbackUml, model: 'template-fallback', aiError: `fallback por error IA ${response.status}` },
          });
        }
        throw new InternalServerErrorException(
          `Error al generar diagrama de secuencia con IA (${response.status}). Detalle: ${errorText}`,
        );
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const raw = json.choices?.[0]?.message?.content?.trim();
      const normalizedUml = raw ? this.ensurePlantUmlWrapped(raw) : '';

      if (!normalizedUml) {
        return wrap({
          message: 'Diagrama UML generado con fallback local por respuesta vacia de IA.',
          data: { uml: fallbackUml, model: 'template-fallback', aiError: 'fallback por respuesta vacia de IA' },
        });
      }

      return wrap({
        message: 'Diagrama UML de secuencia generado exitosamente.',
        data: { uml: normalizedUml, model: this.aiModel, aiError: null },
      });
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      return wrap({
        message: 'Diagrama UML generado con fallback local por error de conectividad con IA.',
        data: { uml: fallbackUml, model: 'template-fallback', aiError: 'fallback por error de conectividad con IA' },
      });
    }
  }

  private buildSequencePrompt(payload: CreateSecuenciaDto): string {
    const steps = payload.pasos
      .map((step, index) => `${index + 1}. ${step.descripcion}`)
      .join('\n');

    return [
      'Genera un diagrama UML de secuencia en formato PlantUML.',
      'Debe representar fielmente los pasos entregados.',
      'Usa nombres de participantes claros y estables.',
      'Agrega mensajes entre participantes segun cada paso.',
      'Si corresponde, usa activate/deactivate y bloques alt/opt/loop.',
      'Respuesta obligatoria: solo PlantUML entre @startuml y @enduml.',
      '',
      `Titulo: ${payload.titulo || 'Diagrama de Secuencia'}`,
      `Contexto: ${payload.contexto || 'No especificado'}`,
      `Actor principal: ${payload.actorPrincipal || 'Usuario'}`,
      '',
      'Pasos:',
      steps,
    ].join('\n');
  }

  private ensurePlantUmlWrapped(text: string): string {
    const cleaned = text
      .replace(/^```[a-zA-Z]*\s*/g, '')
      .replace(/```$/g, '')
      .trim();

    if (cleaned.includes('@startuml') && cleaned.includes('@enduml')) {
      return cleaned;
    }

    return ['@startuml', cleaned, '@enduml'].join('\n');
  }

  private buildFallbackPlantUml(payload: CreateSecuenciaDto): string {
    const actor = (payload.actorPrincipal || 'Usuario').replace(/\"/g, "'");
    const backend = 'API';
    const worker = 'ServicioUML';

    const lines = [
      '@startuml',
      `title ${payload.titulo || 'Diagrama de Secuencia'}`,
      `actor ${actor}`,
      `participant ${backend}`,
      `participant ${worker}`,
      `${actor} -> ${backend}: Solicitar generacion de diagrama`,
      `activate ${backend}`,
      `${backend} -> ${worker}: Procesar lista de pasos`,
      `activate ${worker}`,
    ];

    payload.pasos.forEach((step, index) => {
      const safeDescription = step.descripcion.replace(/\"/g, "'");
      lines.push(`${worker} -> ${worker}: Paso ${index + 1} - ${safeDescription}`);
    });

    lines.push(
      `${worker} --> ${backend}: UML generado`,
      `deactivate ${worker}`,
      `${backend} --> ${actor}: Respuesta con string PlantUML`,
      `deactivate ${backend}`,
      '@enduml',
    );

    return lines.join('\n');
  }
}

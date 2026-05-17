import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { basename } from 'path';

type EncryptedPayloadEnvelope = {
  alg?: string;
  iv?: string;
  data: string;
  digest?: string;
  ts?: string;
};

@Injectable()
export class DiagramsService {
  private readonly logger = new Logger(DiagramsService.name);


  private readonly defaultInputExcelPath = process.env.DIAGRAM_INPUT_EXCEL_PATH || process.env.EXCEL_FILE_PATH || 'src/data/input/Componentes.xlsx';
  private readonly outputDir = process.env.DIAGRAM_OUTPUT_DIR || 'src/data/output';
  private readonly outputExcelFile = process.env.DIAGRAM_OUTPUT_EXCEL_FILE || 'diagramaComponentes.drawio';
  private readonly outputJsonFile = process.env.DIAGRAM_OUTPUT_JSON_FILE || 'diagramaComponentesJson.drawio';
  private readonly digestValidationMode = (process.env.DIAGRAM_DECRYPT_DIGEST_MODE || 'auto').toLowerCase();
  private readonly maxSkewMs = Number(process.env.DIAGRAM_DECRYPT_MAX_SKEW_SECONDS || 300) * 1000;
  private readonly encryptedAlgorithm = 'AES-256-GCM';

  isEncryptedRequestPayload(payload: unknown): boolean {
    return this.isEncryptedPayload(payload);
  }

  encryptResponsePayload(payload: unknown): EncryptedPayloadEnvelope {
    const secret = this.getDecryptSecret();
    const key = createHash('sha256').update(secret).digest();
    const iv = randomBytes(12);

    const plainBuffer = Buffer.from(JSON.stringify(payload ?? {}), 'utf8');
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const cipherText = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const data = Buffer.concat([iv, cipherText, authTag]).toString('base64');

    return {
      data,
    };
  }

  private isEncryptedPayload(payload: unknown): payload is EncryptedPayloadEnvelope {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return false;
    }
    const candidate = payload as Partial<EncryptedPayloadEnvelope>;
    return typeof candidate.data === 'string' && candidate.data.length > 0;
  }

  private normalizeEncryptedEnvelope(payload: EncryptedPayloadEnvelope): EncryptedPayloadEnvelope {
    const normalized: EncryptedPayloadEnvelope = {
      alg: payload.alg || this.encryptedAlgorithm,
      iv: payload.iv,
      data: payload.data,
      digest: payload.digest,
      ts: payload.ts,
    };

    if (normalized.alg !== this.encryptedAlgorithm) {
      throw new BadRequestException(`Algoritmo no soportado. Usa ${this.encryptedAlgorithm}.`);
    }

    return normalized;
  }

  private getDecryptSecret(): string {
    const secret = process.env.DIAGRAM_DECRYPT_SECRET || process.env.APP_CRYPTO_SECRET;
    if (!secret) {
      throw new BadRequestException('Falta DIAGRAM_DECRYPT_SECRET para procesar payload cifrado.');
    }
    return secret;
  }

  private compareDigest(expectedHex: string, receivedHex: string): boolean {
    const expected = expectedHex.trim().toLowerCase();
    const received = receivedHex.trim().toLowerCase();

    if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(received)) {
      return false;
    }

    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(received, 'hex');
    return timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  private validateTimestamp(ts?: string): void {
    if (!ts) {
      return;
    }

    const value = Date.parse(ts);
    if (Number.isNaN(value)) {
      throw new BadRequestException('El campo ts del payload cifrado no tiene un formato de fecha valido.');
    }

    const drift = Math.abs(Date.now() - value);
    if (drift > this.maxSkewMs) {
      throw new BadRequestException('El payload cifrado expiro o tiene una marca de tiempo invalida.');
    }
  }

  private verifyEnvelopeDigest(envelope: EncryptedPayloadEnvelope, secret: string): void {
    if (!envelope.digest) {
      return;
    }

    const ivValue = envelope.iv || '';
    const algValue = envelope.alg || this.encryptedAlgorithm;
    const base = `${algValue}.${ivValue}.${envelope.data}.${envelope.ts || ''}`;
    const baseNoAlg = `${ivValue}.${envelope.data}.${envelope.ts || ''}`;
    const candidates = [
      createHash('sha256').update(envelope.data).digest('hex'),
      createHash('sha256').update(`${envelope.data}${envelope.ts || ''}`).digest('hex'),
      createHash('sha256').update(`${ivValue}${envelope.data}`).digest('hex'),
      createHash('sha256').update(`${ivValue}${envelope.data}${envelope.ts || ''}`).digest('hex'),
      createHash('sha256').update(base).digest('hex'),
      createHash('sha256').update(baseNoAlg).digest('hex'),
      createHmac('sha256', secret).update(base).digest('hex'),
      createHmac('sha256', secret).update(baseNoAlg).digest('hex'),
    ];

    const mode = this.digestValidationMode;
    if (mode === 'off' || mode === 'none' || mode === 'disabled') {
      return;
    }

    const valid = candidates.some((candidate, index) => {
      if (mode === 'sha256' && index >= 6) {
        return false;
      }
      if (mode === 'hmac' && index < 6) {
        return false;
      }
      return this.compareDigest(candidate, envelope.digest as string);
    });

    if (!valid) {
      if (mode === 'auto') {
        this.logger.warn('Digest no reconocido en modo auto. Se continua con descifrado para compatibilidad.');
        return;
      }
      throw new BadRequestException('Digest invalido para payload cifrado.');
    }
  }

  private decryptPayloadIfEncrypted(payload: unknown): unknown {
    if (!this.isEncryptedPayload(payload)) {
      return payload;
    }

    const envelope = this.normalizeEncryptedEnvelope(payload as EncryptedPayloadEnvelope);
    const secret = this.getDecryptSecret();

    this.validateTimestamp(envelope.ts);
    this.verifyEnvelopeDigest(envelope, secret);

    try {
      const encrypted = Buffer.from(envelope.data, 'base64');

      if (encrypted.length <= 16) {
        throw new BadRequestException('Data cifrada invalida para AES-256-GCM.');
      }

      let iv: Buffer;
      let cipherText: Buffer;
      let authTag: Buffer;

      if (envelope.iv) {
        iv = Buffer.from(envelope.iv, 'base64');
        if (iv.length < 12) {
          throw new BadRequestException('IV invalido para AES-256-GCM.');
        }
        authTag = encrypted.subarray(encrypted.length - 16);
        cipherText = encrypted.subarray(0, encrypted.length - 16);
      } else {
        if (encrypted.length <= 28) {
          throw new BadRequestException('Data cifrada invalida. Se esperaba base64 con iv+ciphertext+authTag.');
        }
        iv = encrypted.subarray(0, 12);
        authTag = encrypted.subarray(encrypted.length - 16);
        cipherText = encrypted.subarray(12, encrypted.length - 16);
      }

      const key = createHash('sha256').update(secret).digest();

      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const plainBuffer = Buffer.concat([decipher.update(cipherText), decipher.final()]);

      const plainText = plainBuffer.toString('utf8');
      const decoded = JSON.parse(plainText) as unknown;

      if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
        throw new BadRequestException('El contenido desencriptado no es un objeto JSON valido.');
      }

      return decoded;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      this.logger.error('No se pudo desencriptar el payload de diagramas', err as Error);
      throw new BadRequestException('No se pudo desencriptar el payload de diagramas.');
    }
  }

  private buildOutputPath(fileName: string): string {
    return `${this.outputDir}/${fileName}`;
  }

  private extractComponentsFromPayload(payload: any): { name: string; type: string }[] {
    if (typeof payload !== 'object' || payload === null) {
      throw new BadRequestException('Payload inválido. Debe ser un objeto JSON.');
    }

    const components: { name: string; type: string }[] = [];

    if (Array.isArray(payload.componentes) && Array.isArray(payload.tipo)) {
      const nombres = payload.componentes;
      const tipos = payload.tipo;
      if (nombres.length !== tipos.length) {
        throw new BadRequestException('Los arreglos componentes y tipo deben tener la misma cantidad de elementos.');
      }
      for (let i = 0; i < nombres.length; i++) {
        const nombre = nombres[i];
        const tipo = tipos[i] || 'lambda';
        if (typeof nombre === 'string' && nombre.trim().length > 0) {
          components.push({ name: nombre, type: tipo });
        }
      }
    } else {
      const arrays = Object.values(payload).filter((v) => Array.isArray(v)) as any[];
      if (arrays.length === 0) {
        throw new BadRequestException('No se encontró ningún arreglo en el JSON.');
      }
      arrays.forEach((arr) => {
        arr.forEach((item) => {
          if (item && typeof item === 'object') {
            const name = item.nombre || item.name;
            const type = item.tipo || item.type || 'lambda';
            if (typeof name === 'string') {
              components.push({ name, type });
            }
          }
        });
      });
    }

    if (components.length === 0) {
      throw new UnprocessableEntityException('No se encontraron nodos válidos con nombre/tipo en el payload.');
    }

    return components;
  }

  private extractComponentsFromExcel(filePath: string): { name: string; type: string }[] {
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`El archivo ${filePath} no existe.`);
    }

    if (!filePath.endsWith('.xlsx')) {
      throw new BadRequestException(`El archivo ${filePath} no es un archivo Excel válido.`);
    }

    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      throw new UnprocessableEntityException(`El archivo ${filePath} está vacío.`);
    }

    try {
      fs.accessSync(filePath, fs.constants.R_OK);
    } catch {
      throw new BadRequestException(`El archivo ${filePath} no tiene permisos de lectura.`);
    }

    try {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new UnprocessableEntityException(`El archivo ${filePath} no contiene hojas.`);
      }

      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        throw new UnprocessableEntityException(`No se pudo leer la hoja ${sheetName}.`);
      }

      const firstRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[];
      if (!firstRow.includes('name') || !firstRow.includes('type')) {
        throw new UnprocessableEntityException(`El archivo ${filePath} no contiene las cabeceras necesarias 'name' y 'type'.`);
      }

      const components: { name: string; type: string }[] = XLSX.utils.sheet_to_json(sheet);
      if (!Array.isArray(components) || components.length === 0) {
        throw new UnprocessableEntityException(`El archivo ${filePath} no contiene componentes válidos.`);
      }

      return components;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new UnprocessableEntityException(`El archivo ${filePath} no se puede leer correctamente.`);
    }
  }

  async generateDiagramFromComponents(components: { name: string; type: string }[], outputPath = this.buildOutputPath(this.outputExcelFile)) {
    if (!Array.isArray(components)) {
      throw new BadRequestException('components debe ser un arreglo');
    }
    if (components.length === 0) {
      throw new UnprocessableEntityException('No se encontraron componentes para generar el diagrama.');
    }

    const header = `<?xml version="1.0"?>
<mxfile>
  <diagram name="Diagrama">
    <mxGraphModel>
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />`;

    const footer = `
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    const nodes = components.map((c, i) => {
      const colsPerRow = 8;
      const row = Math.floor(i / colsPerRow);
      const col = i % colsPerRow;
      const x = 50 + col * 150;
      const y = 50 + row * 100;
      const name = (c.name || '').toString();
      const type = (c.type || '').toString().toLowerCase();

      if (type === 'lambda') {
        return `
        <mxCell id="${i + 2}" value="${name}" 
          style="shape=mxgraph.aws3.lambda;verticalLabelPosition=bottom;verticalAlign=top;align=center;" 
          vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="80" height="80" as="geometry" />
        </mxCell>`;
      } else if (type === 'eks') {
        return `
        <mxCell id="${i + 2}" value="&#xa;&#xa;&#xa;&#xa;&#xa;&#xa;&#xa;${name}" style="shape=mxgraph.kubernetes.icon2;kubernetesLabel=1;prIcon=pod;movable=1;resizable=1;rotatable=1;deletable=1;editable=1;locked=0;connectable=1;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="80" height="80" as="geometry" />
        </mxCell>`;
      }

      return `
        <mxCell id="${i + 2}" value="${name}" style="shape=rectangle;fillColor=#CCCCCC;strokeColor=#000000;" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry" />
        </mxCell>`;
    });

    const xml = header + nodes.join('\n') + footer;

    const filename = basename(outputPath) || 'diagram.drawio';
    const buffer = Buffer.from(xml, 'utf8');

    return { buffer, filename };
  }

  async generateDiagramFromJson(payload: any) {
    const decryptedPayload = this.decryptPayloadIfEncrypted(payload);
    const components = this.extractComponentsFromPayload(decryptedPayload);
    return await this.generateDiagramFromComponents(components, this.buildOutputPath(this.outputJsonFile));
  }

  async validateDiagramFromJson(payload: any) {
    const decryptedPayload = this.decryptPayloadIfEncrypted(payload);
    const components = this.extractComponentsFromPayload(decryptedPayload);

    return {
      message: 'Validacion de diagrama exitosa (dry-run).',
      dryRun: true,
      source: 'json',
      outputPath: this.buildOutputPath(this.outputJsonFile),
      componentsCount: components.length,
    };
  }

  async generateDiagramFromExcel() {
    try {
      const filePath = this.defaultInputExcelPath;

      const components = this.extractComponentsFromExcel(filePath);
      return await this.generateDiagramFromComponents(components, this.buildOutputPath(this.outputExcelFile));

    } catch (err) {
      this.logger.error('Error al leer el archivo Excel:', err);
      if (err instanceof HttpException) {
        throw err;
      }
      throw new InternalServerErrorException('Error interno al procesar el archivo Excel.');
    }
  }

  async validateDiagramFromExcel() {
    try {
      const filePath = this.defaultInputExcelPath;
      const components = this.extractComponentsFromExcel(filePath);

      return {
        message: 'Validacion de diagrama exitosa (dry-run).',
        dryRun: true,
        source: 'excel',
        inputPath: filePath,
        outputPath: this.buildOutputPath(this.outputExcelFile),
        componentsCount: components.length,
      };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      throw new InternalServerErrorException('Error interno al validar el archivo Excel.');
    }
  }


}

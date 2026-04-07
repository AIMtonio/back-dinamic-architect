import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateSecuenciaDto } from './dto/create-secuencia.dto';

@Injectable()
export class SecuenciaService {
  private readonly aiModel = process.env.ARCHITECTURE_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  private readonly aiBaseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  private readonly openAiApiKey = process.env.OPENAI_API_KEY;

  async generateUmlRaw(payload: CreateSecuenciaDto): Promise<string> {
    const result = await this.generateUml(payload);
    return result.data.uml;
  }

  async generateUml(payload: CreateSecuenciaDto) {
    const fallbackUml = this.buildFallbackPlantUml(payload);

    if (!this.openAiApiKey) {
      return {
        message: 'Diagrama UML generado con fallback local (OPENAI_API_KEY no configurada).',
        data: {
          uml: fallbackUml,
          model: 'template-fallback',
          aiError: null,
        },
      };
    }

    const prompt = this.buildSequencePrompt(payload);

    try {
      const response = await fetch(`${this.aiBaseUrl}/chat/completions`, {
        method: 'POST',
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
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429 || response.status >= 500) {
          return {
            message: 'Diagrama UML generado con fallback local por error temporal de IA.',
            data: {
              uml: fallbackUml,
              model: 'template-fallback',
              aiError: `fallback por error IA ${response.status}`,
            },
          };
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
        return {
          message: 'Diagrama UML generado con fallback local por respuesta vacia de IA.',
          data: {
            uml: fallbackUml,
            model: 'template-fallback',
            aiError: 'fallback por respuesta vacia de IA',
          },
        };
      }

      return {
        message: 'Diagrama UML de secuencia generado exitosamente.',
        data: {
          uml: normalizedUml,
          model: this.aiModel,
          aiError: null,
        },
      };
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      return {
        message: 'Diagrama UML generado con fallback local por error de conectividad con IA.',
        data: {
          uml: fallbackUml,
          model: 'template-fallback',
          aiError: 'fallback por error de conectividad con IA',
        },
      };
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

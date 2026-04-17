import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { GenerateProblemDocumentDto } from './dto/generate-problem-document.dto';

type ProblemDocumentSections = {
  problematicaDetallada: string;
  alcanceProyecto: string;
  alcanceNoConsiderado: string;
  posibleSolucion: string;
};

@Injectable()
export class DocumentService {
  private readonly logger = new Logger(DocumentService.name);

  private readonly aiModel =
    process.env.ARCHITECTURE_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  private readonly aiBaseUrl = (
    process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  ).replace(/\/$/, '');
  private readonly openAiApiKey = process.env.OPENAI_API_KEY;
  private readonly aiTimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 18_000);

  async generateProblemDocument(dto: GenerateProblemDocumentDto): Promise<{ html: string }> {
    const sections = await this.callAiForSections(dto.problematica);
    const html = this.buildHtml(dto.problematica, sections);
    return { html };
  }

  private async callAiForSections(problematica: string): Promise<ProblemDocumentSections> {
    const fallback = this.buildFallbackSections(problematica);

    if (!this.openAiApiKey) {
      this.logger.warn('OPENAI_API_KEY no configurada, usando fallback.');
      return fallback;
    }

    const systemPrompt = [
      'Eres un arquitecto de TI senior con experiencia en empresas que venden celulares y financiamientos.',
      'Tu objetivo es analizar problematicas de negocio y tecnologia, y generar documentacion tecnica de alto nivel.',
      'Piensas en soluciones escalables, seguras y orientadas a microservicios o arquitecturas modernas.',
      'Consideras siempre el impacto en el negocio: ventas, cartera de clientes, cobranza, inventarios y canales digitales.',
    ].join(' ');

    const userPrompt = [
      'Analiza la siguiente problematica de una empresa que vende celulares y ofrece financiamientos:',
      '',
      `"${problematica}"`,
      '',
      'Genera una respuesta en formato JSON (sin markdown, sin bloques de codigo) con exactamente estas llaves:',
      '- problematicaDetallada: descripcion enriquecida, detallada y refinada de la problematica original (minimo 3 parrafos)',
      '- alcanceProyecto: lista de elementos que SI estan contemplados en la solucion (usa viñetas con "-")',
      '- alcanceNoConsiderado: lista de elementos que NO estan considerados en este alcance (usa viñetas con "-")',
      '- posibleSolucion: propuesta de solucion tecnica/arquitectonica detallada orientada al contexto del negocio (minimo 3 parrafos)',
      '',
      'Responde SOLO con el JSON valido. No incluyas texto adicional, no uses bloques de codigo.',
    ].join('\n');

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
          temperature: 0.4,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429 || response.status >= 500) {
          this.logger.warn(`IA no disponible (${response.status}), usando fallback.`);
          return fallback;
        }
        throw new InternalServerErrorException(
          `Error al llamar a la IA (${response.status}): ${errorText}`,
        );
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const raw = json.choices?.[0]?.message?.content?.trim();
      if (!raw) {
        this.logger.warn('Respuesta vacia de IA, usando fallback.');
        return fallback;
      }

      const parsed = this.parseAiResponse(raw);
      return parsed ?? fallback;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.warn('Error de conectividad con IA, usando fallback.');
      return fallback;
    }
  }

  private parseAiResponse(raw: string): ProblemDocumentSections | null {
    const sanitized = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(sanitized) as Partial<ProblemDocumentSections>;
      if (
        typeof parsed.problematicaDetallada !== 'string' ||
        typeof parsed.alcanceProyecto !== 'string' ||
        typeof parsed.alcanceNoConsiderado !== 'string' ||
        typeof parsed.posibleSolucion !== 'string'
      ) {
        return null;
      }
      return {
        problematicaDetallada: parsed.problematicaDetallada,
        alcanceProyecto: parsed.alcanceProyecto,
        alcanceNoConsiderado: parsed.alcanceNoConsiderado,
        posibleSolucion: parsed.posibleSolucion,
      };
    } catch {
      return null;
    }
  }

  private buildFallbackSections(problematica: string): ProblemDocumentSections {
    return {
      problematicaDetallada: [
        `La empresa enfrenta la siguiente problematica: ${problematica}`,
        'Esta situacion impacta directamente en la operacion comercial, afectando los procesos de venta de dispositivos moviles y la gestion de financiamientos.',
        'Es necesario analizar las causas raiz, evaluar el impacto en los sistemas actuales y definir una hoja de ruta para su resolucion.',
      ].join('\n\n'),
      alcanceProyecto: [
        '- Levantamiento y documentacion de la problematica identificada',
        '- Analisis de impacto en los modulos de ventas y financiamientos',
        '- Propuesta de arquitectura de solucion',
        '- Definicion de requerimientos funcionales y no funcionales',
        '- Plan de implementacion a alto nivel',
      ].join('\n'),
      alcanceNoConsiderado: [
        '- Implementacion y desarrollo de la solucion propuesta',
        '- Migracion de datos historicos',
        '- Integraciones con sistemas de terceros no mencionados',
        '- Capacitacion a usuarios finales',
        '- Soporte post-implementacion',
      ].join('\n'),
      posibleSolucion: [
        'Se propone implementar una arquitectura orientada a microservicios que permita desacoplar los modulos afectados, facilitando la escalabilidad y el mantenimiento independiente de cada componente.',
        'La solucion contempla el uso de APIs REST o GraphQL para la comunicacion entre servicios, un API Gateway para la gestion centralizada de accesos y un sistema de mensajeria asincrona para eventos criticos del negocio como aprobacion de creditos y actualizacion de inventarios.',
        'Se recomienda adoptar practicas DevOps con pipelines de CI/CD, monitoreo centralizado y una estrategia de despliegue en la nube que garantice alta disponibilidad para los canales de venta digitales y presenciales.',
      ].join('\n\n'),
    };
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private textToHtmlParagraphs(text: string): string {
    return text
      .split(/\n\n+/)
      .map((para) => {
        const trimmed = para.trim();
        if (!trimmed) return '';

        // Bullet list block
        if (trimmed.split('\n').every((line) => line.trim().startsWith('-'))) {
          const items = trimmed
            .split('\n')
            .map((line) => `<li>${this.escapeHtml(line.replace(/^-\s*/, '').trim())}</li>`)
            .join('');
          return `<ul>${items}</ul>`;
        }

        // Mixed content: some lines are bullets
        const lines = trimmed.split('\n');
        const hasAnyBullet = lines.some((l) => l.trim().startsWith('-'));
        if (hasAnyBullet) {
          const items = lines
            .filter((l) => l.trim().startsWith('-'))
            .map((l) => `<li>${this.escapeHtml(l.replace(/^-\s*/, '').trim())}</li>`)
            .join('');
          return `<ul>${items}</ul>`;
        }

        return `<p>${this.escapeHtml(trimmed).replace(/\n/g, '<br/>')}</p>`;
      })
      .filter(Boolean)
      .join('');
  }

  private buildHtml(problematicaOriginal: string, sections: ProblemDocumentSections): string {
    const now = new Date().toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Documento de Problematica</title>
  <style>
    :root {
      --primary: #1a3a5c;
      --accent: #2e7d9e;
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #d1dce8;
      --text: #1e293b;
      --muted: #64748b;
      --radius: 8px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.7;
      padding: 32px 24px;
    }
    .doc-header {
      border-bottom: 3px solid var(--primary);
      padding-bottom: 20px;
      margin-bottom: 32px;
    }
    .doc-header h1 {
      font-size: 1.75rem;
      color: var(--primary);
      font-weight: 700;
      margin-bottom: 6px;
    }
    .doc-header .meta {
      font-size: 0.85rem;
      color: var(--muted);
    }
    .original-box {
      background: #eef4fb;
      border-left: 4px solid var(--accent);
      border-radius: 0 var(--radius) var(--radius) 0;
      padding: 14px 18px;
      margin-bottom: 32px;
      font-style: italic;
      color: var(--muted);
    }
    .original-box strong {
      display: block;
      font-style: normal;
      color: var(--accent);
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 6px;
    }
    .section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      margin-bottom: 24px;
      overflow: hidden;
    }
    .section-header {
      background: var(--primary);
      color: #ffffff;
      padding: 14px 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .section-header h2 {
      font-size: 1rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .section-body {
      padding: 20px;
      outline: none;
    }
    .section-body p {
      margin-bottom: 12px;
      font-size: 0.95rem;
    }
    .section-body p:last-child { margin-bottom: 0; }
    .section-body ul {
      padding-left: 20px;
      margin-bottom: 4px;
    }
    .section-body ul li {
      margin-bottom: 6px;
      font-size: 0.95rem;
    }
    .scope-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }
    @media (max-width: 640px) {
      .scope-grid { grid-template-columns: 1fr; }
    }
    .scope-in .section-header { background: #1e6b4a; }
    .scope-out .section-header { background: #7c3d2e; }
    .doc-footer {
      text-align: center;
      font-size: 0.78rem;
      color: var(--muted);
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <div class="doc-header">
    <h1>Documento de Problematica</h1>
    <div class="meta">Generado el ${now} &nbsp;|&nbsp; Arquitectura de TI &nbsp;|&nbsp; Sector: Venta de Celulares y Financiamientos</div>
  </div>

  <div class="original-box">
    <strong>Problematica original recibida</strong>
    ${this.escapeHtml(problematicaOriginal)}
  </div>

  <div class="section">
    <div class="section-header">
      <h2>1. Problematica Detallada</h2>
    </div>
    <div class="section-body" contenteditable="true">
      ${this.textToHtmlParagraphs(sections.problematicaDetallada)}
    </div>
  </div>

  <div class="scope-grid">
    <div class="section scope-in">
      <div class="section-header">
        <h2>2. Alcance del Proyecto</h2>
      </div>
      <div class="section-body" contenteditable="true">
        ${this.textToHtmlParagraphs(sections.alcanceProyecto)}
      </div>
    </div>
    <div class="section scope-out">
      <div class="section-header">
        <h2>3. Alcance No Considerado</h2>
      </div>
      <div class="section-body" contenteditable="true">
        ${this.textToHtmlParagraphs(sections.alcanceNoConsiderado)}
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <h2>4. Posible Solucion</h2>
    </div>
    <div class="section-body" contenteditable="true">
      ${this.textToHtmlParagraphs(sections.posibleSolucion)}
    </div>
  </div>

</body>
</html>`;
  }

}

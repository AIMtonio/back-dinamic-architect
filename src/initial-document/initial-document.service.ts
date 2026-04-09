import { randomUUID } from 'crypto';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { CreateInitialDocumentDto } from './dto/create-initial-document.dto';
import * as fs from 'fs';
import {
  Document,
  FileChild,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

type ArchitectureTemplateSections = {
  introduccion: string;
  objetivo: string;
  justificacion: string;
  asIs: string;
  toBe: string;
  lenguaje?: string;
  matrizRoles?: string;
};

@Injectable()
export class InitialDocumentService {
  private readonly logger = new Logger(InitialDocumentService.name);

  private readonly templatePath = 'src/data/markdown/generar_documento_arquitectura.md';
  private readonly aiModel = process.env.ARCHITECTURE_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  private readonly aiBaseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  private readonly openAiApiKey = process.env.OPENAI_API_KEY;

  async create(createInitialDocumentDto: CreateInitialDocumentDto): Promise<{ buffer: Buffer; filename: string }> {
    const template = this.readTemplate();
    const generation = await this.generateDocumentMarkdown(createInitialDocumentDto, template);

    const sanitized = createInitialDocumentDto.proyecto
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const baseName = `arquitectura-${sanitized || 'proyecto'}-${Date.now()}`;
    const docxFilename = `${baseName}.docx`;

    const doc = new Document({
      sections: [{ children: this.markdownToWordChildren(generation.content) }],
    });
    const docxBuffer = await Packer.toBuffer(doc);

    return { buffer: docxBuffer, filename: docxFilename };
  }

  private readTemplate(): string {
    try {
      return fs.readFileSync(this.templatePath, 'utf8');
    } catch {
      throw new InternalServerErrorException(`No se pudo leer la plantilla markdown en ${this.templatePath}.`);
    }
  }

  private async generateDocumentMarkdown(
    payload: CreateInitialDocumentDto,
    template: string,
  ): Promise<{ content: string; model: string; aiError: string | null }> {
    if (!this.openAiApiKey) {
      return {
        content: this.buildFallbackDocument(payload, template),
        model: 'template-fallback',
        aiError: null,
      };
    }

    const prompt = [
      'Eres un arquitecto de software senior.',
      'Genera contenido para completar una plantilla de documento de arquitectura.',
      'Responde SOLO con JSON valido y sin markdown.',
      'El JSON debe incluir exactamente estas llaves:',
      'introduccion, objetivo, justificacion, asIs, toBe, lenguaje, matrizRoles',
      'matrizRoles debe ser una o varias filas markdown de tabla, por ejemplo: | Admin | Gestion completa |',
      'No incluyas cabeceras, no uses bloque de codigo, no anadas texto extra.',
      '',
      'Plantilla base:',
      template,
      '',
      'Datos de entrada (JSON):',
      JSON.stringify(payload, null, 2),
    ].join('\n');

    try {
      const response = await fetch(`${this.aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.openAiApiKey}`,
        },
        body: JSON.stringify({
          model: this.aiModel,
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: 'Responde solo con markdown valido y completo.',
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
            content: this.buildFallbackDocument(payload, template),
            model: 'template-fallback',
            aiError: `fallback por error IA ${response.status}`,
          };
        }

        throw new InternalServerErrorException(
          `Error al generar documento con IA (${response.status}). Detalle: ${errorText}`,
        );
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };

      const aiRawContent = json.choices?.[0]?.message?.content?.trim();
      if (!aiRawContent) {
        return {
          content: this.buildFallbackDocument(payload, template),
          model: 'template-fallback',
          aiError: 'fallback por respuesta vacia de IA',
        };
      }

      const sections = this.parseAiSections(aiRawContent);
      if (!sections) {
        return {
          content: this.buildFallbackDocument(payload, template),
          model: 'template-fallback',
          aiError: 'fallback por formato invalido de respuesta IA',
        };
      }

      const content = this.applyTemplateSections(template, payload, sections);

      return {
        content,
        model: this.aiModel,
        aiError: null,
      };
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      return {
        content: this.buildFallbackDocument(payload, template),
        model: 'template-fallback',
        aiError: 'fallback por error de conectividad con IA',
      };
    }
  }

  private buildFallbackDocument(payload: CreateInitialDocumentDto, template: string): string {
    const fallbackSections: ArchitectureTemplateSections = {
      introduccion: `Este documento define la arquitectura objetivo para ${payload.proyecto}.`,
      objetivo: `Disenar una arquitectura escalable para ${payload.proyecto} en el contexto: ${payload.contexto}.`,
      justificacion: 'La modernizacion busca resiliencia, escalabilidad horizontal y mejor trazabilidad operativa.',
      asIs: 'Estado actual: componentes monoliticos con acoplamiento alto y despliegues manuales.',
      toBe: 'Estado objetivo: arquitectura cloud-native con servicios desacoplados, CI/CD y observabilidad.',
      lenguaje: 'El documento esta redactado en español tecnico, claro y conciso.',
      matrizRoles: payload.roles.map((role) => `| ${role} | Definir permisos segun responsabilidades del rol |`).join('\n'),
    };

    return this.applyTemplateSections(template, payload, fallbackSections);
  }

  private applyTemplateSections(
    template: string,
    payload: CreateInitialDocumentDto,
    sections: ArchitectureTemplateSections,
  ): string {
    let result = template;

    const orderedValues = [
      sections.introduccion,
      sections.objetivo,
      sections.justificacion,
      sections.asIs,
      sections.toBe,
      sections.lenguaje,
    ];

    for (const value of orderedValues) {
      result = this.replaceFirst(result, '[Texto generado aquí]', value?.trim() || '');
    }

    const rolesTable = sections.matrizRoles?.trim()
      || payload.roles.map((role) => `| ${role} | Definir permisos segun responsabilidades del rol |`).join('\n')
      || '| N/A | Sin roles definidos |';

    result = result.replace('| Admin | Crear, Editar, Eliminar |\n| Usuario | Consultar |', rolesTable);
    return result;
  }

  private replaceFirst(text: string, search: string, replaceWith: string): string {
    const index = text.indexOf(search);
    if (index === -1) {
      return text;
    }

    return `${text.slice(0, index)}${replaceWith}${text.slice(index + search.length)}`;
  }

  private parseAiSections(aiRawContent: string): ArchitectureTemplateSections | null {
    const sanitized = aiRawContent
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(sanitized) as Partial<ArchitectureTemplateSections>;

      if (
        typeof parsed.introduccion !== 'string'
        || typeof parsed.objetivo !== 'string'
        || typeof parsed.justificacion !== 'string'
        || typeof parsed.asIs !== 'string'
        || typeof parsed.toBe !== 'string'
        || typeof parsed.lenguaje !== 'string'

      ) {
        return null;
      }

      return {
        introduccion: parsed.introduccion,
        objetivo: parsed.objetivo,
        justificacion: parsed.justificacion,
        asIs: parsed.asIs,
        toBe: parsed.toBe,
        lenguaje: parsed.lenguaje,
        matrizRoles: typeof parsed.matrizRoles === 'string' ? parsed.matrizRoles : undefined,
      };
    } catch {
      return null;
    }
  }



  private markdownToWordChildren(markdownContent: string): FileChild[] {
    const lines = markdownContent.split(/\r?\n/);
    const children: FileChild[] = [];
    const paragraphsBuffer: string[] = [];

    const flushParagraphBuffer = () => {
      if (paragraphsBuffer.length === 0) {
        return;
      }

      const text = paragraphsBuffer.join(' ').trim();
      if (text.length > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun(text)],
            spacing: { after: 240 },
          }),
        );
      }

      paragraphsBuffer.length = 0;
    };

    let i = 0;
    while (i < lines.length) {
      const rawLine = lines[i];
      const line = rawLine.trim();

      if (line.length === 0) {
        flushParagraphBuffer();
        i += 1;
        continue;
      }

      if (line.startsWith('# ')) {
        flushParagraphBuffer();
        children.push(
          new Paragraph({
            text: line.replace(/^#\s+/, ''),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 120, after: 200 },
          }),
        );
        i += 1;
        continue;
      }

      if (line.startsWith('## ')) {
        flushParagraphBuffer();
        children.push(
          new Paragraph({
            text: line.replace(/^##\s+/, ''),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 120, after: 180 },
          }),
        );
        i += 1;
        continue;
      }

      if (line.startsWith('|')) {
        flushParagraphBuffer();

        const tableRows: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableRows.push(lines[i].trim());
          i += 1;
        }

        const parsedRows = tableRows
          .filter((row) => !/^\|[-\s|]+\|$/.test(row))
          .map((row) => row.split('|').map((cell) => cell.trim()).filter((cell) => cell.length > 0));

        if (parsedRows.length > 0) {
          children.push(this.buildWordTable(parsedRows));
          children.push(new Paragraph({ text: '' }));
        }

        continue;
      }

      paragraphsBuffer.push(line);
      i += 1;
    }

    flushParagraphBuffer();

    if (children.length === 0) {
      children.push(new Paragraph('Documento sin contenido'));
    }

    return children;
  }

  private buildWordTable(rows: string[][]): Table {
    const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0);

    const tableRows = rows.map((row, rowIndex) => {
      const cells = Array.from({ length: maxColumns }).map((_, colIndex) => {
        const value = row[colIndex] || '';
        return new TableCell({
          width: { size: 100 / maxColumns, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: value,
                  bold: rowIndex === 0,
                }),
              ],
            }),
          ],
        });
      });

      return new TableRow({ children: cells });
    });

    return new Table({
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      rows: tableRows,
    });
  }

  // ─── DDA ARQ TI TEMPLATE ────────────────────────────────────────────────────

  private generateUniqueId(): string {
    return randomUUID().replace(/-/g, '');
  }

  async generateDdaTemplate(): Promise<{ buffer: Buffer; filename: string }> {
    const filename = `dda-arq-ti-${Date.now()}.docx`;
    const doc = this.buildDdaWordDoc();
    const buffer = await Packer.toBuffer(doc);
    return { buffer, filename };
  }

  private ddaH1(text: string): Paragraph {
    return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 } });
  }

  private ddaH2(text: string): Paragraph {
    return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } });
  }

  private ddaH3(text: string): Paragraph {
    return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 80 } });
  }

  private ddaPara(text: string): Paragraph {
    return new Paragraph({ children: [new TextRun(text)], spacing: { after: 200 } });
  }

  private ddaSpacer(): Paragraph {
    return new Paragraph({ text: '' });
  }

  private buildDdaTable(rows: string[][], headerRow = true): Table {
    const maxCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const tableRows = rows.map((row, rowIndex) => {
      const cells = Array.from({ length: maxCols }).map((_, colIndex) => {
        const value = row[colIndex] ?? '';
        return new TableCell({
          width: { size: Math.floor(100 / maxCols), type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [new TextRun({ text: value, bold: headerRow && rowIndex === 0 })],
            }),
          ],
        });
      });
      return new TableRow({ children: cells });
    });
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows });
  }

  private buildDdaWordDoc(): Document {
    const children: FileChild[] = [

      // ─── PORTADA ──────────────────────────────────────────────────────────
      new Paragraph({
        children: [new TextRun({ text: 'Integración Enefevo', bold: true, size: 56 })],
        spacing: { before: 480, after: 240 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Arquitectura TI', bold: true, size: 36 })],
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'TRANSFORMACIÓN DIGITAL', bold: true, size: 28 })],
        spacing: { after: 480 },
      }),
      this.buildDdaTable([
        ['Arquitecto asignado', 'Verónica Cordero'],
        ['Analista de negocio', 'Camila Perez'],
        ['Project Manager', 'Admon. y Finanzas'],
        ['Área de negocio', "Andrés Osvaldo Rosado D'Arcangelo"],
        ['Solicitante', "Andrés Osvaldo Rosado D'Arcangelo"],
        ['Versión del documento', '1.0'],
        ['Estatus del documento', 'Draft'],
        ['Tipo de proyecto', 'Requerimiento'],
        ['Fecha', '11/04/2026'],
        ['Prioridad', 'Alta'],
        ['Clasificación de información', 'Interna'],
      ], false),
      this.ddaSpacer(),

      // ─── 1. INTRODUCCIÓN ──────────────────────────────────────────────────
      this.ddaH1('Introducción'),
      this.ddaPara(
        'El presente documento tiene como finalidad presentar el trabajo de arquitectura mencionados en el mismo bajo la metodología TOGAF, considerando la información entregada a través del requerimiento proveniente de la oficina de PMO.',
      ),
      this.ddaSpacer(),

      // ─── 2. CONTROL DE CAMBIOS ────────────────────────────────────────────
      this.ddaH1('Control de cambios'),
      this.buildDdaTable([
        ['Versión', 'Fecha', 'Autor', 'Afectación', 'Comentarios'],
        ['1.0', '11/04/2026', 'Antonio Alonso', 'Inicial', 'Versión inicial del requerimiento de arquitectura.'],
      ]),
      this.ddaSpacer(),

      // ─── 3. DETALLE DEL PROYECTO ──────────────────────────────────────────
      this.ddaH1('Detalle del proyecto'),
      this.buildDdaTable([
        ['Nombre del proyecto', 'afin025-me25 Integración Enefevo'],
        ['PMO', 'Camila Perez'],
        ['Solicitante', "Andrés Osvaldo Rosado D'Arcangelo"],
        ['Área del solicitante', 'Administración y Finanzas'],
        ['Arquitecto', 'Antonio Alonso'],
        ['Sponsor del proyecto', 'Aaron Antonio Suarez'],
        ['Stakeholder del proyecto', 'Aaron Antonio Suarez'],
        ['Prioridad', 'Alta'],
        ['Riesgo', 'Medio'],
        ['Clasificación de información', 'Interna'],
        ['Versión del documento', '1.0'],
        ['Tipo de proyecto', 'Requerimiento'],
        ['Tipo de DDA', 'Nuevo DDA'],
      ], false),
      this.ddaSpacer(),

      // ─── 4. ÁREAS DE NEGOCIO CONSIDERADAS ────────────────────────────────
      this.ddaH1('Áreas de negocio consideradas'),
      this.buildDdaTable([
        ['Área'],
        ['Administración y Finanzas'],
        ['Experiencia de Clientes'],
        ['Cobranza'],
        ['Transformación Digital'],
      ]),
      this.ddaSpacer(),

      // ─── 5. ÁREAS DE DESARROLLO CONSIDERADAS ─────────────────────────────
      this.ddaH1('Áreas de desarrollo consideradas'),
      this.buildDdaTable([
        ['Área', 'Estatus'],
        ['UX/UI', 'X'],
        ['Front', 'X'],
        ['Back', 'X'],
        ['Middleware', 'X'],
        ['SAP', 'No'],
        ['Mobile IOS/Android', 'X'],
        ['SalesForce', 'X'],
        ['SAG', 'X'],
      ]),
      this.ddaSpacer(),

      // ─── 6. JUSTIFICACIÓN DEL PROYECTO ───────────────────────────────────
      this.ddaH1('Justificación del proyecto'),
      this.buildDdaTable([
        ['Funcionalidad', 'Comentarios'],
        ['App Macropay', 'En la opción de pago con otras tiendas se considera el consumo para la referencia de Enefevo.'],
        ['SAG', 'En la opción de generación de referencia se considera el consumo para la referencia de Enefevo.'],
        ['Chatbot', 'En la opción de pago con otras tiendas se considera el consumo para la referencia de Enefevo.'],
        ['Salesforce', 'En la opción de Referencia OpenPay considera el consumo para la referencia de Enefevo.'],
        ['Link de pagos', 'En la opción de pago con otras tiendas de conveniencia se considera el consumo para la referencia de Enefevo.'],
        ['MPF y PF', 'En el recibo de pago se considera el consumo para la referencia de Enefevo remplazando el consumo actual de Willys.'],
      ]),
      this.ddaSpacer(),

      // ─── 7. FUNCIONALIDADES CONSIDERADAS ─────────────────────────────────
      this.ddaH1('Funcionalidades consideradas'),
      this.ddaPara('[Ver diagrama adjunto]'),
      this.ddaSpacer(),

      // ─── 8. ARQUITECTURA EMPRESARIAL ─────────────────────────────────────
      this.ddaH1('Arquitectura empresarial'),
      this.ddaPara('[Ver Ilustración 2: Arquitectura empresarial]'),
      this.ddaSpacer(),

      // ─── 9. ALCANCE DEL PROYECTO ─────────────────────────────────────────
      this.ddaH1('Alcance del proyecto'),
      this.ddaH2('Dentro del alcance'),
      this.ddaPara('[Completar según requerimiento]'),
      this.ddaH2('No considerado en el alcance'),
      this.ddaPara('[Completar según requerimiento]'),
      this.ddaSpacer(),

      // ─── 10. AS IS ────────────────────────────────────────────────────────
      this.ddaH1('As Is'),
      this.ddaPara('[Ver Ilustración 3: Arquitectura As Is]'),
      this.ddaSpacer(),

      // ─── 11. TO BE ────────────────────────────────────────────────────────
      this.ddaH1('To Be'),
      this.ddaPara('[Ver Ilustración 4: Diagrama To Be]'),
      this.ddaSpacer(),

      this.ddaH2('Descripción de propuesta de solución'),
      this.buildDdaTable([
        ['Tipo', 'Componente', 'Responsabilidad'],
        ['Canal', 'App / Portal / Salesforce / Chatbot / SAG', 'Iniciar solicitud'],
        ['Backend', 'Servicios intermedios', 'Validación y orquestación'],
        ['Middleware', 'Midd-referencia-enefevo', 'Integración con Enefevo'],
        ['Externo', 'Proveedor Enefevo', 'Generación de referencia'],
      ]),
      this.ddaSpacer(),

      this.ddaH2('Diagramas de contexto del proyecto'),

      this.ddaH3('Diagrama de Secuencia: Inicio Aplicación de Cambalache PF'),
      this.ddaPara('[Ver Ilustración 7: Diagrama de flujo: Aplicación MPF Cambalache]'),
      this.ddaSpacer(),

      this.ddaH3('Volumetría y requerimientos considerados en la solución'),
      this.buildDdaTable([
        ['Descripción', 'Detalle'],
        ['Número de usuarios que usarán el aplicativo (aproximación)', '800 usuarios aproximadamente'],
        ['Número de usuario concurrentes (usuarios conectados al mismo tiempo)', '500 usuarios aproximadamente'],
        ['Tipo de usuarios que usarán el aplicativo', 'Internos'],
        ['Horario de uso del aplicativo', '8 am. A 11pm'],
        ['Clasificación de información', 'Interna'],
        ['Contiene datos sensibles (INE, cuentas de banco, etc.)', 'No'],
        ['Detalle de datos sensibles (si aplica)', 'N/A'],
        ['Criticidad del aplicativo', 'Alta'],
        ['Conexión a otros aplicativos', 'Si'],
        ['Utilizará carga de archivos', 'Si'],
        ['Tipo de documento a cargar (foto, video, PDF, etc.)', 'Si'],
        ['Utilizará descarga de archivos', 'N/A'],
        ['Tipo de documento para descarga (foto, video, PDF, etc.)', 'N/A'],
        ['Requiere de un dominio', 'N/A'],
        ['Colocar el dominio a ocupar (si aplica)', 'N/A'],
        ['La aplicación se utilizará en dispositivos móviles', 'No'],
      ]),
      this.ddaSpacer(),

      this.ddaH3('Componentes por considerar para pruebas de performance'),
      this.buildDdaTable([
        ['Nombre', 'Tipo de componente', 'Consideraciones'],
        ['Aplicación de Abonos', 'Store Base de datos', 'Ejecución de 80 mil abonos al día.'],
      ]),
      this.ddaSpacer(),

      this.ddaH3('Plataformas afectadas consideradas'),
      this.buildDdaTable([
        ['Aplicación', 'Descripción', 'Comentarios'],
        ['MPF', 'Plataforma CRM', 'Conexión a plataforma para despliegue de información'],
        ['PF', 'Intranet Garantias', ''],
        ['POS', '', ''],
        ['ADB', '', ''],
      ]),
      this.ddaSpacer(),

      this.ddaH3('Diagrama de componentes'),
      this.ddaPara('[Ver Ilustración 35: Diagrama de secuencia ADB Macropay App Escritorio]'),
      this.ddaSpacer(),

      this.ddaH3('Arquitectura de datos'),
      this.ddaPara('En el siguiente esquema, se muestra la arquitectura de datos considerada en este proyecto, para mayor detalle, revisar el documento anexo.'),
      this.ddaPara('[Ver Ilustración 36: Diagrama de ER Cambalache]'),
      this.ddaSpacer(),

      this.ddaH3('Tablas consideradas'),
      this.ddaPara('A continuación, se muestra el esquema de tablas consideradas para este proyecto, consideran las siguientes bases de datos:'),
      this.ddaSpacer(),

      this.ddaH3('Roles y perfiles iniciales considerados para el aplicativo'),
      this.ddaPara('[Ver Ilustración 37: Ilustración de roles y perfiles iniciales considerados para el aplicativo]'),
      this.ddaSpacer(),

      this.ddaH3('Interfaces / Jobs'),
      this.buildDdaTable([
        ['ID', 'Nombre de la Interfaz', 'Descripción', 'Tipo de Interfaz (Manual / Online / Batch)', 'Implementación de interfaz', 'Frecuencia', 'Aplicación Origen', 'Aplicación Destino'],
        ['1', '', '', '', '', '', '', ''],
        ['2', '', '', '', '', '', '', ''],
        ['3', '', '', '', '', '', '', ''],
        ['4', '', '', '', '', '', '', ''],
      ]),
      this.ddaSpacer(),

      this.ddaH2('Tabla de costos'),
      this.ddaPara('[Ver Ilustración 39: Tabla de costos]'),
      this.ddaSpacer(),

      this.ddaH2('Tags'),
      this.buildDdaTable([
        ['Tag', 'Valor', 'Descripción'],
        ['', '', ''],
      ]),
      this.ddaSpacer(),

      this.ddaH2('Apartado de seguridad'),
      this.ddaPara(
        'Para él envió de información en tránsito al componente público se considera la implementación del servicio de AWS KMS para el encriptado de los request body evitando que la información viaje en texto plano y cuenten con un cifrado simétrico y asimétrico, utilizando algoritmos aprobados por FIPS como AES y RSA.',
      ),
      this.ddaPara('Se consideran certificados SSL y TLS 1.2 en cada servicio implementado y su mapeo en el WAF.'),
      this.ddaSpacer(),

      this.ddaH2('Anexos al DDA'),
      this.ddaPara('[Agregar anexos relevantes al documento]'),
    ];

    return new Document({ sections: [{ children }] });
  }
}

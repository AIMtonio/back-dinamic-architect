import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import { basename, resolve } from 'path';

type ArchimateElement = {
  identifier: string;
  name: string;
  xsiType: string;
};

type ArchimateRelationship = {
  identifier: string;
  source: string;
  target: string;
  xsiType: string;
};

type ViewNode = {
  identifier: string;
  elementRef: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fillColor: { r: number; g: number; b: number };
};

@Injectable()
export class ArchimateService {
  private readonly logger = new Logger(ArchimateService.name);


  private readonly defaultInputExcelPath = process.env.ARCHIMATE_INPUT_EXCEL_PATH || 'src/data/input/business_actors.xlsx';
  private readonly defaultOutputDir = process.env.ARCHIMATE_OUTPUT_DIR || 'src/data/output';
  private readonly defaultOutputFile = process.env.ARCHIMATE_DEFAULT_OUTPUT_FILE || 'archimate-model.xml';

  private generateUniqueId(): string {
    return randomUUID().replace(/-/g, '');
  }

  private toXmlElement(element: ArchimateElement): string {
    return `
            <element identifier="${element.identifier}" xsi:type="${element.xsiType}">
              <name xml:lang="es">${escapeXml(element.name)}</name>
            </element>`;
  }

  private toXmlRelationship(relationship: ArchimateRelationship): string {
    return `
          <relationship identifier="${relationship.identifier}" source="${relationship.source}" target="${relationship.target}" xsi:type="${relationship.xsiType}" />`;
  }

  private createViewNodes(
    elements: ArchimateElement[],
    startX: number,
    startY: number,
    height: number,
    fillColor: { r: number; g: number; b: number },
  ): ViewNode[] {
    const gap = 16;
    let currentX = startX;
    return elements.map((element) => {
      const w = Math.max(140, Math.min(500, element.name.length * 8 + 32));
      const node: ViewNode = {
        identifier: `id-${this.generateUniqueId()}`,
        elementRef: element.identifier,
        x: currentX,
        y: startY,
        w,
        h: height,
        fillColor,
      };
      currentX += w + gap;
      return node;
    });
  }

  private toXmlViewNode(node: ViewNode): string {
    return `
            <node identifier="${node.identifier}" elementRef="${node.elementRef}" xsi:type="Element" x="${node.x}" y="${node.y}" w="${node.w}" h="${node.h}">
              <style>
                <fillColor r="${node.fillColor.r}" g="${node.fillColor.g}" b="${node.fillColor.b}" a="100" />
                <lineColor r="92" g="92" b="92" a="100" />
                <font name="Lucida Grande" size="12">
                  <color r="0" g="0" b="0" />
                </font>
              </style>
            </node>`;
  }

  private toXmlViewConnection(
    relationship: ArchimateRelationship,
    sourceNodeId: string,
    targetNodeId: string,
  ): string {
    return `
          <connection identifier="id-${this.generateUniqueId()}" relationshipRef="${relationship.identifier}" xsi:type="Relationship" source="${sourceNodeId}" target="${targetNodeId}">
            <style>
              <lineColor r="0" g="0" b="0" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
          </connection>`;
  }

  private normalizeToken(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s_-]/g, '')
      .toLowerCase();
  }

  private findSheetName(workbook: XLSX.WorkBook, aliases: string[]): string | null {
    const normalizedToOriginal = new Map<string, string>();
    workbook.SheetNames.forEach((sheetName) => {
      normalizedToOriginal.set(this.normalizeToken(sheetName), sheetName);
    });

    for (const alias of aliases) {
      const found = normalizedToOriginal.get(this.normalizeToken(alias));
      if (found) {
        return found;
      }
    }

    return null;
  }

  private getRowValue(row: Record<string, unknown>, aliases: string[]): unknown {
    const normalizedToOriginal = new Map<string, string>();
    Object.keys(row).forEach((key) => {
      normalizedToOriginal.set(this.normalizeToken(key), key);
    });

    for (const alias of aliases) {
      const realKey = normalizedToOriginal.get(this.normalizeToken(alias));
      if (realKey) {
        return row[realKey];
      }
    }

    return undefined;
  }

  private parseElementsFromSheet(
    workbook: XLSX.WorkBook,
    sheetAliases: string[],
    xsiType: string,
    nameAliases: string[] = [],
  ): ArchimateElement[] {
    const sheetName = this.findSheetName(workbook, sheetAliases);
    if (!sheetName) {
      return [];
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return [];
    }

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const parsedRows = rows
      .map((row) => {
        const rawName = this.getRowValue(
          row,
          ['name', 'nombre', 'title', 'titulo', 'elementname', ...nameAliases],
        );
        const name = String(rawName ?? '').trim();
        if (!name) {
          return null;
        }

        const rawIdValue = this.getRowValue(row, ['id', 'identifier', 'identificador']);
        const rawId = String(rawIdValue ?? '').trim();
        const normalizedId = rawId ? `id-${rawId.replace(/^id-/, '')}` : `id-${this.generateUniqueId()}`;

        return {
          identifier: normalizedId,
          name,
          xsiType,
        };
      })
      .filter((item): item is ArchimateElement => item !== null);

    if (parsedRows.length > 0) {
      return parsedRows;
    }

    const headerTokens = new Set(
      ['name', 'nombre', 'title', 'titulo', 'elementname', ...nameAliases].map((alias) => this.normalizeToken(alias)),
    );

    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { defval: '', header: 1 });

    return rawRows
      .map((row) => row.find((cell) => String(cell ?? '').trim()))
      .map((cell) => String(cell ?? '').trim())
      .filter((value) => value.length > 0)
      .filter((value) => !headerTokens.has(this.normalizeToken(value)))
      .map((name) => ({
        identifier: `id-${this.generateUniqueId()}`,
        name,
        xsiType,
      }));
  }

  private parseRelationshipsFromSheet(
    workbook: XLSX.WorkBook,
    elements: ArchimateElement[],
  ): ArchimateRelationship[] {
    const relationshipSheetName = this.findSheetName(workbook, ['Relationships', 'Relaciones', 'Relationship']);
    if (!relationshipSheetName) {
      return [];
    }

    const sheet = workbook.Sheets[relationshipSheetName];
    if (!sheet) {
      return [];
    }

    const byName = new Map<string, string>();
    const byId = new Map<string, string>();

    elements.forEach((element) => {
      byName.set(element.name.toLowerCase(), element.identifier);
      byId.set(element.identifier, element.identifier);
      byId.set(element.identifier.replace(/^id-/, ''), element.identifier);
    });

    const resolveElementRef = (value: unknown): string | null => {
      const raw = String(value ?? '').trim();
      if (!raw) {
        return null;
      }

      if (byId.has(raw)) {
        return byId.get(raw) ?? null;
      }

      const normalized = raw.startsWith('id-') ? raw : `id-${raw}`;
      if (byId.has(normalized)) {
        return byId.get(normalized) ?? null;
      }

      return byName.get(raw.toLowerCase()) ?? null;
    };

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    return rows
      .map((row) => {
        const source = resolveElementRef(this.getRowValue(row, ['source', 'origen', 'from']));
        const target = resolveElementRef(this.getRowValue(row, ['target', 'destino', 'to']));
        if (!source || !target) {
          return null;
        }

        const rawId = String(this.getRowValue(row, ['id', 'identifier', 'identificador']) ?? '').trim();
        const identifier = rawId ? `id-${rawId.replace(/^id-/, '')}` : `id-${this.generateUniqueId()}`;
        const rawType = this.getRowValue(row, ['type', 'relationshipType', 'tipo', 'tiporelacion']);
        const xsiType = String(rawType || 'Association').trim() || 'Association';

        return {
          identifier,
          source,
          target,
          xsiType,
        };
      })
      .filter((item): item is ArchimateRelationship => item !== null);
  }

  private parseElementsFromJson(
    data: Record<string, unknown>,
    aliases: string[],
    xsiType: string,
    nameAliases: string[] = [],
  ): ArchimateElement[] {
    const rawValue = this.getRowValue(data, aliases);
    if (!Array.isArray(rawValue)) {
      return [];
    }

    return rawValue
      .map((item) => {
        if (typeof item === 'string' || typeof item === 'number') {
          const name = String(item).trim();
          if (!name) {
            return null;
          }

          return {
            identifier: `id-${this.generateUniqueId()}`,
            name,
            xsiType,
          };
        }

        if (!item || typeof item !== 'object') {
          return null;
        }

        const itemRecord = item as Record<string, unknown>;
        const rawName = this.getRowValue(
          itemRecord,
          ['name', 'nombre', 'title', 'titulo', 'elementname', ...nameAliases],
        );
        const name = String(rawName ?? '').trim();
        if (!name) {
          return null;
        }

        const rawIdValue = this.getRowValue(itemRecord, ['id', 'identifier', 'identificador']);
        const rawId = String(rawIdValue ?? '').trim();
        const identifier = rawId ? `id-${rawId.replace(/^id-/, '')}` : `id-${this.generateUniqueId()}`;

        return {
          identifier,
          name,
          xsiType,
        };
      })
      .filter((item): item is ArchimateElement => item !== null);
  }

  private resolveOutputPath(outPath: string): string {
    if (typeof outPath !== 'string' || outPath.trim().length === 0) {
      throw new BadRequestException('El parámetro out debe ser un string no vacío.');
    }

    const hasPathSeparator = outPath.includes('/') || outPath.includes('\\');
    const fullPath = hasPathSeparator ? resolve(outPath) : resolve(this.defaultOutputDir, outPath);
    const allowedBase = resolve(this.defaultOutputDir);

    if (!fullPath.startsWith(allowedBase)) {
      throw new BadRequestException('Ruta de salida no permitida.');
    }

    return fullPath;
  }

  private buildValidationSummary(
    source: 'excel' | 'json',
    courses: ArchimateElement[],
    principles: ArchimateElement[],
    goals: ArchimateElement[],
    drivers: ArchimateElement[],
    businessActors: ArchimateElement[],
    outPath: string,
  ) {
    const normalizedCounts = {
      courseOfAction: courses.length || 1,
      businessActor: businessActors.length || 1,
      principle: principles.length || 1,
      goal: goals.length || 1,
      driver: drivers.length || 1,
    };

    return {
      message: 'Validacion de ArchiMate exitosa (dry-run).',
      dryRun: true,
      source,
      outputPath: this.resolveOutputPath(outPath),
      counts: {
        parsed: {
          courseOfAction: courses.length,
          businessActor: businessActors.length,
          principle: principles.length,
          goal: goals.length,
          driver: drivers.length,
        },
        normalized: normalizedCounts,
      },
    };
  }

  private async buildAndSaveReport(
    courses: ArchimateElement[],
    principles: ArchimateElement[],
    goals: ArchimateElement[],
    drivers: ArchimateElement[],
    businessActors: ArchimateElement[],
    outPath: string,
  ) {
    const defaultCourse: ArchimateElement = {
      identifier: 'id-243de2b263264cc0bdf2dcb1b386fac7',
      name: 'Texto de ejemplo',
      xsiType: 'CourseOfAction',
    };

    const defaultPrinciple: ArchimateElement = {
      identifier: 'id-fa3f6e20a7fa40deb769cda66e5e64d2',
      name: 'Texto de ejemplo',
      xsiType: 'Principle',
    };

    const defaultGoal: ArchimateElement = {
      identifier: 'id-345f2f11a032422084d793a3e2ba027e',
      name: 'Texto de ejemplo',
      xsiType: 'Goal',
    };

    const defaultDriver: ArchimateElement = {
      identifier: 'id-cd749b32c56d4054a6d1b9231d41c974',
      name: 'Texto de ejemplo',
      xsiType: 'Driver',
    };

    const defaultBusinessActor: ArchimateElement = {
      identifier: `id-${this.generateUniqueId()}`,
      name: 'Actor de negocio',
      xsiType: 'BusinessActor',
    };

    const normalizedCourses = courses.length ? courses : [defaultCourse];
    const normalizedPrinciples = principles.length ? principles : [defaultPrinciple];
    const normalizedGoals = goals.length ? goals : [defaultGoal];
    const normalizedDrivers = drivers.length ? drivers : [defaultDriver];
    const normalizedBusinessActors = businessActors.length ? businessActors : [defaultBusinessActor];

    const allElements = [
      ...normalizedCourses,
      ...normalizedBusinessActors,
      ...normalizedPrinciples,
      ...normalizedGoals,
      ...normalizedDrivers,
    ];

    const elementsXml = allElements.map((element) => this.toXmlElement(element)).join('');

    const strategyOrgItems = normalizedCourses
      .map((item) => `\n            <item identifierRef="${item.identifier}" />`)
      .join('');

    const businessOrgItems = normalizedBusinessActors
      .map((item) => `\n            <item identifierRef="${item.identifier}" />`)
      .join('');

    const motivationOrgItems = [...normalizedPrinciples, ...normalizedGoals, ...normalizedDrivers]
      .map((item) => `\n            <item identifierRef="${item.identifier}" />`)
      .join('');

    const cX = 96;
    const cLPad = 16;
    const cRPad = 16;
    const cTPad = 50;
    const cBPad = 20;
    const cGap = 24;
    const nodeGap = 16;

    const calcContainerW = (nodes: ViewNode[]) => {
      if (!nodes.length) return 300;
      const nodesW = nodes.reduce((s, n) => s + n.w, 0);
      return cLPad + nodesW + (nodes.length - 1) * nodeGap + cRPad;
    };

    const baNodeH = 55, drNodeH = 40, goNodeH = 49, prNodeH = 55, coNodeH = 55;
    const baContH = cTPad + baNodeH + cBPad;
    const drContH = cTPad + drNodeH + cBPad;
    const goContH = cTPad + goNodeH + cBPad;
    const prContH = cTPad + prNodeH + cBPad;
    const coContH = cTPad + coNodeH + cBPad;

    const baY = 24;
    const drY = baY + baContH + cGap;
    const goY = drY + drContH + cGap;
    const prY = goY + goContH + cGap;
    const coY = prY + prContH + cGap;

    const businessActorNodes = this.createViewNodes(
      normalizedBusinessActors,
      cX + cLPad,
      baY + cTPad,
      baNodeH,
      { r: 255, g: 255, b: 181 },
    );
    const principleNodes = this.createViewNodes(
      normalizedPrinciples,
      cX + cLPad,
      prY + cTPad,
      prNodeH,
      { r: 204, g: 204, b: 255 },
    );
    const goalNodes = this.createViewNodes(
      normalizedGoals,
      cX + cLPad,
      goY + cTPad,
      goNodeH,
      { r: 204, g: 204, b: 255 },
    );
    const driverNodes = this.createViewNodes(
      normalizedDrivers,
      cX + cLPad,
      drY + cTPad,
      drNodeH,
      { r: 204, g: 204, b: 255 },
    );
    const courseNodes = this.createViewNodes(
      normalizedCourses,
      cX + cLPad,
      coY + cTPad,
      coNodeH,
      { r: 245, g: 222, b: 170 },
    );

    const baContW = calcContainerW(businessActorNodes);
    const drContW = calcContainerW(driverNodes);
    const goContW = calcContainerW(goalNodes);
    const prContW = calcContainerW(principleNodes);
    const coContW = calcContainerW(courseNodes);

    const businessActorNodesXml = businessActorNodes.map((node) => this.toXmlViewNode(node)).join('');
    const principleNodesXml = principleNodes.map((node) => this.toXmlViewNode(node)).join('');
    const goalNodesXml = goalNodes.map((node) => this.toXmlViewNode(node)).join('');
    const driverNodesXml = driverNodes.map((node) => this.toXmlViewNode(node)).join('');
    const courseNodesXml = courseNodes.map((node) => this.toXmlViewNode(node)).join('');

    const header = `
        <model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" 
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
          xsi:schemaLocation="http://www.opengroup.org/xsd/archimate/3.0/ 
          http://www.opengroup.org/xsd/archimate/3.1/archimate3_Diagram.xsd" 
            identifier="id-d3f201552bc044d7bfb89d35b5819c3e">`;

    const body = `
      <name xml:lang="es">Diagrama Empresarial</name>
        <elements>
          ${elementsXml}
        </elements>
        <organizations>
          <item>
            <label xml:lang="es">Strategy</label>
            ${strategyOrgItems}
          </item>
          <item>
            <label xml:lang="es">Business</label>
            ${businessOrgItems}
          </item>
          <item>
            <label xml:lang="es">Motivation</label>
            ${motivationOrgItems}
          </item>
          <item>
            <label xml:lang="es">Views</label>
            <item identifierRef="id-7598903c01d3468eae229cdf897ae17f" />
          </item>
        </organizations>`;

    const views = `
    <views>
      <diagrams>
        <view identifier="id-7598903c01d3468eae229cdf897ae17f" xsi:type="Diagram">
          <name xml:lang="es">Diagrama Empresarial</name>
          <node identifier="id-31e2edb99faf4a369aacdb19e00e6d1e" x="${cX}" y="${baY}" w="${baContW}" h="${baContH}" xsi:type="Container">
            <label xml:lang="es">Involucrados</label>
            <style>
              <fillColor r="210" g="215" b="215" a="100" />
              <lineColor r="92" g="92" b="92" a="100" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
            ${businessActorNodesXml}
          </node>
          <node identifier="id-1e0895b287ad4c1b815206b33740fbfa" x="${cX}" y="${prY}" w="${prContW}" h="${prContH}" xsi:type="Container">
            <label xml:lang="es">Principales Resultados Esperados</label>
            <style>
              <fillColor r="210" g="215" b="215" a="100" />
              <lineColor r="92" g="92" b="92" a="100" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
            ${principleNodesXml}
          </node>
          <node identifier="id-22e7390f894b4786bbd41027156eafb9" x="${cX}" y="${goY}" w="${goContW}" h="${goContH}" xsi:type="Container">
            <label xml:lang="es">Objetivos a lograr</label>
            <style>
              <fillColor r="210" g="215" b="215" a="100" />
              <lineColor r="92" g="92" b="92" a="100" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
            ${goalNodesXml}
          </node>
          <node identifier="id-971fbe3c963944e68b4355fa2ff4440b" x="${cX}" y="${drY}" w="${drContW}" h="${drContH}" xsi:type="Container">
            <label xml:lang="es">Drivers</label>
            <style>
              <fillColor r="210" g="215" b="215" a="100" />
              <lineColor r="92" g="92" b="92" a="100" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
            ${driverNodesXml}
          </node>
          <node identifier="id-6a27e8ff32d34fbb8fecfe6f754351ce" x="${cX}" y="${coY}" w="${coContW}" h="${coContH}" xsi:type="Container">
            <label xml:lang="es">Planes de Acción</label>
            <style>
              <fillColor r="210" g="215" b="215" a="100" />
              <lineColor r="92" g="92" b="92" a="100" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
            ${courseNodesXml}
          </node>
        </view>`;

    const footer = `
          </diagrams>
        </views>
      </model>`;

    const xml = header + body + views + footer;

    const filename = basename(outPath) || 'archimate-model.xml';
    const buffer = Buffer.from(xml, 'utf8');

    return { buffer, filename };
  }

  async generateReport(filePath?: string, outPath = this.defaultOutputFile) {
    this.logger.log('Generating ArchiMate report...');

    const inputPath = filePath ?? this.defaultInputExcelPath;
    if (!inputPath.endsWith('.xlsx')) {
      throw new BadRequestException('El archivo de entrada debe tener extensión .xlsx.');
    }

    if (!fs.existsSync(inputPath)) {
      throw new NotFoundException(`El archivo ${inputPath} no existe.`);
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.readFile(inputPath);
    } catch {
      throw new BadRequestException(`No se pudo leer el archivo Excel ${inputPath}.`);
    }

    this.logger.log(`Excel file: ${inputPath}`);
    this.logger.log(`Sheets detected: ${workbook.SheetNames.join(', ')}`);

    const coursesFromCourseSheet = this.parseElementsFromSheet(
      workbook,
      ['CourseOfActions', 'Course Of Actions', 'CourseOfAction', 'Course Of Action', 'Courses'],
      'CourseOfAction',
      ['courseofaction', 'courseofactions'],
    );
    const courses = [...coursesFromCourseSheet];

    const principles = this.parseElementsFromSheet(
      workbook,
      ['Principles', 'Principle', 'Principios', 'Principio'],
      'Principle',
      ['principle', 'principles', 'result', 'results', 'resultado', 'resultados'],
    );
    const goals = this.parseElementsFromSheet(
      workbook,
      ['Goals', 'Goal', 'Objetivos', 'Objetivo'],
      'Goal',
      ['goal', 'goals', 'objetivo', 'objetivos'],
    );
    const drivers = this.parseElementsFromSheet(
      workbook,
      ['Drivers', 'Driver', 'Impulsores', 'Impulsor'],
      'Driver',
      ['driver', 'drivers', 'impulsor', 'impulsores'],
    );
    const businessActors = this.parseElementsFromSheet(
      workbook,
      ['BusinessActors', 'Business Actor', 'Business Actors', 'ActoresNegocio', 'Actores de Negocio'],
      'BusinessActor',
      ['businessactor', 'businessactors', 'actor', 'actors', 'actordenegocio', 'actoresdenegocio'],
    );

    this.logger.log(`Rows loaded -> CourseOfAction total: ${courses.length}, BusinessActor: ${businessActors.length}, Principle: ${principles.length}, Goal: ${goals.length}, Driver: ${drivers.length}`);

    try {
      return this.buildAndSaveReport(courses, principles, goals, drivers, businessActors, outPath);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Error interno al generar el reporte ArchiMate desde Excel.');
    }
  }

  async validateReportFromExcel(filePath?: string, outPath = this.defaultOutputFile) {
    const inputPath = filePath ?? this.defaultInputExcelPath;
    if (!inputPath.endsWith('.xlsx')) {
      throw new BadRequestException('El archivo de entrada debe tener extensión .xlsx.');
    }

    if (!fs.existsSync(inputPath)) {
      throw new NotFoundException(`El archivo ${inputPath} no existe.`);
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.readFile(inputPath);
    } catch {
      throw new BadRequestException(`No se pudo leer el archivo Excel ${inputPath}.`);
    }

    const coursesFromCourseSheet = this.parseElementsFromSheet(
      workbook,
      ['CourseOfActions', 'Course Of Actions', 'CourseOfAction', 'Course Of Action', 'Courses'],
      'CourseOfAction',
      ['courseofaction', 'courseofactions'],
    );
    const courses = [...coursesFromCourseSheet];

    const principles = this.parseElementsFromSheet(
      workbook,
      ['Principles', 'Principle', 'Principios', 'Principio'],
      'Principle',
      ['principle', 'principles', 'result', 'results', 'resultado', 'resultados'],
    );
    const goals = this.parseElementsFromSheet(
      workbook,
      ['Goals', 'Goal', 'Objetivos', 'Objetivo'],
      'Goal',
      ['goal', 'goals', 'objetivo', 'objetivos'],
    );
    const drivers = this.parseElementsFromSheet(
      workbook,
      ['Drivers', 'Driver', 'Impulsores', 'Impulsor'],
      'Driver',
      ['driver', 'drivers', 'impulsor', 'impulsores'],
    );
    const businessActors = this.parseElementsFromSheet(
      workbook,
      ['BusinessActors', 'Business Actor', 'Business Actors', 'ActoresNegocio', 'Actores de Negocio'],
      'BusinessActor',
      ['businessactor', 'businessactors', 'actor', 'actors', 'actordenegocio', 'actoresdenegocio'],
    );

    return this.buildValidationSummary('excel', courses, principles, goals, drivers, businessActors, outPath);
  }

  async generateReportFromJson(data: Record<string, unknown>, outPath = this.defaultOutputFile) {
    this.logger.log('Generating ArchiMate report from JSON...');

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new BadRequestException('El payload debe ser un objeto JSON válido.');
    }

    const courses = this.parseElementsFromJson(
      data,
      ['courseOfActions', 'courseofactions', 'courses', 'courseOfAction', 'course_of_actions', 'cursos', 'acciones'],
      'CourseOfAction',
      ['courseofaction', 'courseofactions'],
    );
    const principles = this.parseElementsFromJson(
      data,
      ['principles', 'principios', 'principle', 'principio'],
      'Principle',
      ['principle', 'principles', 'result', 'results', 'resultado', 'resultados'],
    );
    const goals = this.parseElementsFromJson(
      data,
      ['goals', 'goal', 'objetivos', 'objetivo'],
      'Goal',
      ['goal', 'goals', 'objetivo', 'objetivos'],
    );
    const drivers = this.parseElementsFromJson(
      data,
      ['drivers', 'driver', 'impulsores', 'impulsor'],
      'Driver',
      ['driver', 'drivers', 'impulsor', 'impulsores'],
    );
    const businessActors = this.parseElementsFromJson(
      data,
      ['businessActors', 'businessactors', 'business_actor', 'business_actors', 'actoresNegocio', 'actoresdeNegocio', 'actores'],
      'BusinessActor',
      ['businessactor', 'businessactors', 'actor', 'actors', 'actordenegocio', 'actoresdenegocio'],
    );

    this.logger.log(`Rows loaded -> CourseOfAction total: ${courses.length}, BusinessActor: ${businessActors.length}, Principle: ${principles.length}, Goal: ${goals.length}, Driver: ${drivers.length}`);

    try {
      return this.buildAndSaveReport(courses, principles, goals, drivers, businessActors, outPath);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Error interno al generar el reporte ArchiMate desde JSON.');
    }
  }

  async validateReportFromJson(data: Record<string, unknown>, outPath = this.defaultOutputFile) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new BadRequestException('El payload debe ser un objeto JSON válido.');
    }

    const courses = this.parseElementsFromJson(
      data,
      ['courseOfActions', 'courseofactions', 'courses', 'courseOfAction', 'course_of_actions', 'cursos', 'acciones'],
      'CourseOfAction',
      ['courseofaction', 'courseofactions'],
    );
    const principles = this.parseElementsFromJson(
      data,
      ['principles', 'principios', 'principle', 'principio'],
      'Principle',
      ['principle', 'principles', 'result', 'results', 'resultado', 'resultados'],
    );
    const goals = this.parseElementsFromJson(
      data,
      ['goals', 'goal', 'objetivos', 'objetivo'],
      'Goal',
      ['goal', 'goals', 'objetivo', 'objetivos'],
    );
    const drivers = this.parseElementsFromJson(
      data,
      ['drivers', 'driver', 'impulsores', 'impulsor'],
      'Driver',
      ['driver', 'drivers', 'impulsor', 'impulsores'],
    );
    const businessActors = this.parseElementsFromJson(
      data,
      ['businessActors', 'businessactors', 'business_actor', 'business_actors', 'actoresNegocio', 'actoresdeNegocio', 'actores'],
      'BusinessActor',
      ['businessactor', 'businessactors', 'actor', 'actors', 'actordenegocio', 'actoresdenegocio'],
    );

    return this.buildValidationSummary('json', courses, principles, goals, drivers, businessActors, outPath);
  }
}

function escapeXml(str: string) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

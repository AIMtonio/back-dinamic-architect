import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';
import { basename } from 'path';
import { GoogleDriveService } from '../common/google-drive/google-drive.service';

@Injectable()
export class DiagramsService {
  private readonly logger = new Logger(DiagramsService.name);

  constructor(private readonly googleDrive: GoogleDriveService) {}

  private readonly defaultInputExcelPath = process.env.DIAGRAM_INPUT_EXCEL_PATH || process.env.EXCEL_FILE_PATH || 'src/data/input/Componentes.xlsx';
  private readonly outputDir = process.env.DIAGRAM_OUTPUT_DIR || 'src/data/output';
  private readonly outputExcelFile = process.env.DIAGRAM_OUTPUT_EXCEL_FILE || 'diagramaComponentes.drawio';
  private readonly outputJsonFile = process.env.DIAGRAM_OUTPUT_JSON_FILE || 'diagramaComponentesJson.drawio';

  private generateUniqueId(): string {
    return randomUUID().replace(/-/g, '');
  }

  private buildOutputPath(fileName: string): string {
    return `${this.outputDir}/${fileName}`;
  }

  getGoogleDriveAuthUrl() {
    return this.googleDrive.getAuthUrl();
  }

  async exchangeGoogleDriveCode(code: string) {
    return this.googleDrive.exchangeCode(code);
  }

  private toDiagramApiResponse(
    outputPath: string,
    componentsCount: number,
    uploadResult?: {
      uploaded?: boolean;
      id?: string | null;
      webViewLink?: string | null;
      webContentLink?: string | null;
      reason?: string | null;
    } | null,
    uploadAttempted = false,
  ) {
    const uploadedToDrive = Boolean(uploadResult?.uploaded);

    return {
      jsonapi: {
        version: '1.0',
      },
      data: {
        type: 'diagram-report',
        id: `id-${this.generateUniqueId()}`,
        attributes: {
          message: 'Diagrama generado',
          file: {
            name: basename(outputPath),
            path: outputPath,
          },
          components: {
            count: componentsCount,
          },
          delivery: {
            uploadAttempted,
            uploadedToDrive,
            provider: uploadedToDrive ? 'google-drive' : 'local',
            reason: uploadResult?.reason ?? null,
            googleDriveFileId: uploadResult?.id ?? null,
          },
        },
        links: {
          localPath: outputPath,
          driveViewUrl: uploadResult?.webViewLink ?? null,
          driveDownloadUrl: uploadResult?.webContentLink ?? null,
        },
      },
      meta: {
        generatedAt: new Date().toISOString(),
      },
    };
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
    try {
      fs.writeFileSync(outputPath, xml);
    } catch {
      throw new InternalServerErrorException(`No se pudo escribir el archivo de salida en ${outputPath}.`);
    }

    if (!this.googleDrive.shouldUploadOnFinish) {
      return this.toDiagramApiResponse(outputPath, components.length, null, false);
    }

    const uploadResult = await this.googleDrive.uploadFile(outputPath);
    return this.toDiagramApiResponse(outputPath, components.length, uploadResult, true);
  }

  async generateDiagramFromJson(payload: any) {
    const components = this.extractComponentsFromPayload(payload);
    return await this.generateDiagramFromComponents(components, this.buildOutputPath(this.outputJsonFile));
  }

  async validateDiagramFromJson(payload: any) {
    const components = this.extractComponentsFromPayload(payload);

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

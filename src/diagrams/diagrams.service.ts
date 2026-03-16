import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

@Injectable()
export class DiagramsService {

  generateDiagramFromComponents(components: { name: string; type: string }[], outputPath = 'src/data/output/diagramaComponentes.drawio') {
    if (!Array.isArray(components)) {
      throw new Error('components debe ser un arreglo');
    }
    if (components.length === 0) {
      throw new Error('No se encontraron componentes para generar el diagrama.');
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
    fs.writeFileSync(outputPath, xml);

    return {
      message: `Diagrama generado: ${outputPath}`,
      file: outputPath,
      componentsCount: components.length,
    };
  }

  async generateDiagramFromJson(payload: any) {

    if (typeof payload !== 'object' || payload === null) {
      throw new Error('Payload inválido. Debe ser un objeto JSON.');
    }

    const components: { name: string; type: string }[] = [];

    // Nuevo esquema: { componentes: [...], tipo: [...] } con misma longitud
    if (Array.isArray(payload.componentes) && Array.isArray(payload.tipo)) {
      const nombres = payload.componentes;
      const tipos = payload.tipo;
      if (nombres.length !== tipos.length) {
        throw new Error('Los arreglos componentes y tipo deben tener la misma cantidad de elementos.');
      }
      for (let i = 0; i < nombres.length; i++) {
        const nombre = nombres[i];
        const tipo = tipos[i] || 'lambda';
        if (typeof nombre === 'string' && nombre.trim().length > 0) {
          components.push({ name: nombre, type: tipo });
        }
      }
    } else {
      // Esquema anterior: buscar objetos en los arrays
      const arrays = Object.values(payload).filter((v) => Array.isArray(v)) as any[];
      if (arrays.length === 0) {
        throw new Error('No se encontró ningún arreglo en el JSON.');
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
      throw new Error('No se encontraron nodos válidos con nombre/tipo en el payload.');
    }

    console.log('Componentes extraídos:', components);

    return this.generateDiagramFromComponents(components, 'src/data/output/diagramaComponentesJson.drawio');
  }

  async generateDiagramFromExcel() {
    try {
      const ruta = 'src/data/input/Componentes.xlsx';
      console.log('Ruta del archivo Excel:', process.env.EXCEL_FILE_PATH);
      //meter en variable de entorno la ruta del archivo excel y usarla aquí
      const filePath = process.env.EXCEL_FILE_PATH || ruta;

      //Valida si el archivo existe
      if (!fs.existsSync(filePath)) {
        throw new Error(`El archivo ${filePath} no existe.`);
      }

      //Valida que el archivo sea .xlsx
      if (!filePath.endsWith('.xlsx')) {
        throw new Error(`El archivo ${filePath} no es un archivo Excel válido.`);
      }

      //Valida que el archivo no esté vacío
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        throw new Error(`El archivo ${filePath} está vacío.`);
      }

      //Valida que el archivo se pueda leer
      fs.accessSync(filePath, fs.constants.R_OK);

      try {
        //valida que tenga cabeceras de name y type
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const firstRow = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0] as string[];
        if (!firstRow.includes('name') || !firstRow.includes('type')) {
          throw new Error(`El archivo ${filePath} no contiene las cabeceras necesarias 'name' y 'type'.`);
        }

        // Convertir a JSON (espera columnas: name, type)
        const components: { name: string; type: string }[] = XLSX.utils.sheet_to_json(sheet);

        const result = this.generateDiagramFromComponents(components, 'src/data/output/diagramaComponentes.drawio');
        return { message: 'diagram.drawio generado desde Excel!', file: result.file };

      } catch (err) {
        throw new Error(`El archivo ${filePath} no se puede leer correctamente.`);
      }

    } catch (err) {
      console.error('Error al leer el archivo Excel:', err);
      throw err;
    }
  }


}

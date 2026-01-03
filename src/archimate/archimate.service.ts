import { Injectable } from '@nestjs/common';
import { CreateArchimateDto } from './dto/create-archimate.dto';
import { UpdateArchimateDto } from './dto/update-archimate.dto';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';

type ElementRow = {
  id: string;
  name: string;
  type: string;   // ArchiMate type (e.g., ApplicationComponent)
  layer?: string; // optional
};

type RelationRow = {
  id: string;
  source: string; // element id
  target: string; // element id
  type: string;   // ArchiMate relationship (e.g., Serving)
};

@Injectable()
export class ArchimateService {

  private generateUniqueId(): string {
    return randomUUID().replace(/-/g, '');
  }


  remove(id: number) {
    return `This action removes a #${id} archimate`;
  }

  generateReport(filePath?: string, outPath = 'archimate-report.xml') {
    console.log('Generating ArchiMate report...');
    filePath = 'src/data/input/business_actors.xlsx';
    let businessActorsXml = ``;
    let idUnique;

    if (filePath) {
      const wb = XLSX.readFile(filePath);
      const businessActorsSheet = wb.Sheets['BusinessActors'];
      if (businessActorsSheet) {
        const businessActors: { id: string; name: string }[] = XLSX.utils.sheet_to_json(businessActorsSheet);
        businessActorsXml = businessActors.map(actor => {
        const id = actor.id || this.generateUniqueId();
        idUnique = id;
        console.log('Business Actor Row:', id);
          return `
            <element identifier="id-${id}" xsi:type="BusinessActor">
              <name xml:lang="es">${escapeXml(actor.name)}</name>
            </element>`;
        }).join('');
      }
      console.log('businessActorsXml:', businessActorsXml);
    }

    const header = `
        <model xmlns="http://www.opengroup.org/xsd/archimate/3.0/" 
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
          xsi:schemaLocation="http://www.opengroup.org/xsd/archimate/3.0/ 
          http://www.opengroup.org/xsd/archimate/3.1/archimate3_Diagram.xsd" 
            identifier="id-d3f201552bc044d7bfb89d35b5819c3e">`;

    const body = `
      <name xml:lang="es">Guatemala</name>
        <elements>
          <element identifier="id-243de2b263264cc0bdf2dcb1b386fac7" xsi:type="CourseOfAction">
            <name xml:lang="es">Brindar un flujo denominado Prestamos gestionado desde la App Macropay</name>
          </element>${businessActorsXml}
          <element identifier="id-fa3f6e20a7fa40deb769cda66e5e64d2" xsi:type="Principle">
            <name xml:lang="es">Implementar la adquisición de préstamos desde la aplicación de Macropay</name>
          </element>
          <element identifier="id-345f2f11a032422084d793a3e2ba027e" xsi:type="Goal">
            <name xml:lang="es">Mejorar la experiencia del cliente de manera eficiente y efectiva</name>
          </element>
          <element identifier="id-cd749b32c56d4054a6d1b9231d41c974" xsi:type="Driver">
            <name xml:lang="es">Incrementar la cartera de Macropay integrando prestamos desde la aplicación</name>
          </element>
        </elements>
        <relationships>
          <relationship identifier="id-cb67062b5147478a85000b147f3f3f0a" source="id-243de2b263264cc0bdf2dcb1b386fac7" target="id-fa3f6e20a7fa40deb769cda66e5e64d2" xsi:type="Realization" />
          <relationship identifier="id-a79b6c4f286f4279999dd3c3276e5362" source="id-345f2f11a032422084d793a3e2ba027e" target="id-cd749b32c56d4054a6d1b9231d41c974" xsi:type="Influence" />
          <relationship identifier="id-b04fbfa6c94a4017aa41d4c574e0a68b" source="id-fa3f6e20a7fa40deb769cda66e5e64d2" target="id-345f2f11a032422084d793a3e2ba027e" xsi:type="Realization" />
        </relationships>
        <organizations>
          <item>
            <label xml:lang="es">Strategy</label>
            <item identifierRef="id-243de2b263264cc0bdf2dcb1b386fac7" />
          </item>
          <item>
            <label xml:lang="es">Business</label>
            <item identifierRef="id-${idUnique}" />
          </item>
          <item>
            <label xml:lang="es">Motivation</label>
            <item identifierRef="id-fa3f6e20a7fa40deb769cda66e5e64d2" />
            <item identifierRef="id-345f2f11a032422084d793a3e2ba027e" />
            <item identifierRef="id-cd749b32c56d4054a6d1b9231d41c974" />
          </item>
          <item>
            <label xml:lang="es">Relations</label>
            <item identifierRef="id-cb67062b5147478a85000b147f3f3f0a" />
            <item identifierRef="id-a79b6c4f286f4279999dd3c3276e5362" />
            <item identifierRef="id-b04fbfa6c94a4017aa41d4c574e0a68b" />
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
          <name xml:lang="es">Guatemala</name>
          <node identifier="id-31e2edb99faf4a369aacdb19e00e6d1e" x="96" y="24" w="1141" h="205" xsi:type="Container">
            <label xml:lang="es">Involucrados</label>
            <style>
              <fillColor r="210" g="215" b="215" a="100" />
              <lineColor r="92" g="92" b="92" a="100" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
            <node identifier="id-46e67a4982274bb283182f9e66112646" elementRef="id-${idUnique}" xsi:type="Element" x="264" y="120" w="120" h="55">
              <style>
                <fillColor r="255" g="255" b="181" a="100" />
                <lineColor r="92" g="92" b="92" a="100" />
                <font name="Lucida Grande" size="12">
                  <color r="0" g="0" b="0" />
                </font>
              </style>
            </node>
          </node>
          <node identifier="id-1e0895b287ad4c1b815206b33740fbfa" x="96" y="684" w="1081" h="169" xsi:type="Container">
            <label xml:lang="es">Principales Resultados Esperados</label>
            <style>
              <fillColor r="210" g="215" b="215" a="100" />
              <lineColor r="92" g="92" b="92" a="100" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
            <node identifier="id-fe6ccceb7177433f93e87ceb50028958" elementRef="id-fa3f6e20a7fa40deb769cda66e5e64d2" xsi:type="Element" x="408" y="756" w="200" h="55">
              <style>
                <fillColor r="204" g="204" b="255" a="100" />
                <lineColor r="92" g="92" b="92" a="100" />
                <font name="Lucida Grande" size="12">
                  <color r="0" g="0" b="0" />
                </font>
              </style>
            </node>
          </node>
          <node identifier="id-22e7390f894b4786bbd41027156eafb9" x="96" y="492" w="1081" h="169" xsi:type="Container">
            <label xml:lang="es">Objetivos a lograr</label>
            <style>
              <fillColor r="210" g="215" b="215" a="100" />
              <lineColor r="92" g="92" b="92" a="100" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
            <node identifier="id-6b63daa1e8454e33a23963d3ae5e6bf4" elementRef="id-345f2f11a032422084d793a3e2ba027e" xsi:type="Element" x="552" y="552" w="217" h="49">
              <style>
                <fillColor r="204" g="204" b="255" a="100" />
                <lineColor r="92" g="92" b="92" a="100" />
                <font name="Lucida Grande" size="12">
                  <color r="0" g="0" b="0" />
                </font>
              </style>
            </node>
          </node>
          <node identifier="id-971fbe3c963944e68b4355fa2ff4440b" x="96" y="252" w="1081" h="169" xsi:type="Container">
            <label xml:lang="es">Drivers</label>
            <style>
              <fillColor r="210" g="215" b="215" a="100" />
              <lineColor r="92" g="92" b="92" a="100" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
            <node identifier="id-0e707a07fa7a406a9aa67d1d14ab3132" elementRef="id-cd749b32c56d4054a6d1b9231d41c974" xsi:type="Element" x="528" y="317" w="277" h="40">
              <style>
                <fillColor r="204" g="204" b="255" a="100" />
                <lineColor r="92" g="92" b="92" a="100" />
                <font name="Lucida Grande" size="12">
                  <color r="0" g="0" b="0" />
                </font>
              </style>
            </node>
          </node>
          <node identifier="id-6a27e8ff32d34fbb8fecfe6f754351ce" x="96" y="888" w="1117" h="301" xsi:type="Container">
            <label xml:lang="es">Planes de Acción</label>
            <style>
              <fillColor r="210" g="215" b="215" a="100" />
              <lineColor r="92" g="92" b="92" a="100" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
            <node identifier="id-990ef265aba046e2814b661ca117510a" elementRef="id-243de2b263264cc0bdf2dcb1b386fac7" xsi:type="Element" x="564" y="948" w="249" h="55">
              <style>
                <fillColor r="245" g="222" b="170" a="100" />
                <lineColor r="92" g="92" b="92" a="100" />
                <font name="Lucida Grande" size="12">
                  <color r="0" g="0" b="0" />
                </font>
              </style>
            </node>
          </node>
          <connection identifier="id-dd26409b82c349cfbd7336fca23d659e" relationshipRef="id-b04fbfa6c94a4017aa41d4c574e0a68b" xsi:type="Relationship" source="id-fe6ccceb7177433f93e87ceb50028958" target="id-6b63daa1e8454e33a23963d3ae5e6bf4">
            <style>
              <lineColor r="0" g="0" b="0" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
          </connection>
          <connection identifier="id-797fb48ed5924684844344b09e229258" relationshipRef="id-a79b6c4f286f4279999dd3c3276e5362" xsi:type="Relationship" source="id-6b63daa1e8454e33a23963d3ae5e6bf4" target="id-0e707a07fa7a406a9aa67d1d14ab3132">
            <style>
              <lineColor r="0" g="0" b="0" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
          </connection>
          <connection identifier="id-04ece3e42d9440abb6de19999d3746ac" relationshipRef="id-cb67062b5147478a85000b147f3f3f0a" xsi:type="Relationship" source="id-990ef265aba046e2814b661ca117510a" target="id-fe6ccceb7177433f93e87ceb50028958">
            <style>
              <lineColor r="0" g="0" b="0" />
              <font name="Lucida Grande" size="12">
                <color r="0" g="0" b="0" />
              </font>
            </style>
          </connection>
        </view>`;

    const footer = `
          </diagrams>
        </views>
      </model>`;

    const xml = header + body + views + footer;

    const path = 'src/data/output/';
    fs.writeFileSync(path + outPath, xml, 'utf8');
    return { message: 'Reporte ArchiMate generado', file: path+outPath };
  }
  
}

function escapeXml(str: string) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
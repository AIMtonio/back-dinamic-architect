import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateInitialDocumentDto } from './dto/create-initial-document.dto';
import * as fs from 'fs';
import { basename, extname, join } from 'path';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
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
  private readonly templatePath = 'src/data/markdown/generar_documento_arquitectura.md';
  private readonly outputDir = process.env.ARCHITECTURE_OUTPUT_DIR || 'src/data/output';
  private readonly aiModel = process.env.ARCHITECTURE_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  private readonly aiBaseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  private readonly openAiApiKey = process.env.OPENAI_API_KEY;
  private readonly uploadToGoogleDriveOnFinish = process.env.GOOGLE_DRIVE_UPLOAD_ON_FINISH === 'true';
  private readonly googleDriveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  private readonly googleDriveClientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  private readonly googleDrivePrivateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  private readonly googleDrivePublicRead = process.env.GOOGLE_DRIVE_PUBLIC_READ !== 'false';
  private readonly googleOAuthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  private readonly googleOAuthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  private readonly googleOAuthRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  private readonly googleOAuthRefreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  async create(createInitialDocumentDto: CreateInitialDocumentDto) {
    const template = this.readTemplate();
    const generation = await this.generateDocumentMarkdown(createInitialDocumentDto, template);
    const outputBaseName = this.buildOutputBaseName(createInitialDocumentDto.proyecto);
    const markdownPath = this.saveGeneratedMarkdown(outputBaseName, generation.content);
    const wordPath = await this.saveGeneratedWord(outputBaseName, generation.content);
    const drive = await this.uploadGeneratedFilesToGoogleDrive(markdownPath, wordPath);

    return {
      message: 'Documento de arquitectura generado exitosamente.',
      data: {
        input: createInitialDocumentDto,
        files: {
          markdown: {
            path: markdownPath,
            name: markdownPath.split('/').pop(),
            drive: drive.markdown,
          },
          word: {
            path: wordPath,
            name: wordPath.split('/').pop(),
            drive: drive.word,
          },
        },
        model: generation.model,
        aiError: generation.aiError,
        delivery: {
          uploadAttempted: drive.uploadAttempted,
          uploadedToDrive: drive.uploadedToDrive,
          provider: drive.uploadedToDrive ? 'google-drive' : 'local',
          reason: drive.reason,
        },
      },
    };
  }

  async prueba() {
    return 'prueba';
  }

  private readTemplate(): string {
    try {
      return fs.readFileSync(this.templatePath, 'utf8');
    } catch {
      throw new InternalServerErrorException(`No se pudo leer la plantilla markdown en ${this.templatePath}.`);
    }
  }

  private hasServiceAccountGoogleDriveConfig(): boolean {
    return Boolean(this.googleDriveClientEmail && this.googleDrivePrivateKey);
  }

  private hasGoogleOAuthBaseConfig(): boolean {
    return Boolean(this.googleOAuthClientId && this.googleOAuthClientSecret && this.googleOAuthRedirectUri);
  }

  private hasGoogleOAuthUploadConfig(): boolean {
    return Boolean(this.hasGoogleOAuthBaseConfig() && this.googleOAuthRefreshToken);
  }

  private isGoogleInvalidGrantError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const gaxiosError = error as Error & {
      response?: {
        data?: {
          error?: string;
          error_description?: string;
        };
      };
    };

    return gaxiosError.response?.data?.error === 'invalid_grant'
      || gaxiosError.message.toLowerCase().includes('invalid_grant');
  }

  private buildGoogleDriveUploadErrorMessage(error: unknown): string {
    if (this.isGoogleInvalidGrantError(error)) {
      return 'Google rechazo el refresh token OAuth2 (invalid_grant). Regenera GOOGLE_OAUTH_REFRESH_TOKEN con /initial-document/google-drive/auth-url y /initial-document/google-drive/exchange-code, o elimina GOOGLE_OAUTH_* para usar Service Account.';
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'error desconocido';
  }

  private createGoogleServiceAccountClient() {
    return new google.auth.JWT({
      email: this.googleDriveClientEmail,
      key: this.googleDrivePrivateKey?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  }

  private async createGoogleDriveAuthClient(): Promise<OAuth2Client | InstanceType<typeof google.auth.JWT>> {
    if (this.hasGoogleOAuthUploadConfig()) {
      try {
        const oauth2Client = this.createGoogleOAuthClient();
        oauth2Client.setCredentials({ refresh_token: this.googleOAuthRefreshToken });
        await oauth2Client.getAccessToken();
        return oauth2Client;
      } catch (error) {
        if (!this.hasServiceAccountGoogleDriveConfig()) {
          throw error;
        }
      }
    }

    if (this.hasServiceAccountGoogleDriveConfig()) {
      return this.createGoogleServiceAccountClient();
    }

    throw new BadRequestException(
      'Google Drive no configurado. Define OAuth (GOOGLE_OAUTH_*) o Service Account (GOOGLE_DRIVE_CLIENT_EMAIL/PRIVATE_KEY).',
    );
  }

  private createGoogleOAuthClient(): OAuth2Client {
    if (!this.hasGoogleOAuthBaseConfig()) {
      throw new BadRequestException(
        'OAuth Google Drive no configurado. Define GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET y GOOGLE_OAUTH_REDIRECT_URI.',
      );
    }

    return new google.auth.OAuth2(
      this.googleOAuthClientId,
      this.googleOAuthClientSecret,
      this.googleOAuthRedirectUri,
    );
  }

  getGoogleDriveAuthUrl() {
    const oauth2Client = this.createGoogleOAuthClient();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/drive.file'],
    });

    return {
      message: 'Abre este URL, autoriza y luego usa el code para obtener refresh token.',
      authUrl: url,
    };
  }

  async exchangeGoogleDriveCode(code: string) {
    if (!code || typeof code !== 'string') {
      throw new BadRequestException('El parámetro code es obligatorio.');
    }

    const oauth2Client = this.createGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    return {
      message: 'Código intercambiado correctamente. Guarda GOOGLE_OAUTH_REFRESH_TOKEN en tu .env.',
      refreshToken: tokens.refresh_token || null,
      accessToken: tokens.access_token || null,
      expiryDate: tokens.expiry_date || null,
      warning: tokens.refresh_token
        ? null
        : 'Google no devolvió refresh_token. Repite autorización con prompt=consent y access_type=offline.',
    };
  }

  private async uploadGeneratedFilesToGoogleDrive(markdownPath: string, wordPath: string) {
    if (!this.uploadToGoogleDriveOnFinish) {
      return {
        uploadAttempted: false,
        uploadedToDrive: false,
        reason: 'Google Drive upload desactivado (GOOGLE_DRIVE_UPLOAD_ON_FINISH=false).',
        markdown: null,
        word: null,
      };
    }

    try {
      const markdownUpload = await this.uploadFileToGoogleDrive(markdownPath);
      const wordUpload = await this.uploadFileToGoogleDrive(wordPath);

      return {
        uploadAttempted: true,
        uploadedToDrive: Boolean(markdownUpload.uploaded && wordUpload.uploaded),
        reason: markdownUpload.reason || wordUpload.reason || null,
        markdown: markdownUpload,
        word: wordUpload,
      };
    } catch (error) {
      return {
        uploadAttempted: true,
        uploadedToDrive: false,
        reason: this.buildGoogleDriveUploadErrorMessage(error),
        markdown: null,
        word: null,
      };
    }
  }

  private async uploadFileToGoogleDrive(filePath: string) {
    if (!this.googleDriveFolderId) {
      return {
        uploaded: false,
        reason: 'Google Drive no configurado. Define GOOGLE_DRIVE_FOLDER_ID.',
      };
    }

    if (!this.hasGoogleOAuthUploadConfig() && !this.hasServiceAccountGoogleDriveConfig()) {
      return {
        uploaded: false,
        reason: 'Google Drive no configurado. Define OAuth (GOOGLE_OAUTH_*) o Service Account (GOOGLE_DRIVE_CLIENT_EMAIL/PRIVATE_KEY).',
      };
    }

    const auth = await this.createGoogleDriveAuthClient();

    const drive = google.drive({ version: 'v3', auth });
    const extension = extname(filePath).toLowerCase();
    const mimeType = extension === '.docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'text/markdown';

    const createResponse = await drive.files.create({
      requestBody: {
        name: basename(filePath),
        parents: this.googleDriveFolderId ? [this.googleDriveFolderId] : undefined,
      },
      media: {
        mimeType,
        body: fs.createReadStream(filePath),
      },
      supportsAllDrives: true,
      fields: 'id, webViewLink, webContentLink',
    });

    const fileId = createResponse.data.id;

    if (fileId && this.googleDrivePublicRead) {
      await drive.permissions.create({
        fileId,
        supportsAllDrives: true,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });
    }

    const fileResponse = fileId
      ? await drive.files.get({
        fileId,
        supportsAllDrives: true,
        fields: 'id, webViewLink, webContentLink',
      })
      : null;

    return {
      uploaded: Boolean(fileId),
      id: fileResponse?.data.id,
      webViewLink: fileResponse?.data.webViewLink,
      webContentLink: fileResponse?.data.webContentLink,
      reason: null,
    };
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

  private buildOutputBaseName(projectName: string): string {
    fs.mkdirSync(this.outputDir, { recursive: true });

    const sanitized = projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `arquitectura-${sanitized || 'proyecto'}-${Date.now()}`;
  }

  private saveGeneratedMarkdown(outputBaseName: string, content: string): string {
    const fileName = `${outputBaseName}.md`;
    const outputPath = join(this.outputDir, fileName);
    fs.writeFileSync(outputPath, content, 'utf8');
    return outputPath;
  }

  private async saveGeneratedWord(outputBaseName: string, markdownContent: string): Promise<string> {
    const fileName = `${outputBaseName}.docx`;
    const outputPath = join(this.outputDir, fileName);

    const doc = new Document({
      sections: [
        {
          children: this.markdownToWordChildren(markdownContent),
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outputPath, buffer);
    return outputPath;
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
}

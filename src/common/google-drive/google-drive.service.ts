import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs';
import { basename, extname } from 'path';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export type GoogleDriveUploadResult = {
  uploaded: boolean;
  id?: string | null;
  webViewLink?: string | null;
  webContentLink?: string | null;
  reason?: string | null;
};

@Injectable()
export class GoogleDriveService {
  private readonly uploadToGoogleDriveOnFinish = process.env.GOOGLE_DRIVE_UPLOAD_ON_FINISH === 'true';
  private readonly folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  private readonly clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
  private readonly privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
  private readonly publicRead = process.env.GOOGLE_DRIVE_PUBLIC_READ !== 'false';
  private readonly oAuthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  private readonly oAuthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  private readonly oAuthRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  private readonly oAuthRefreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  get shouldUploadOnFinish(): boolean {
    return this.uploadToGoogleDriveOnFinish;
  }

  private hasServiceAccountConfig(): boolean {
    return Boolean(this.clientEmail && this.privateKey);
  }

  private hasOAuthBaseConfig(): boolean {
    return Boolean(this.oAuthClientId && this.oAuthClientSecret && this.oAuthRedirectUri);
  }

  private hasOAuthUploadConfig(): boolean {
    return Boolean(this.hasOAuthBaseConfig() && this.oAuthRefreshToken);
  }

  private isInvalidGrantError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const gaxiosError = error as Error & {
      response?: { data?: { error?: string } };
    };

    return (
      gaxiosError.response?.data?.error === 'invalid_grant' ||
      gaxiosError.message.toLowerCase().includes('invalid_grant')
    );
  }

  buildUploadErrorMessage(error: unknown): string {
    if (this.isInvalidGrantError(error)) {
      return 'Google rechazo el refresh token OAuth2 (invalid_grant). Regenera GOOGLE_OAUTH_REFRESH_TOKEN o elimina GOOGLE_OAUTH_* para usar Service Account.';
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'error desconocido';
  }

  private createServiceAccountClient() {
    return new google.auth.JWT({
      email: this.clientEmail,
      key: this.privateKey?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  }

  private createOAuthClient(): OAuth2Client {
    if (!this.hasOAuthBaseConfig()) {
      throw new BadRequestException(
        'OAuth Google Drive no configurado. Define GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET y GOOGLE_OAUTH_REDIRECT_URI.',
      );
    }

    return new google.auth.OAuth2(
      this.oAuthClientId,
      this.oAuthClientSecret,
      this.oAuthRedirectUri,
    );
  }

  private async createAuthClient(): Promise<OAuth2Client | InstanceType<typeof google.auth.JWT>> {
    if (this.hasOAuthUploadConfig()) {
      try {
        const oauth2Client = this.createOAuthClient();
        oauth2Client.setCredentials({ refresh_token: this.oAuthRefreshToken });
        await oauth2Client.getAccessToken();
        return oauth2Client;
      } catch (error) {
        if (!this.hasServiceAccountConfig()) {
          throw error;
        }
      }
    }

    if (this.hasServiceAccountConfig()) {
      return this.createServiceAccountClient();
    }

    throw new BadRequestException(
      'Google Drive no configurado. Define OAuth (GOOGLE_OAUTH_*) o Service Account (GOOGLE_DRIVE_CLIENT_EMAIL/PRIVATE_KEY).',
    );
  }

  getAuthUrl(): { message: string; authUrl: string } {
    const oauth2Client = this.createOAuthClient();
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

  async exchangeCode(code: string) {
    if (!code || typeof code !== 'string') {
      throw new BadRequestException('El parámetro code es obligatorio.');
    }

    const oauth2Client = this.createOAuthClient();
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

  private resolveMimeType(filePath: string, overrideMimeType?: string): string {
    if (overrideMimeType) {
      return overrideMimeType;
    }

    const ext = extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.xml': 'application/xml',
      '.drawio': 'application/xml',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.md': 'text/markdown',
    };

    return mimeMap[ext] ?? 'application/octet-stream';
  }

  async uploadFile(filePath: string, overrideMimeType?: string): Promise<GoogleDriveUploadResult> {
    if (!this.folderId) {
      return { uploaded: false, reason: 'Google Drive no configurado. Define GOOGLE_DRIVE_FOLDER_ID.' };
    }

    if (!this.hasOAuthUploadConfig() && !this.hasServiceAccountConfig()) {
      return {
        uploaded: false,
        reason: 'Google Drive no configurado. Define OAuth (GOOGLE_OAUTH_*) o Service Account (GOOGLE_DRIVE_CLIENT_EMAIL/PRIVATE_KEY).',
      };
    }

    const auth = await this.createAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    const mimeType = this.resolveMimeType(filePath, overrideMimeType);

    const createResponse = await drive.files.create({
      requestBody: {
        name: basename(filePath),
        parents: [this.folderId],
      },
      media: {
        mimeType,
        body: fs.createReadStream(filePath),
      },
      supportsAllDrives: true,
      fields: 'id, webViewLink, webContentLink',
    });

    const fileId = createResponse.data.id;

    if (fileId && this.publicRead) {
      await drive.permissions.create({
        fileId,
        supportsAllDrives: true,
        requestBody: { role: 'reader', type: 'anyone' },
      });
    }

    const fileResponse = fileId
      ? await drive.files.get({ fileId, supportsAllDrives: true, fields: 'id, webViewLink, webContentLink' })
      : null;

    return {
      uploaded: Boolean(fileId),
      id: fileResponse?.data.id ?? null,
      webViewLink: fileResponse?.data.webViewLink ?? null,
      webContentLink: fileResponse?.data.webContentLink ?? null,
      reason: null,
    };
  }
}

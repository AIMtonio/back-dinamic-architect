import { Test, TestingModule } from '@nestjs/testing';
import { createCipheriv, createHash } from 'crypto';
import { DiagramsService } from './diagrams.service';

describe('DiagramsService', () => {
  let service: DiagramsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DiagramsService],
    }).compile();

    service = module.get<DiagramsService>(DiagramsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should decrypt encrypted payload and generate diagram', async () => {
    const previousSecret = process.env.DIAGRAM_DECRYPT_SECRET;
    const previousSkew = process.env.DIAGRAM_DECRYPT_MAX_SKEW_SECONDS;

    try {
      process.env.DIAGRAM_DECRYPT_SECRET = 'test-shared-secret';
      process.env.DIAGRAM_DECRYPT_MAX_SKEW_SECONDS = '300';

      const plainPayload = {
        componentes: ['API', 'DB'],
        tipo: ['lambda', 'eks'],
      };

      const iv = Buffer.from('abcdefghijkl', 'utf8');
      const ts = new Date().toISOString();
      const key = createHash('sha256').update(process.env.DIAGRAM_DECRYPT_SECRET).digest();

      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(plainPayload), 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      const data = Buffer.concat([encrypted, authTag]).toString('base64');

      const result = await service.generateDiagramFromJson({
        alg: 'AES-256-GCM',
        iv: iv.toString('base64'),
        data,
        ts,
      });

      expect(result.filename).toBe('diagramaComponentesJson.drawio');
      expect(result.buffer.toString('utf8')).toContain('API');
      expect(result.buffer.toString('utf8')).toContain('DB');
    } finally {
      if (previousSecret === undefined) {
        delete process.env.DIAGRAM_DECRYPT_SECRET;
      } else {
        process.env.DIAGRAM_DECRYPT_SECRET = previousSecret;
      }

      if (previousSkew === undefined) {
        delete process.env.DIAGRAM_DECRYPT_MAX_SKEW_SECONDS;
      } else {
        process.env.DIAGRAM_DECRYPT_MAX_SKEW_SECONDS = previousSkew;
      }
    }
  });

  it('should decrypt payload with only data field', async () => {
    const previousSecret = process.env.DIAGRAM_DECRYPT_SECRET;
    const previousSkew = process.env.DIAGRAM_DECRYPT_MAX_SKEW_SECONDS;

    try {
      process.env.DIAGRAM_DECRYPT_SECRET = 'test-shared-secret';
      process.env.DIAGRAM_DECRYPT_MAX_SKEW_SECONDS = '300';

      const plainPayload = {
        componentes: ['API'],
        tipo: ['lambda'],
      };

      const iv = Buffer.from('abcdefghijkl', 'utf8');
      const key = createHash('sha256').update(process.env.DIAGRAM_DECRYPT_SECRET).digest();

      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(plainPayload), 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();

      // data empaqueta iv + ciphertext + authTag para soporte de body minimo.
      const data = Buffer.concat([iv, encrypted, authTag]).toString('base64');

      const result = await service.generateDiagramFromJson({ data });

      expect(result.filename).toBe('diagramaComponentesJson.drawio');
      expect(result.buffer.toString('utf8')).toContain('API');
    } finally {
      if (previousSecret === undefined) {
        delete process.env.DIAGRAM_DECRYPT_SECRET;
      } else {
        process.env.DIAGRAM_DECRYPT_SECRET = previousSecret;
      }

      if (previousSkew === undefined) {
        delete process.env.DIAGRAM_DECRYPT_MAX_SKEW_SECONDS;
      } else {
        process.env.DIAGRAM_DECRYPT_MAX_SKEW_SECONDS = previousSkew;
      }
    }
  });
});

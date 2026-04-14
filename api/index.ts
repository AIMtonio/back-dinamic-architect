import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AppModule } from '../src/app.module';

type ExpressHandler = (req: Request, res: Response) => void;

let cachedHandler: ExpressHandler | null = null;
let cachedHandlerPromise: Promise<ExpressHandler> | null = null;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(`BOOTSTRAP_TIMEOUT_${timeoutMs}`)), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

async function createHandler() {
  console.log('[api] Bootstrapping Nest app...');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.use((_req: unknown, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: false,
      forbidUnknownValues: true,
    }),
  );

  await app.init();
  const expressApp = app.getHttpAdapter().getInstance() as ExpressHandler;
  console.log('[api] Nest app initialized');

  return expressApp;
}

export default async function handler(req: Request, res: Response) {
  if (!cachedHandler) {
    if (!cachedHandlerPromise) {
      cachedHandlerPromise = createHandler();
    }

    try {
      const bootstrapTimeoutMs = Number(process.env.BOOTSTRAP_TIMEOUT_MS || 25_000);
      cachedHandler = await withTimeout(cachedHandlerPromise, bootstrapTimeoutMs);
    } catch (error) {
      console.error('[api] Bootstrap failed or timed out', error);
      if (!res.headersSent) {
        res.status(503).json({
          message: 'El servidor esta iniciando. Intenta nuevamente en unos segundos.',
        });
      }
      return;
    }
  }

  return cachedHandler(req, res);
}

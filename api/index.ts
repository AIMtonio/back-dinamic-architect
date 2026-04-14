import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import serverless from 'serverless-http';
import { AppModule } from '../src/app.module';

let cachedHandler: ReturnType<typeof serverless> | null = null;
let cachedHandlerPromise: Promise<ReturnType<typeof serverless>> | null = null;

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
  const expressApp = app.getHttpAdapter().getInstance();
  console.log('[api] Nest app initialized');

  return serverless(expressApp);
}

export default async function handler(req: unknown, res: unknown) {
  if (!cachedHandler) {
    if (!cachedHandlerPromise) {
      cachedHandlerPromise = createHandler();
    }
    cachedHandler = await cachedHandlerPromise;
  }

  return cachedHandler(req, res);
}

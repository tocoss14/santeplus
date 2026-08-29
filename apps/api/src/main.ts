import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { config } from './config';

async function bootstrap(): Promise<void> {
  // Validation critique avant démarrage
  if (config.isProd && config.jwtSecret.length < 32) {
    console.error('FATAL: JWT_SECRET doit faire au moins 32 caractères en production');
    process.exit(1);
  }
  if (config.isProd && !config.fieldEncryptionKey) {
    console.error('FATAL: FIELD_ENCRYPTION_KEY requis en production (32 octets hex)');
    process.exit(1);
  }

  process.on('unhandledRejection', (reason: unknown) => {
    console.error('UNHANDLED REJECTION:', reason);
  });

  process.on('uncaughtException', (error: Error) => {
    console.error('UNCAUGHT EXCEPTION:', error);
    process.exit(1);
  });

  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    app.use(helmet.default({ crossOriginResourcePolicy: false }));
    app.enableCors({
      origin: [...config.webOrigin.split(','), ...config.appUrl.split(',')],
      credentials: true,
    });
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new HttpExceptionFilter());

    // Rate limiting global : 100 requêtes par minute par IP
    app.use(rateLimit({
      windowMs: 60_000,
      limit: 100,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.ip ?? 'unknown',
    }));

    // Rate limiting spécifique sur les endpoints critiques
    app.use(
      '/api/auth/login',
      rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }),
    );
    app.use(
      '/api/auth/register',
      rateLimit({ windowMs: 60 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }),
    );
    app.use(
      '/api/auth/refresh',
      rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }),
    );
    app.use(
      '/api/payments',
      rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }),
    );
    app.use(
      '/api/claims',
      rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }),
    );
    app.use(
      '/api/provider/thirdparty',
      rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }),
    );

    const signals = ['SIGTERM', 'SIGINT'];
    signals.forEach((signal) => {
      process.on(signal, () => {
        console.log(`Received ${signal}, shutting down gracefully...`);
        process.exit(0);
      });
    });

    await app.listen(config.port);
    console.log(`API ready on http://localhost:${config.port}/api`);
    console.log(`Environment: ${config.isProd ? 'production' : 'development'}`);
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

bootstrap();
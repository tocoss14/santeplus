import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import * as helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { config } from './config';
import { PrismaClient } from '@prisma/client';

async function bootstrap(): Promise<void> {
  // Validation critique avant démarrage
  if (config.isProd && config.jwtSecret.length < 32) {
    console.error('FATAL: JWT_SECRET doit faire au moins 32 caractères en production');
    process.exit(1);
  }
  if (config.isProd && !config.fieldEncryptionKey) {
    console.warn('WARNING: FIELD_ENCRYPTION_KEY non défini — clé dérivée utilisée (données non persistantes entre rotations JWT)');
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

    // CORS AVANT helmet — sinon helmet bloque les preflight OPTIONS
    app.enableCors({
      origin: [
        ...config.webOrigin.split(',').map(s => s.trim()).filter(Boolean),
        ...config.appUrl.split(',').map(s => s.trim()).filter(Boolean),
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    });
    app.use(helmet.default({ crossOriginResourcePolicy: false }));
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new HttpExceptionFilter());

    // Rate limiting global : 100 requêtes par minute par IP
    // Skip OPTIONS (CORS preflight) pour éviter le blocage
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'OPTIONS') return next();
      rateLimit({
        windowMs: 60_000,
        limit: 100,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (r: Request) => r.ip ?? 'unknown',
      })(req, res, next);
    });

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

    // Auto-seed: si la table User est vide, lancer le seed
    await autoSeed();
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

bootstrap();

/** Auto-seed : vérifie si la base est vide et lance le seed */
async function autoSeed(): Promise<void> {
  try {
    const check = new PrismaClient();
    const count = await check.user.count();
    await check.$disconnect();
    if (count > 0) {
      console.log(`Database already has ${count} users — skipping seed.`);
      return;
    }
    console.log('Database is empty — running seed...');
    const { execSync } = await import('child_process');
    execSync('npx tsx prisma/seed.ts', {
      cwd: process.cwd(),
      stdio: 'inherit',
      timeout: 120_000,
    });
    console.log('Seed completed successfully.');
  } catch (err: any) {
    console.error('Auto-seed failed:', err?.message ?? err);
    // Ne pas empêcher le démarrage de l'API
  }
}
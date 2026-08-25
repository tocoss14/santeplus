import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { config } from './config';

async function bootstrap() {
  // Handle uncaught exceptions and unhandled rejections
  process.on('unhandledRejection', (reason) => {
    console.error('UNHANDLED REJECTION:', reason);
  });
  
  process.on('uncaughtException', (error) => {
    console.error('UNCAUGHT EXCEPTION:', error);
    process.exit(1);
  }

  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    app.use(helmet.default({ crossOriginResourcePolicy: false }));
    app.enableCors({
      origin: [...config.webOrigin.split(','), ...config.appUrl.split(',')],
      credentials: true,
    });
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new HttpExceptionFilter());

    app.use(
      '/api/auth/login',
      rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }),
    );
    app.use(
      '/api/auth/register',
      rateLimit({ windowMs: 60 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }),
    );

    // Graceful shutdown
    const signals = ['SIGTERM', 'SIGINT'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        console.log(`Received ${signal}, shutting down gracefully...`);
        process.exit(0);
      });
    });

    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    });

    app.use(helmet.default({ crossOriginResourcePolicy: false }));
    app.enableCors({
      origin: [...config.webOrigin.split(','), ...config.appUrl.split(',')],
      credentials: true,
    });
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new HttpExceptionFilter());

    app.use(
      '/api/auth/login',
      rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false }),
    );
    app.use(
      '/api/auth/register',
      rateLimit({ windowMs: 60 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }),
    );

    await app.listen(config.port);
    console.log(`🚀 API prête sur http://localhost:${config.port}/api`);
    console.log(`Environment: ${config.isProd ? 'production' : 'development'}`);
    console.log(`Database: ${config.isProd ? 'PostgreSQL (production)' : 'SQLite (dev)'}`);
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

bootstrap();
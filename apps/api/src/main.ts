import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
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
  console.log(`API prête sur http://localhost:${config.port}/api`);
}

bootstrap();

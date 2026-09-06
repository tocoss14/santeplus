import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import * as helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { config } from './config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

async function bootstrap(): Promise<void> {
  // Validation critique avant démarrage
  if (config.isProd && config.jwtSecret.length < 32) {
    console.error('FATAL: JWT_SECRET doit faire au moins 32 caractères en production');
    process.exit(1);
  }
  if (!config.fieldEncryptionKey || config.fieldEncryptionKey.length < 64) {
    console.warn('WARNING: FIELD_ENCRYPTION_KEY manquant/invalide — clé dérivée du JWT_SECRET utilisée (définir FIELD_ENCRYPTION_KEY en prod pour persistance)');
  }

  // Garde production : aucun compte ne doit utiliser le mot de passe de démonstration connu
  if (config.isProd && process.env.ALLOW_DEMO_ACCOUNTS_IN_PROD !== 'true') {
    await guardKnownDemoAccounts();
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

    // Trust proxy (Fly.io, Render) pour que rateLimit voie la vraie IP
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    // Cookies httpOnly (sp_access / sp_refresh) — requis avant les routes auth
    app.use(cookieParser());

    // Anti-CSRF : les mutations authentifiées par COOKIE exigent une Origin/Referer autorisée.
    // - Requêtes Bearer : insensibles au CSRF (pas de cookies) → passent.
    // - Webhooks serveur-à-serveur : pas d'Origin navigateur → exclus.
    // - Sans cookies : rien à protéger → passent (le guard renverra 401 si besoin).
    const csrfSafeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
    const csrfSkippedPrefixes = ['/api/payments/webhook/'];
    const csrfAllowedHosts = new Set(
      [...config.webOrigin.split(','), ...config.appUrl.split(',')]
        .map(s => s.trim()).filter(Boolean)
        .map(o => { try { return new URL(o).host.toLowerCase(); } catch { return ''; } })
        .filter(Boolean),
    );
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (csrfSafeMethods.has(req.method)) return next();
      const authHeader = req.headers['authorization'];
      if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) return next();
      if (csrfSkippedPrefixes.some(p => (req.originalUrl ?? '').startsWith(p))) return next();
      const cookies = (req as any).cookies;
      if (!cookies || Object.keys(cookies).length === 0) return next();
      const originHeader = (req.headers['origin'] ?? req.headers['referer']) as string | undefined;
      let originHost = '';
      try { originHost = originHeader ? new URL(originHeader).host.toLowerCase() : ''; } catch { originHost = ''; }
      const reqHost = (req.get('host') ?? '').toLowerCase();
      if (originHost && (csrfAllowedHosts.has(originHost) || originHost === reqHost)) return next();
      res.status(403).json({ statusCode: 403, message: 'Origine non autorisée' });
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
    app.use(helmet.default({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: false, // API JSON, pas de HTML
      hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    }));
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new HttpExceptionFilter());

    // Rate limiting — instances réutilisées (pas recréées à chaque requête)
    const globalLimiter = rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false, keyGenerator: (r: Request) => r.ip ?? 'unknown', skip: (r: Request) => r.method === 'OPTIONS' });
    const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { message: 'Trop de tentatives, réessayez dans 15 minutes' } });
    const registerLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: true, legacyHeaders: false });
    const refreshLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
    const paymentsLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });
    const claimsLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
    const thirdPartyLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

    app.use(globalLimiter);
    app.use('/api/auth/login', loginLimiter);
    app.use('/api/auth/register', registerLimiter);
    app.use('/api/auth/refresh', refreshLimiter);
    app.use('/api/payments', paymentsLimiter);
    app.use('/api/claims', claimsLimiter);
    app.use('/api/provider/thirdparty', thirdPartyLimiter);

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

    // Auto-seed: si la table User est vide, lancer le seed.
    // JAMAIS en production : le seed est destructeur et crée des comptes de démo
    // avec des identifiants connus. Utiliser le workflow seed.yml pour un seed explicite.
    if (config.isProd) {
      console.log('Auto-seed disabled in production (destructive demo seed with known credentials). Use the seed.yml workflow for explicit seeding.');
    } else {
      await autoSeed();
    }
  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

bootstrap();

/**
 * Garde production : refuse de démarrer si des comptes utilisent encore le mot de
 * passe de démonstration connu (Demo1234!, codé en dur dans prisma/seed.ts).
 * Périmètre volontairement borné (rôles privilégiés + emails de démo) pour rester
 * instantané même sur une base de production avec de nombreux utilisateurs.
 * Override d'urgence : ALLOW_DEMO_ACCOUNTS_IN_PROD=true (déconseillé).
 */
async function guardKnownDemoAccounts(): Promise<void> {
  let check: PrismaClient | null = null;
  try {
    check = new PrismaClient();
    const users = await check.user.findMany({
      where: {
        OR: [
          { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER', 'SUPPORT_AGENT', 'COMPANY_ADMIN', 'PROVIDER'] } },
          { email: { contains: '@demo.bj' } },
          { email: { in: ['admin@santeplus.bj', 'gestionnaire@santeplus.bj', 'support@santeplus.bj', 'entreprise@santeplus.bj', 'prestataire@santeplus.bj', 'caisse@santeplus.bj'] } },
        ],
      },
      select: { email: true, passwordHash: true },
    });
    const demoAccounts = new Set<string>();
    for (const u of users) {
      if (!u.passwordHash || !u.passwordHash.startsWith('$2')) continue;
      try {
        if (await bcrypt.compare('Demo1234!', u.passwordHash)) demoAccounts.add(u.email);
      } catch { /* hash illisible — ignoré */ }
    }
    if (demoAccounts.size > 0) {
      console.error(`FATAL: ${demoAccounts.size} compte(s) utilisent encore le mot de passe de démonstration connu (Demo1234!).`);
      console.error(`Comptes concernés : ${[...demoAccounts].join(', ')}`);
      console.error('Changez leur mot de passe ou supprimez-les avant de démarrer en production.');
      console.error('Pour forcer le démarrage (urgence uniquement) : ALLOW_DEMO_ACCOUNTS_IN_PROD=true');
      process.exit(1);
    }
  } catch (err: any) {
    console.warn('WARNING: vérification des comptes de démonstration impossible — démarrage sans garde :', err?.message ?? err);
  } finally {
    await check?.$disconnect().catch(() => {});
  }
}

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
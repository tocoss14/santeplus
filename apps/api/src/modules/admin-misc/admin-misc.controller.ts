import * as fs from 'fs';
import * as path from 'path';
import { Body, Controller, Get, Module, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { config } from '../../config';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health() {
    // `storage` rend la persistance vérifiable de l'extérieur : « disk » signifie
    // que les téléversements ne survivront pas au prochain redémarrage de l'instance.
    return {
      status: 'ok',
      service: 'santeplus-api',
      storage: config.storageRemote ? 'object' : 'disk',
      time: new Date().toISOString(),
    };
  }

  /**
   * Sonde de version : le health-check du workflow de déploiement compare
   * cette réponse au SHA publié pour détecter immédiatement un déploiement
   * périmé (image non reconstruite ou instance non recyclée).
   *
   * Priorité : RENDER_GIT_COMMIT (SHA du deploy, injecté par Render au runtime)
   * > APP_VERSION (SHA passé par la CI aux images GHCR) > dist/build-info.json
   * (tampon gravé par le Dockerfile).
   *
   * Le SHA runtime passe devant le tampon parce que celui-ci n'est PAS
   * invalidé à chaque commit : BuildKit ne rejoue la couche que si une valeur
   * d'ARG change, et Render n'injecte RENDER_GIT_COMMIT qu'au runtime, jamais
   * en build-arg. Un commit qui ne touche aucun fichier copié par le
   * Dockerfile (docs, e2e, fichiers racine) réutilise donc la couche telle
   * quelle et le tampon désigne le commit PRÉCÉDENT — le 2026-10-23 la
   * certification du déploiement a échoué pour cette raison alors que la
   * production tournait bien sur le bon code.
   *
   * `builtAt` reste l'horodatage du tampon image : il documente l'image, pas le
   * commit, et peut donc précéder `version` quand l'image vient du cache
   * (l'échappatoire BUILT_AT permet de le fixer à la main).
   */
  @Public()
  @Get('version')
  version() {
    const info = readBuildInfo();
    return {
      service: 'santeplus-api',
      version: process.env.RENDER_GIT_COMMIT || process.env.APP_VERSION || info.version || null,
      builtAt: process.env.BUILT_AT || info.builtAt || null,
      time: new Date().toISOString(),
    };
  }
}

/**
 * État des migrations Prisma, en lecture seule et sans authentification : la
 * certification de production peut ainsi vérifier que la base a bien absorbé
 * le schéma du commit déployé, sans jamais manipuler DATABASE_URL.
 *
 * Deux sources sont comparées :
 * - les dossiers livrés dans l'image (`prisma/migrations/*`), donc le schéma
 *   attendu par le code en cours d'exécution ;
 * - la table `_prisma_migrations` (source de vérité de ce qui a été appliqué).
 *
 * Le verdict est porté par le champ `status`, pas par le code HTTP : la route
 * répond toujours 200. Un 500 sur une base momentanément injoignable ferait
 * échouer une certification pour une cause transitoire sans dire laquelle ;
 * ici `status: "unknown"` + `error` restent lisibles par un humain comme par
 * un job CI (`curl -fsS … | jq -e '.status == "up-to-date"'`).
 */
@Controller()
export class MigrationsController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get('migrations')
  async migrations() {
    const expected = readMigrationFolders();

    let rows: MigrationRow[];
    try {
      rows = await this.prisma.$queryRaw<MigrationRow[]>`
        SELECT migration_name, finished_at, rolled_back_at
        FROM _prisma_migrations
        ORDER BY started_at ASC
      `;
    } catch {
      // Table absente (base jamais migrée) ou base injoignable : on le dit, on
      // ne masque pas l'incident derrière un 200 optimiste.
      return {
        service: 'santeplus-api',
        status: 'unknown' as const,
        applied: null,
        total: expected.length,
        last: null,
        pending: [] as string[],
        failed: [] as string[],
        rolledBack: [] as string[],
        error: 'Table _prisma_migrations illisible — base injoignable ou jamais migrée',
        time: new Date().toISOString(),
      };
    }

    const isFinished = (r: MigrationRow) => r.finished_at !== null && r.finished_at !== undefined;
    const isRolledBack = (r: MigrationRow) => r.rolled_back_at !== null && r.rolled_back_at !== undefined;

    const appliedRows = rows.filter(r => isFinished(r) && !isRolledBack(r));
    const appliedNames = appliedRows.map(r => r.migration_name);
    // Une ligne sans finished_at ni rolled_back_at = migration tentée et
    // interrompue : `prisma migrate deploy` refuse de continuer tant qu'elle
    // n'est pas résolue. C'est la panne qu'il faut voir, pas la noyer.
    const failed = rows.filter(r => !isFinished(r) && !isRolledBack(r)).map(r => r.migration_name);
    const rolledBack = rows.filter(r => isRolledBack(r)).map(r => r.migration_name);
    // En attente = livrée dans l'image mais jamais tentée. Les migrations en
    // échec ou annulées sont comptées à part : elles ne sont pas « en attente
    // de déploiement », elles demandent une intervention.
    const attempted = new Set([...appliedNames, ...failed, ...rolledBack]);
    const pending = expected.filter(name => !attempted.has(name));

    const lastRow = [...appliedRows].sort((a, b) => a.migration_name.localeCompare(b.migration_name)).pop();

    const status = failed.length > 0
      ? 'failed'
      : pending.length > 0
        ? 'pending'
        : expected.length === 0
          ? 'unknown'
          : 'up-to-date';

    return {
      service: 'santeplus-api',
      status,
      applied: appliedNames.length,
      total: expected.length,
      last: lastRow
        ? { name: lastRow.migration_name, finishedAt: toIso(lastRow.finished_at) }
        : null,
      pending,
      failed,
      rolledBack,
      time: new Date().toISOString(),
    };
  }
}

@Controller('admin')
export class AdminMiscController {
  constructor(private prisma: PrismaService) {}

  @Get('anomalies/summary')
  @RequirePermissions('audit.view')
  async anomaliesSummary() {
    const [total, recent] = await Promise.all([
      (this.prisma as any).auditLog.count({ where: { action: 'FRAUD_ALERT' } }),
      (this.prisma as any).auditLog.findMany({
        where: { action: 'FRAUD_ALERT', createdAt: { gte: new Date(Date.now() - 7 * 86400000) } },
        select: { meta: true },
      }),
    ]);
    let zCount = 0;
    let cumulCount = 0;
    for (const r of recent) {
      try {
        const m = JSON.parse(r.meta);
        if (m?.type === 'CUMUL') cumulCount++;
        else zCount++;
      } catch { zCount++; }
    }
    return { total, last7Days: recent.length, zScoreAlertsLast7Days: zCount, cumulAlertsLast7Days: cumulCount };
  }

  @Get('anomalies')
  @RequirePermissions('audit.view')
  async anomalies() {
    const alerts = await (this.prisma as any).auditLog.findMany({
      where: { action: 'FRAUD_ALERT' },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    let notifFallback: any[] = [];
    try {
      const notifs = await (this.prisma as any).notification.findMany({
        where: { topic: 'FRAUD_ALERT' },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      notifFallback = notifs;
    } catch {}
    const parse = (row: any) => {
      let meta: any = null;
      try { meta = row.meta ? JSON.parse(row.meta) : null; } catch { meta = row.meta; }
      return { ...row, meta };
    };
    return {
      items: alerts.map(parse),
      notifications: notifFallback.map(parse),
      total: alerts.length,
    };
  }

  @Get('audit')
  @RequirePermissions('audit.view')
  async audit(
    @Query('page') page = '1',
    @Query('q') q?: string,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const where: any = {};
    if (userId) where.userId = userId;
    if (entity) where.entityType = { contains: entity };
    if (action) where.action = { contains: action };
    if (q) where.OR = [{ action: { contains: q } }, { entityType: { contains: q } }, { entityId: { contains: q } }];
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to + 'T23:59:59.999Z');
    }
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * 30,
        take: 30,
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: items.map(item => ({
        ...item,
        entity: item.entityType,
        details: item.meta,
        user: item.user
          ? { ...item.user, name: `${item.user.firstName} ${item.user.lastName}`.trim() }
          : null,
      })),
      total,
      page: Number(page),
      pages: Math.ceil(total / 30),
    };
  }

  @Get('config')
  @RequirePermissions('config.manage')
  async config() {
    const rows = await this.prisma.systemConfig.findMany();
    return Object.fromEntries(rows.map(r => [r.key, safeParse(r.value)]));
  }

  @Post('config')
  @RequirePermissions('config.manage')
  async setConfig(@Body(new ZodPipe(z.record(z.any()))) body: any) {
    for (const [key, value] of Object.entries(body)) {
      await this.prisma.systemConfig.upsert({
        where: { key },
        update: { value: JSON.stringify(value ?? null) },
        create: { key, value: JSON.stringify(value ?? null) },
      });
    }
    return this.config();
  }
}

type MigrationRow = {
  migration_name: string;
  finished_at: Date | string | null;
  rolled_back_at: Date | string | null;
};

function toIso(value: Date | string | null): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Dossiers `migration.sql` présents dans l'image, triés (le préfixe horodaté
 * rend l'ordre lexicographique chronologique). Candidats : cwd du conteneur
 * (`/app`), racine du workspace (`apps/api` en dev/test) et chemin relatif au
 * module compilé — les trois pointent vers le même dossier sans dépendre du
 * répertoire courant.
 */
function readMigrationFolders(): string[] {
  const candidates = [
    path.resolve(process.cwd(), 'prisma', 'migrations'),
    path.resolve(process.cwd(), 'apps', 'api', 'prisma', 'migrations'),
    path.resolve(__dirname, '..', '..', '..', 'prisma', 'migrations'),
  ];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) continue;
      const names = fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'migration.sql')))
        .map(d => d.name)
        .sort();
      if (names.length > 0) return names;
    } catch {
      // dossier illisible : candidat suivant
    }
  }
  return [];
}

/**
 * Lit dist/build-info.json sans jamais lever : sonde dégradée (valeurs vides)
 * si le fichier est absent ou illisible — par exemple en dev hors Docker.
 */
function readBuildInfo(): { version: string; builtAt: string } {
  try {
    const p = path.resolve(process.cwd(), 'dist', 'build-info.json');
    if (fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      return { version: String(parsed?.version ?? ''), builtAt: String(parsed?.builtAt ?? '') };
    }
  } catch {
    // build-info.json absent ou corrompu : jamais fatal
  }
  return { version: '', builtAt: '' };
}

function safeParse(v: string): any {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

@Module({ controllers: [HealthController, MigrationsController, AdminMiscController] })
export class AdminMiscModule {}

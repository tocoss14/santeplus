import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { MigrationsController } from '../src/modules/admin-misc/admin-misc.controller';

/** Dossiers réellement livrés : la sonde les compare à la table Prisma. */
const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'prisma', 'migrations');
const ON_DISK = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory() && fs.existsSync(path.join(MIGRATIONS_DIR, d.name, 'migration.sql')))
  .map(d => d.name)
  .sort();

const row = (name: string, overrides: Partial<Record<'finished_at' | 'rolled_back_at', Date | null>> = {}) => ({
  migration_name: name,
  finished_at: new Date('2026-10-21T10:00:00Z'),
  rolled_back_at: null,
  ...overrides,
});

function controllerWith(rows: any[] | Error) {
  const prisma: any = {
    $queryRaw: vi.fn(async () => {
      if (rows instanceof Error) throw rows;
      return rows;
    }),
  };
  return { controller: new MigrationsController(prisma), prisma };
}

describe('GET /api/migrations — état des migrations en lecture seule', () => {
  it('expose au moins les deux migrations postérieures au 9 octobre', () => {
    expect(ON_DISK).toContain('20261019000000_update_formulas');
    expect(ON_DISK).toContain('20261021000000_update_tarifs_prudents');
    // Plancher, pas égalité stricte : la prochaine migration livrée ne doit pas
    // faire échouer ce test — il vérifie une non-régression, pas un compte figé.
    expect(ON_DISK.length).toBeGreaterThanOrEqual(37);
  });

  it('base alignée sur l’image → up-to-date, dernier nom exposé', async () => {
    const { controller } = controllerWith(ON_DISK.map(n => row(n)));
    const res = await controller.migrations();

    expect(res.status).toBe('up-to-date');
    expect(res.applied).toBe(ON_DISK.length);
    expect(res.total).toBe(ON_DISK.length);
    expect(res.pending).toEqual([]);
    expect(res.failed).toEqual([]);
    expect(res.last).toEqual({ name: ON_DISK[ON_DISK.length - 1], finishedAt: '2026-10-21T10:00:00.000Z' });
  });

  it('migration livrée mais jamais appliquée → pending la nomme', async () => {
    const missing = ON_DISK[ON_DISK.length - 1];
    const { controller } = controllerWith(ON_DISK.filter(n => n !== missing).map(n => row(n)));
    const res = await controller.migrations();

    expect(res.status).toBe('pending');
    expect(res.pending).toEqual([missing]);
    expect(res.applied).toBe(ON_DISK.length - 1);
  });

  it('migration interrompue (ni finished_at ni rolled_back_at) → failed, jamais pending', async () => {
    const stuck = ON_DISK[ON_DISK.length - 2];
    const { controller } = controllerWith(
      ON_DISK.map(n => (n === stuck ? row(n, { finished_at: null }) : row(n))),
    );
    const res = await controller.migrations();

    expect(res.status).toBe('failed');
    expect(res.failed).toEqual([stuck]);
    expect(res.pending).toEqual([]);
    expect(res.applied).toBe(ON_DISK.length - 1);
  });

  it('migration annulée n’est pas comptée comme appliquée', async () => {
    const rolledBack = ON_DISK[0];
    const { controller } = controllerWith(
      ON_DISK.map(n => (n === rolledBack ? row(n, { rolled_back_at: new Date('2026-10-01T00:00:00Z') }) : row(n))),
    );
    const res = await controller.migrations();

    expect(res.rolledBack).toEqual([rolledBack]);
    expect(res.applied).toBe(ON_DISK.length - 1);
    expect(res.pending).toEqual([]);
  });

  it('base injoignable → status unknown et message, sans lever (route toujours 200)', async () => {
    const { controller } = controllerWith(new Error('connect ECONNREFUSED'));
    const res = await controller.migrations();

    expect(res.status).toBe('unknown');
    expect(res.applied).toBeNull();
    expect(res.total).toBe(ON_DISK.length);
    expect(res.last).toBeNull();
    expect(res.error).toMatch(/_prisma_migrations/);
  });

  it('n’expose ni URL de base ni secret dans la réponse', async () => {
    const { controller } = controllerWith(ON_DISK.map(n => row(n)));
    const body = JSON.stringify(await controller.migrations());

    expect(body).not.toMatch(/postgres(ql)?:\/\//i);
    expect(body).not.toMatch(/password/i);
  });
});

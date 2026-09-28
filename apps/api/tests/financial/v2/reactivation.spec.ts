import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialModelService } from '../../../src/modules/financial-model/financial-model.service';

const V1 = {
  id: 'fmv_v1_legacy',
  code: 'V1_LEGACY',
  label: 'V1 — Legacy (gelé)',
  status: 'ARCHIVED',
  engineVersion: 'V1',
  activatedAt: new Date('2019-01-01'),
  archivedAt: new Date('2026-09-01'),
};
const V2 = {
  id: 'fmv_v2_mutual',
  code: 'V2_MUTUAL',
  label: 'V2 — Mutualiste',
  status: 'ACTIVE',
  engineVersion: 'V2',
  activatedAt: new Date('2026-09-01'),
  archivedAt: null,
};

const actor = { id: 'admin-1', role: 'INSURANCE_MANAGER' };

function makePrisma(overrides: any = {}) {
  const tx: any = {
    financialModelVersion: {
      update: vi.fn(async ({ where, data }: any) => ({
        id: where.id,
        ...(where.id === 'fmv_v1_legacy' ? V1 : V2),
        ...data,
      })),
      findMany: vi.fn(async () => overrides.actives ?? []),
    },
    auditLog: { create: vi.fn(async (args: any) => ({ id: 'log-1', ...args.data })) },
  };
  const prisma: any = {
    financialModelVersion: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id === 'fmv_v1_legacy') return overrides.target ?? { ...V1 };
        if (where.id === 'fmv_v2_mutual') return { ...V2 };
        return null;
      }),
      findMany: vi.fn(async () => overrides.actives ?? []),
    },
    auditLog: { create: vi.fn(async (args: any) => ({ id: 'log-1', ...args.data })) },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
    ...overrides.prisma,
  };
  return { prisma, tx };
}

describe('réactivation des modèles financiers — volontaire, tracée, non rétroactive', () => {
  let service: FinancialModelService;

  beforeEach(() => {
    service = new FinancialModelService({} as any);
  });

  it('réactive une version ARCHIVée et journalise sans effet rétroactif', async () => {
    const { prisma, tx } = makePrisma({});
    const s = new FinancialModelService(prisma);
    await s.reactivateVersion('fmv_v1_legacy', actor, 'Reprise temporaire du portefeuille V1');
    const updateCalls = tx.financialModelVersion.update.mock.calls.map((c: any) => c[0]);
    expect(updateCalls.find((c: any) => c.where.id === 'fmv_v1_legacy')?.data.status).toBe('ACTIVE');
    const log = tx.auditLog.create.mock.calls[0][0].data;
    expect(log.action).toBe('FINANCIAL_MODEL_REACTIVATED');
    const meta = JSON.parse(log.meta);
    expect(meta.previousStatus).toBe('ARCHIVED');
    expect(meta.retroactiveEffect).toBe(false);
  });

  it('maintient l\u2019unicité de la version ACTIVE (les autres sont suspendues)', async () => {
    const { prisma, tx } = makePrisma({ actives: [V2] });
    const s = new FinancialModelService(prisma);
    await s.reactivateVersion('fmv_v1_legacy', actor, 'Reprise temporaire du portefeuille V1');
    const calls = tx.financialModelVersion.update.mock.calls.map((c: any) => c[0]);
    const suspend = calls.find(c => c.where.id === 'fmv_v2_mutual');
    expect(suspend.data.status).toBe('SUSPENDED');
    const reactivate = calls.find(c => c.where.id === 'fmv_v1_legacy');
    expect(reactivate.data.status).toBe('ACTIVE');
  });

  it('refuse un rôle non habilité', async () => {
    const { prisma } = makePrisma({});
    const s = new FinancialModelService(prisma);
    await expect(
      s.reactivateVersion('fmv_v1_legacy', { id: 'u-2', role: 'MEMBER' }, 'Reprise temporaire du portefeuille V1'),
    ).rejects.toThrow(/Habilitation/);
  });

  it('exige une justification de 10 caractères minimum', async () => {
    const { prisma } = makePrisma({});
    const s = new FinancialModelService(prisma);
    await expect(s.reactivateVersion('fmv_v1_legacy', actor, 'court !')).rejects.toThrow(/justification/i);
  });

  it('est idempotent si la version est déjà ACTIVE', async () => {
    const { prisma } = makePrisma({ target: { ...V1, status: 'ACTIVE' } });
    const s = new FinancialModelService(prisma);
    const result = await s.reactivateVersion('fmv_v1_legacy', actor, 'Reprise temporaire du portefeuille V1');
    expect(result?.status).toBe('ACTIVE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

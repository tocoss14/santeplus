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

const actor = { id: 'admin-1', role: 'INSURANCE_MANAGER' };

function makePrisma(overrides: any = {}) {
  const tx: any = {
    financialModelVersion: {
      update: vi.fn(async ({ where, data }: any) => ({ ...V1, ...data, id: where.id })),
      findMany: vi.fn(async () => []),
    },
    auditLog: { create: vi.fn(async (args: any) => ({ id: 'log-1', ...args.data })) },
  };
  const prisma: any = {
    financialModelVersion: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id === 'fmv_v1_legacy') return overrides.target ?? { ...V1 };
        return null;
      }),
      findFirst: vi.fn(async () => overrides.active ?? null),
      findMany: vi.fn(async () => overrides.actives ?? []),
    },
    contract: { count: vi.fn(async () => 42) },
    auditLog: { create: vi.fn(async (args: any) => ({ id: 'log-1', ...args.data })) },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
    ...overrides.prisma,
  };
  return { prisma, tx };
}

describe('archivage des modèles financiers — READ_ONLY, sans effet rétroactif', () => {
  let service: FinancialModelService;

  beforeEach(() => {
    service = new FinancialModelService({} as any);
  });

  it('archive une version ACTIVE avec justification et audit log', async () => {
    const { prisma, tx } = makePrisma({ target: { ...V1, status: 'ACTIVE' } });
    const s = new FinancialModelService(prisma);
    await s.archiveVersion('fmv_v1_legacy', actor, 'Gel réglementaire du modèle V1');
    const update = tx.financialModelVersion.update.mock.calls[0][0];
    expect(update.data.status).toBe('ARCHIVED');
    expect(update.data.archivedAt).toBeInstanceOf(Date);
    const log = tx.auditLog.create.mock.calls[0][0].data;
    expect(log.action).toBe('FINANCIAL_MODEL_ARCHIVED');
    const meta = JSON.parse(log.meta);
    expect(meta.readOnly).toBe(true);
    expect(meta.justification).toBe('Gel réglementaire du modèle V1');
    // 42 contrats actifs rattachés — ils sont conservés, non convertis.
    expect(meta.activeContractsAtArchive).toBe(42);
  });

  it('les 42 contrats rattachés restent servis par leur moteur d\u2019origine', async () => {
    const { prisma } = makePrisma({ target: { ...V1, status: 'ACTIVE' } });
    const s = new FinancialModelService(prisma);
    await s.archiveVersion('fmv_v1_legacy', actor, 'Gel réglementaire du modèle V1');
    // L'archivage ne touche à AUCUN contrat : count seul, jamais update.
    expect(prisma.contract.count).toHaveBeenCalledWith({
      where: { financialModelVersionId: 'fmv_v1_legacy', status: 'ACTIVE' },
    });
    expect(prisma.contract.update).toBeUndefined();
  });

  it('exige une justification substantielle', async () => {
    const { prisma } = makePrisma({});
    const s = new FinancialModelService(prisma);
    await expect(s.archiveVersion('fmv_v1_legacy', actor, 'court')).rejects.toThrow(/justification/i);
    await expect(s.archiveVersion('fmv_v1_legacy', actor, '')).rejects.toThrow(/justification/i);
  });

  it('est idempotent sur une version déjà archivée', async () => {
    const { prisma } = makePrisma({});
    const s = new FinancialModelService(prisma);
    const result = await s.archiveVersion('fmv_v1_legacy', actor, 'Gel réglementaire du modèle V1');
    expect(result?.status).toBe('ARCHIVED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialModelService, MIGRATION_FLOW } from '../../../src/modules/financial-model/financial-model.service';

const V1 = { id: 'fmv_v1_legacy', code: 'V1_LEGACY', engineVersion: 'V1' };
const V2 = { id: 'fmv_v2_mutual', code: 'V2_MUTUAL', engineVersion: 'V2' };
const actor = { id: 'admin-1', role: 'INSURANCE_MANAGER' };

function makePrisma() {
  const contract: any = {
    id: 'ctr-1',
    number: 'CTR-1',
    financialModelVersionId: null,
    migrationStatus: null,
  };
  let migration: any = null;
  const tx: any = {};
  const prisma: any = {
    contract: {
      findUnique: vi.fn(async () => ({
        ...contract,
        financialModelVersion: contract.financialModelVersionId === 'fmv_v2_mutual' ? { ...V2 } : { ...V1 },
      })),
      update: vi.fn(async ({ data }: any) => Object.assign(contract, data)),
    },
    financialModelVersion: {
      findUnique: vi.fn(async ({ where }: any) => (where.code === 'V2_MUTUAL' ? { ...V2 } : null)),
    },
    financialModelMigration: {
      findFirst: vi.fn(async () => migration),
      create: vi.fn(async (args: any) => {
        migration = { id: 'mig-1', snapshot: null, verification: null, ...args.data };
        return migration;
      }),
      update: vi.fn(async ({ data }: any) => {
        migration = { ...migration, ...data };
        return migration;
      }),
    },
    contribution: { findMany: vi.fn(async () => [{ status: 'PAID', amount: 120000 }]) },
    claim: { findMany: vi.fn(async () => []) },
    ctsJournal: { findMany: vi.fn(async () => [{ id: 'j-1' }, { id: 'j-2' }]) },
    fundCall: { findMany: vi.fn(async () => []) },
    auditLog: { create: vi.fn(async (args: any) => ({ id: 'log-1', ...args.data })) },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
  return { prisma, contract };
}

describe('migration contrôlée V1 → V2 — workflow en 7 phases', () => {
  let prisma: ReturnType<typeof makePrisma>['prisma'];
  let service: FinancialModelService;

  beforeEach(() => {
    const made = makePrisma();
    prisma = made.prisma;
    service = new FinancialModelService(prisma);
  });

  it('expose exactement les 7 phases du référentiel', () => {
    expect(MIGRATION_FLOW).toEqual([
      'ANALYSIS', 'PREVIEW', 'VALIDATION', 'SNAPSHOT', 'MIGRATION', 'VERIFICATION', 'CERTIFICATION',
    ]);
  });

  it('crée la migration en ANALYSIS puis avance directement en PREVIEW (analyse remplie)', async () => {
    const m = await service.advanceMigration('ctr-1', actor); // crée ANALYSIS → PREVIEW
    expect(prisma.financialModelMigration.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ANALYSIS', contractId: 'ctr-1' }) }),
    );
    expect(m.status).toBe('PREVIEW');
    const analysis = JSON.parse(m.analysis);
    expect(analysis.ruleDifferences.length).toBeGreaterThan(0);
    expect(analysis.contributions.paid).toBe(120000);
  });

  it('refuse MIGRATION sans snapshot préalable', async () => {
    await service.advanceMigration('ctr-1', actor); // ANALYSIS
    await service.advanceMigration('ctr-1', actor); // PREVIEW
    await service.advanceMigration('ctr-1', actor); // VALIDATION
    // On saute SNAPSHOT volontairement : l'appel suivant demandera MIGRATION
    prisma.financialModelMigration.findFirst.mockResolvedValueOnce({
      id: 'mig-1', status: 'SNAPSHOT', snapshot: null, verification: null,
    });
    await expect(service.advanceMigration('ctr-1', actor)).rejects.toThrow(/SNAPSHOT/);
  });

  it('bascule le contrat vers V2 uniquement à la phase MIGRATION', async () => {
    for (let i = 0; i < 3; i++) await service.advanceMigration('ctr-1', actor); // → SNAPSHOT
    expect(prisma.contract.update).not.toHaveBeenCalled();
    await service.advanceMigration('ctr-1', actor); // → MIGRATION
    expect(prisma.contract.update).toHaveBeenCalledWith({
      where: { id: 'ctr-1' },
      data: { financialModelVersionId: 'fmv_v2_mutual', migrationStatus: 'MIGRATION_PENDING' },
    });
  });

  it('certifie après vérification concluante et journalise', async () => {
    for (let i = 0; i < 4; i++) await service.advanceMigration('ctr-1', actor); // → MIGRATION
    const verified = await service.advanceMigration('ctr-1', actor); // → VERIFICATION
    expect(verified.status).toBe('VERIFICATION');
    const verification = JSON.parse(verified.verification);
    expect(verification.ok).toBe(true);
    expect(verification.checks.contractOnV2).toBe(true);
    const certified = await service.advanceMigration('ctr-1', actor); // → CERTIFICATION
    expect(certified.status).toBe('CERTIFICATION');
    expect(certified.certifiedAt).toBeInstanceOf(Date);
    const log = prisma.auditLog.create.mock.calls[0][0].data;
    expect(log.action).toBe('FINANCIAL_MODEL_MIGRATION_CERTIFIED');
    expect(prisma.contract.update).toHaveBeenCalledWith({
      where: { id: 'ctr-1' },
      data: { migrationStatus: 'MIGRATED_TO_V2' },
    });
  });

  it('la vérification échoue si le contrat n\u2019est pas sur V2 après MIGRATION', async () => {
    for (let i = 0; i < 4; i++) await service.advanceMigration('ctr-1', actor); // → MIGRATION
    // Le contrat redevient V1 : la vérification doit le détecter.
    prisma.contract.findUnique.mockResolvedValueOnce({ id: 'ctr-1', financialModelVersion: { ...V1 } });
    prisma.contract.findUnique.mockResolvedValueOnce({ id: 'ctr-1', financialModelVersion: { ...V1 } });
    const verified = await service.advanceMigration('ctr-1', actor); // → VERIFICATION
    const verification = JSON.parse(verified.verification);
    expect(verification.ok).toBe(false);
    expect(verification.checks.contractOnV2).toBe(false);
  });
});

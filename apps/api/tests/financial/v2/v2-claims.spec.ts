import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CtsV2Service } from '../../../src/modules/financial-model/cts-v2.service';

function makePrisma() {
  return {
    contribution: { findMany: vi.fn(async () => []) },
    claim: { findMany: vi.fn(async () => []) },
    contract: {
      findUnique: vi.fn(async () => null),
    },
  };
}

describe('V2 — prestations : engagées vs payées', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: CtsV2Service;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CtsV2Service(prisma as any);
  });

  it('sépare le payé (PAID) de l\u2019engagé (décidé non réglé)', async () => {
    prisma.claim.findMany.mockResolvedValue([
      { status: 'PAID', totalRequested: 50000, totalApproved: 45000 },
      { status: 'APPROVED', totalRequested: 30000, totalApproved: 28000 },
      { status: 'PARTIALLY_APPROVED', totalRequested: 20000, totalApproved: 12000 },
    ]);
    const r = await service.collectClaims(['ctr-1']);
    expect(r.paid).toBe(45000);
    expect(r.engaged).toBe(28000 + 12000);
    expect(r.count).toBe(3);
  });

  it('filtre sur les statuts techniques (les rejets ne pèsent jamais)', async () => {
    await service.collectClaims(['ctr-1']);
    const where = prisma.claim.findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(['APPROVED', 'PARTIALLY_APPROVED', 'PAID']);
    expect(where.contractId).toEqual({ in: ['ctr-1'] });
  });

  it('retourne des zéros sur un périmètre vide sans requête inutile', async () => {
    const r = await service.collectClaims([]);
    expect(r).toEqual({ engaged: 0, paid: 0, count: 0 });
    expect(prisma.claim.findMany).not.toHaveBeenCalled();
  });

  it('tombe sur le demandé quand l\u2019approbation est absente', async () => {
    prisma.claim.findMany.mockResolvedValue([{ status: 'PAID', totalRequested: 7000 }]);
    const r = await service.collectClaims(['ctr-1']);
    expect(r.paid).toBe(7000);
  });
});

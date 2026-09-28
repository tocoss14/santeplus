import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CtsV2Service } from '../../../src/modules/financial-model/cts-v2.service';
import { computeTechnicalResult } from '../../../src/domain/financial-model-v2';

function makePrisma() {
  return {
    contribution: { findMany: vi.fn(async () => []) },
    claim: { findMany: vi.fn(async () => []) },
    contract: {
      findUnique: vi.fn(async (args: any) => {
        if (args.where.id === 'ctr-v2') {
          return {
            id: 'ctr-v2',
            number: 'CTR-V2',
            financialModelVersion: { code: 'V2_MUTUAL', engineVersion: 'V2' },
          };
        }
        if (args.where.id === 'ctr-v1') {
          return {
            id: 'ctr-v1',
            number: 'CTR-V1',
            financialModelVersion: { code: 'V1_LEGACY', engineVersion: 'V1' },
          };
        }
        return null;
      }),
    },
  };
}

describe('V2 — résultat technique et net (moteur)', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: CtsV2Service;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CtsV2Service(prisma as any);
  });

  it('calcule position, résultat, réserve et solvabilité pour un contrat V2', async () => {
    prisma.contribution.findMany.mockResolvedValue([
      { status: 'PAID', amount: 200000 },
      { status: 'PAID', amount: 100000 },
      { status: 'PENDING', amount: 50000 },
    ]);
    prisma.claim.findMany.mockResolvedValue([
      { status: 'APPROVED', totalRequested: 30000, totalApproved: 28000 },
      { status: 'PAID', totalRequested: 60000, totalApproved: 55000 },
    ]);

    const r = await service.contractPosition('ctr-v2');
    expect(r.aggregates.contributions).toBe(300000);
    expect(r.aggregates.engagedClaims).toBe(28000);
    expect(r.aggregates.paidClaims).toBe(55000);
    expect(r.stampedModel).toBe('V2_MUTUAL');
    // position = 300000 − 83000 (charges 0) − 0 provisions + 0 recouvrements
    expect(r.position.position).toBe(217000);
    expect(r.result.technicalResult).toBe(217000);
    // dotation = min(10 % × 300000, position) = 30000
    expect(r.reserveAllocation).toBe(30000);
  });

  it('refuse un contrat V1 : le moteur est déterminé par le modèle du contrat', async () => {
    await expect(service.contractPosition('ctr-v1')).rejects.toThrow(/V2_MUTUAL/);
  });

  it('refuse un contrat inconnu', async () => {
    await expect(service.contractPosition('ctr-ghost')).rejects.toThrow('Contrat introuvable');
  });

  it('le résultat technique sombre en perte quand les sinistres explosent', () => {
    const r = computeTechnicalResult({
      contributions: 100000,
      engagedClaims: 40000,
      paidClaims: 90000,
      expenses: 12000,
      reinsuranceCessionRate: 0,
      solidarityFund: 0,
      solidarityShareOfSurplus: 0.2,
    });
    expect(r.technicalResult).toBe(-42000);
    expect(r.netResult).toBe(-42000);
  });
});

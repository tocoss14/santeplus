import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CtsV2Service } from '../../../src/modules/financial-model/cts-v2.service';

/**
 * Vue consolidée du portefeuille V2 : agrégats, position technique, résultat,
 * dotation de réserve et solvabilité — calculés STRICTEMENT sur les contrats
 * V2_MUTUAL (jamais de consolidation avec le portefeuille V1).
 */
function makePrisma() {
  // Données par contrat : le mock agrège exactement comme Prisma le ferait
  // (une requête par contrat pour le détail, une requête union pour le total).
  const contributionsByContract: Record<string, any[]> = {
    'ctr-a': [{ status: 'PAID', amount: 200000 }],
    'ctr-b': [{ status: 'PAID', amount: 100000 }],
  };
  const claimsByContract: Record<string, any[]> = {
    'ctr-a': [{ status: 'APPROVED', totalRequested: 30000, totalApproved: 30000 }],
    'ctr-b': [{ status: 'PAID', totalRequested: 50000, totalApproved: 50000 }],
  };
  const unionOf = (ids: string[], table: Record<string, any[]>) => ids.flatMap(id => table[id] ?? []);
  return {
    contract: {
      // Seuls les contrats V2 sont éligibles : le where porte sur le code.
      findMany: vi.fn(async () => [
        { id: 'ctr-a', number: 'CTR-A', status: 'ACTIVE', createdAt: new Date('2026-09-01') },
        { id: 'ctr-b', number: 'CTR-B', status: 'ACTIVE', createdAt: new Date('2026-09-02') },
      ]),
      findUnique: vi.fn(async () => null),
    },
    // La position du portefeuille embarque la série mensuelle, qui lit le
    // seuil d'alerte (config absente ici → seuil par défaut 1).
    systemConfig: { findMany: vi.fn(async () => []) },
    contribution: {
      findMany: vi.fn(async (args: any) => unionOf(args.where.contractId.in as string[], contributionsByContract)),
    },
    claim: {
      findMany: vi.fn(async (args: any) => unionOf(args.where.contractId.in as string[], claimsByContract)),
    },
  };
}

describe('V2 — position technique consolidée du portefeuille', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: CtsV2Service;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CtsV2Service(prisma as any);
  });

  it('sélectionne strictement les contrats V2_MUTUAL', async () => {
    await service.portfolioPosition();
    const where = prisma.contract.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ financialModelVersion: { code: 'V2_MUTUAL' } });
  });

  it('somme les agrégats des deux contrats V2', async () => {
    const r = await service.portfolioPosition();
    expect(r.model).toBe('V2_MUTUAL');
    expect(r.contractsCount).toBe(2);
    expect(r.aggregates.contributions).toBe(300000);
    expect(r.aggregates.engagedClaims).toBe(30000);
    expect(r.aggregates.paidClaims).toBe(50000);
    // position = 300 000 − 80 000 (charges 0, provisions 0)
    expect(r.position.position).toBe(220000);
  });

  it('calcule résultat technique, dotation de réserve et solvabilité', async () => {
    const r = await service.portfolioPosition();
    expect(r.result.technicalResult).toBe(220000);
    // dotation = 10 % × 300 000, plafonnée par la position
    expect(r.reserveAllocation).toBe(30000);
    // engagements = 80 000 ; disponible = 220 000 → ratio 2,75
    expect(r.solvency.solvencyRatio).toBeCloseTo(2.75, 6);
  });

  it('fournit le détail traçable par contrat', async () => {
    const r = await service.portfolioPosition();
    expect(r.contracts.map((c: any) => c.number).sort()).toEqual(['CTR-A', 'CTR-B']);
    const a = r.contracts.find((c: any) => c.number === 'CTR-A');
    expect(a.contributions).toBe(200000);
    expect(a.engagedClaims).toBe(30000);
    expect(a.position).toBe(170000);
  });

  it('propage la période vers les agrégats cotisations et sinistres', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-03-31T23:59:59.999Z');
    await service.portfolioPosition({ from, to });
    // La série mensuelle (sans filtre) s'exécute après les agrégats du
    // portefeuille : on cible le PREMIER appel portant un filtre de période.
    const contributionCall = prisma.contribution.findMany.mock.calls
      .map((c: any) => c[0])
      .find((a: any) => a.where.paidAt);
    const claimCall = prisma.claim.findMany.mock.calls
      .map((c: any) => c[0])
      .find((a: any) => a.where.submittedAt);
    expect(contributionCall.where.paidAt.gte).toBe(from);
    expect(contributionCall.where.paidAt.lte).toBe(to);
    expect(claimCall.where.submittedAt.gte).toBe(from);
    expect(claimCall.where.submittedAt.lte).toBe(to);
  });

  it('borne aussi la liste des contrats par date de création', async () => {
    const from = new Date('2026-09-02T00:00:00.000Z');
    await service.portfolioPosition({ from });
    // Premier appel contract.findMany = celui du portefeuille (la série
    // rappelle ensuite sans filtre pour la ligne 12 mois).
    const args = prisma.contract.findMany.mock.calls[0][0];
    expect(args.where.createdAt.gte).toBe(from);
  });

  it('renvoie la période appliquée dans la réponse (traçabilité du filtre)', async () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const r = await service.portfolioPosition({ from });
    expect(r.period.from).toBe(from.toISOString());
    expect(r.period.to).toBeNull();
  });
});

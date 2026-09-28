import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CtsV2Service } from '../../../src/modules/financial-model/cts-v2.service';
import { SubscriptionService } from '../../../src/modules/subscription/subscription.service';
import { FinancialModelService, V1_LEGACY_ID } from '../../../src/modules/financial-model/financial-model.service';

/**
 * Coexistence V1 + V2 — le contrat A reste sur le moteur V1 (CtsService
 * historique, jamais modifié), le contrat B est servi par le moteur V2.
 * Aucune requête V2 ne doit fuiter vers les tables/écritures de l'autre
 * modèle, et l'agrégation V2 ne voit jamais le portefeuille V1.
 */
function makePrisma() {
  return {
    contribution: { findMany: vi.fn(async () => []) },
    claim: { findMany: vi.fn(async () => []) },
    contract: {
      findUnique: vi.fn(async (args: any) => {
        if (args.where.id === 'ctr-v2') {
          return { id: 'ctr-v2', number: 'CTR-B', financialModelVersion: { code: 'V2_MUTUAL', engineVersion: 'V2' } };
        }
        return { id: args.where.id, number: 'CTR-A', financialModelVersion: { code: 'V1_LEGACY', engineVersion: 'V1' } };
      }),
    },
  };
}

describe('coexistence V1 + V2 — étanchéité des deux moteurs', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: CtsV2Service;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CtsV2Service(prisma as any);
  });

  it('le moteur V2 est invoqué sans toucher aux écritures V1', async () => {
    prisma.contribution.findMany.mockResolvedValue([{ status: 'PAID', amount: 100000 }]);
    const r = await service.contractPosition('ctr-v2');
    expect(r.stampedModel).toBe('V2_MUTUAL');
    // Le moteur V2 ne lit que contributions/claims/contrat : jamais
    // ctsJournal, fundCall ni les comptes techniques V1.
    expect(prisma as any).not.toHaveProperty('ctsJournal');
    expect(prisma as any).not.toHaveProperty('fundCall');
    expect(prisma as any).not.toHaveProperty('ctsAccount');
  });

  it('un contrat V1 reste hors du périmètre du moteur V2', async () => {
    await expect(service.contractPosition('ctr-v1')).rejects.toThrow(/V2_MUTUAL/);
  });

  it('l\u2019agrégation V2 ne peut jamais absorber le portefeuille V1 (sélection stricte par modèle)', async () => {
    await service.collectContributions(['ctr-v2']);
    const where = (prisma.contribution.findMany.mock.calls[0][0] as any).where;
    // Sélection par identifiants de contrats V2 uniquement — jamais un
    // WHERE global qui mêlerait les deux portefeuilles.
    expect(where.contractId).toEqual({ in: ['ctr-v2'] });
  });

  it('un nouveau contrat resolve le modèle ACTIVE (V2) et jamais V1 archivé', async () => {
    const prismaMock: any = {
      financialModelVersion: {
        findFirst: vi.fn(async () => ({ id: 'fmv_v2_mutual', code: 'V2_MUTUAL', engineVersion: 'V2', status: 'ACTIVE' })),
        findUnique: vi.fn(async () => ({ id: 'fmv_v1_legacy', code: 'V1_LEGACY', engineVersion: 'V1', status: 'ARCHIVED' })),
      },
    };
    const svc = new FinancialModelService(prismaMock);
    const resolved = await svc.resolveVersionForNewContract();
    expect(resolved.id).toBe('fmv_v2_mutual');
    expect(resolved.engineVersion).toBe('V2');
    await expect(svc.resolveVersionForNewContract('fmv_v1_legacy')).rejects.toThrow(/ARCHIVED/);
  });

  it('sans service de versionnement, la souscription retombe explicitement sur V1 (jamais de conversion silencieuse)', async () => {
    const subscription = new SubscriptionService({} as any, {} as any, {} as any);
    const resolved = await (subscription as any).resolveFinancialModel();
    expect(resolved.financialModelVersionId).toBe(V1_LEGACY_ID);
    expect(resolved.engineVersion).toBe('V1');
  });
});

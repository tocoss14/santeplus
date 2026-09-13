import { describe, expect, it, vi } from 'vitest';
import { ContractsService } from '../src/modules/contracts/contracts.controller';

function makeService(contract: any) {
  const prisma: any = {
    contract: {
      findUnique: vi.fn(async () => contract),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(contract, data);
        return contract;
      }),
    },
  };
  return new ContractsService(prisma);
}

const auth: any = { id: 'u1', role: 'MEMBER' };

function oldMutualiste() {
  return {
    id: 'c1', principalUserId: 'u1', riskModel: 'MUTUALITE',
    riskModelSince: new Date(Date.now() - 30 * 30.44 * 86400000),
    createdAt: new Date(Date.now() - 30 * 30.44 * 86400000),
  };
}

describe('changeRiskModel (garde anti-antisélection 24 mois)', () => {
  it('même modèle : aucun changement', async () => {
    const svc = makeService(oldMutualiste());
    await expect(svc.changeRiskModel(auth, 'c1', 'MUTUALITE')).resolves.toMatchObject({ changed: false });
  });

  it('entrée en MUTUALITE toujours libre', async () => {
    const contract = { id: 'c1', principalUserId: 'u1', riskModel: 'INDIVIDUEL', createdAt: new Date() };
    const svc = makeService(contract);
    const r = await svc.changeRiskModel(auth, 'c1', 'MUTUALITE');
    expect(r).toMatchObject({ changed: true, riskModel: 'MUTUALITE' });
    expect(contract.riskModelSince).toBeTruthy();
  });

  it('sortie vers INDIVIDUEL refusée avant 24 mois', async () => {
    const contract = {
      id: 'c1', principalUserId: 'u1', riskModel: 'MUTUALITE',
      riskModelSince: new Date(Date.now() - 6 * 30.44 * 86400000),
      createdAt: new Date(Date.now() - 6 * 30.44 * 86400000),
    };
    const svc = makeService(contract);
    await expect(svc.changeRiskModel(auth, 'c1', 'INDIVIDUEL')).rejects.toThrow('24 mois');
    expect(contract.riskModel).toBe('MUTUALITE');
  });

  it('sortie vers INDIVIDUEL autorisée après 24 mois', async () => {
    const svc = makeService(oldMutualiste());
    const r = await svc.changeRiskModel(auth, 'c1', 'INDIVIDUEL');
    expect(r).toMatchObject({ changed: true, riskModel: 'INDIVIDUEL' });
  });

  it('utilise createdAt en repli si riskModelSince absent', async () => {
    const contract = {
      id: 'c1', principalUserId: 'u1', riskModel: 'MUTUALITE',
      createdAt: new Date(Date.now() - 36 * 30.44 * 86400000),
    };
    const svc = makeService(contract);
    await expect(svc.changeRiskModel(auth, 'c1', 'INDIVIDUEL')).resolves.toMatchObject({ changed: true });
  });
});

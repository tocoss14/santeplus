import { describe, expect, it, vi } from 'vitest';
import { ProductsService, ctsConfigSchema } from '../src/modules/products/products.controller';

// P12 : ctsConfig produit (validation + persistance) et familyLimit garantie.

function makePrisma() {
  const store: any = { products: {}, guarantees: [] };
  const tx: any = {
    product: {
      findUnique: vi.fn(async ({ where }: any) => Object.values(store.products).find((p: any) => p.id === where.id) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const p = { id: 'prod-1', ...data };
        store.products[p.id] = p;
        return p;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(store.products[where.id], data);
        return store.products[where.id];
      }),
    },
    productGuarantee: {
      createMany: vi.fn(async ({ data }: any) => {
        store.guarantees.push(...data);
        return { count: data.length };
      }),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    productExclusion: {
      createMany: vi.fn(async () => ({ count: 0 })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  const prisma: any = {
    product: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.code
          ? Object.values(store.products).find((p: any) => p.code === where.code) ?? null
          : (store.products[where.id] ?? null),
      ),
      findMany: vi.fn(async () => []),
    },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  return { prisma, store };
}

const baseDto = () => ({
  code: 'TST',
  name: 'Test',
  basePremiumAnnual: 100_000,
});

describe('ctsConfigSchema (P12)', () => {
  it('défauts : gestion 20, seuils 50/30/10, report 70, DEDUCT', () => {
    const parsed = ctsConfigSchema.parse({});
    expect(parsed).toMatchObject({
      managementRate: 20, warnRatio: 50, alertRatio: 30, criticalRatio: 10, carryRate: 70, renewalMode: 'DEDUCT',
    });
  });

  it('seuils non ordonnés → rejeté', () => {
    expect(() => ctsConfigSchema.parse({ warnRatio: 30, alertRatio: 50, criticalRatio: 10 })).toThrow();
    expect(() => ctsConfigSchema.parse({ warnRatio: 60, alertRatio: 60, criticalRatio: 10 })).toThrow();
  });

  it('stop-loss optionnel, taux bornés', () => {
    const parsed = ctsConfigSchema.parse({ managementRate: 15, stopLoss: { threshold: 10_000_000, cap: 5_000_000 } });
    expect(parsed.stopLoss).toEqual({ threshold: 10_000_000, cap: 5_000_000 });
    expect(() => ctsConfigSchema.parse({ managementRate: 150 })).toThrow();
  });
});

describe('ProductsService.create/update (P12)', () => {
  it('create persiste ctsConfig en JSON + familyLimit garantie', async () => {
    const { prisma, store } = makePrisma();
    const svc = new ProductsService(prisma);
    const id = await svc.create({
      ...baseDto(),
      ctsConfig: { managementRate: 15, warnRatio: 60, alertRatio: 40, criticalRatio: 20 },
      guarantees: [{ guaranteeId: 'g1', annualLimit: 100_000, familyLimit: 250_000 }],
    });
    expect(store.products[id].ctsConfig).toBe(
      JSON.stringify({ managementRate: 15, warnRatio: 60, alertRatio: 40, criticalRatio: 20 }),
    );
    expect(store.guarantees[0]).toMatchObject({ guaranteeId: 'g1', familyLimit: 250_000, productId: id });
  });

  it('create sans ctsConfig : colonne absente (défaut schéma {})', async () => {
    const { prisma, store } = makePrisma();
    const svc = new ProductsService(prisma);
    const id = await svc.create(baseDto());
    expect('ctsConfig' in store.products[id]).toBe(false);
  });

  it('update partiel ctsConfig (objet ou chaîne)', async () => {
    const { prisma, store } = makePrisma();
    const svc = new ProductsService(prisma);
    const id = await svc.create(baseDto());
    await svc.update(id, { ctsConfig: { managementRate: 10 } });
    expect(JSON.parse(store.products[id].ctsConfig).managementRate).toBe(10);
    await svc.update(id, { ctsConfig: JSON.stringify({ managementRate: 12 }) });
    expect(JSON.parse(store.products[id].ctsConfig).managementRate).toBe(12);
  });
});

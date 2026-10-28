import { describe, expect, it, vi } from 'vitest';
import { ProductsService, ctsConfigSchema, forfaitPricingIssue, productBaseSchema } from '../src/modules/products/products.controller';

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

// Écran d'administration des formules : forfait familial (composition incluse
// + suppléments par personne) et surprime du rachat de carence. Le PATCH passe
// par productBaseSchema.partial() — ces champs doivent être acceptés et bornés.
describe('productBaseSchema — grille éditable depuis l’administration', () => {
  const adminFields = { includedAdults: 2, includedChildren: 3, carenceBuyoutRate: 25 };

  it('accepte la composition du forfait et la surprime de rachat', () => {
    const parsed = productBaseSchema.partial().parse(adminFields);
    expect(parsed).toMatchObject(adminFields);
  });

  it('un PATCH qui ne les mentionne pas ne les réécrit pas', () => {
    const parsed = productBaseSchema.partial().parse({ name: 'Santé Famille' });
    for (const key of Object.keys(adminFields)) expect(key in parsed).toBe(false);
  });

  it('refuse les valeurs hors bornes', () => {
    expect(() => productBaseSchema.partial().parse({ includedAdults: 11 })).toThrow();
    expect(() => productBaseSchema.partial().parse({ includedChildren: 16 })).toThrow();
    expect(() => productBaseSchema.partial().parse({ carenceBuyoutRate: 201 })).toThrow();
    expect(() => productBaseSchema.partial().parse({ carenceBuyoutRate: -1 })).toThrow();
    expect(() => productBaseSchema.partial().parse({ includedAdults: 2.5 })).toThrow();
  });

  it('les défauts laissent les formules existantes inchangées (1 adulte, 0 enfant, option non proposée)', () => {
    const parsed = productBaseSchema.parse({ code: 'TST', name: 'Test', basePremiumAnnual: 100_000 });
    expect(parsed).toMatchObject({ includedAdults: 1, includedChildren: 0, carenceBuyoutRate: 0 });
  });

  it('refuse un forfait qui couvrirait gratuitement les membres au-delà', async () => {
    expect(forfaitPricingIssue({ includedAdults: 2, pricePerAdditionalAdultAnnual: 0 })).toMatch(/supplément par adulte/);
    expect(forfaitPricingIssue({ includedChildren: 3, pricePerChildAnnual: 0 })).toMatch(/supplément par enfant/);

    const { prisma } = makePrisma();
    const svc = new ProductsService(prisma);
    await expect(
      svc.create({ code: 'TST', name: 'Test', basePremiumAnnual: 75_000, includedAdults: 2 }),
    ).rejects.toThrow(/supplément par adulte/);

    // Suppléments tarifés : la grille passe.
    await expect(
      svc.create({
        code: 'TST2', name: 'Test 2', basePremiumAnnual: 75_000,
        includedAdults: 2, includedChildren: 3,
        pricePerAdditionalAdultAnnual: 30_000, pricePerChildAnnual: 18_000,
      }),
    ).resolves.toBeTruthy();
  });

  it('une formule collective n’est pas concernée (tarif par salarié)', async () => {
    expect(forfaitPricingIssue({ clientType: 'COMPANY', includedChildren: 3, pricePerChildAnnual: 0 })).toBeNull();
    const { prisma } = makePrisma();
    const svc = new ProductsService(prisma);
    await expect(
      svc.create({
        code: 'ENT', name: 'Entreprise', basePremiumAnnual: 300_000, clientType: 'COMPANY',
        includedAdults: 2, includedChildren: 3, pricePerAdditionalAdultAnnual: 0, pricePerChildAnnual: 0,
      }),
    ).resolves.toBeTruthy();
  });

  it('update partiel : la cohérence se juge sur l’état fusionné, pas sur le corps reçu', async () => {
    const { prisma, store } = makePrisma();
    const svc = new ProductsService(prisma);
    const id = await svc.create({ ...baseDto(), includedAdults: 1, pricePerAdditionalAdultAnnual: 0 });
    // Le corps ne porte qu'une inclusion : c'est le supplément (déjà à 0 en base)
    // qui rend la grille incohérente — le service doit le voir.
    await expect(svc.update(id, { includedAdults: 2 })).rejects.toThrow(/supplément par adulte/);
    expect(store.products[id].includedAdults).toBe(1);
    // En tarifant le supplément dans la même requête, la grille devient valide.
    await svc.update(id, { includedAdults: 2, pricePerAdditionalAdultAnnual: 30_000 });
    expect(store.products[id]).toMatchObject({ includedAdults: 2, pricePerAdditionalAdultAnnual: 30_000 });
  });

  it('update persiste la grille modifiée par l’administration', async () => {
    const { prisma, store } = makePrisma();
    const svc = new ProductsService(prisma);
    const id = await svc.create({ ...baseDto(), ...adminFields, pricePerAdditionalAdultAnnual: 15_000, pricePerChildAnnual: 10_000 });
    expect(store.products[id]).toMatchObject(adminFields);
    await svc.update(id, { includedAdults: 4, pricePerAdditionalAdultAnnual: 30_000, carenceBuyoutRate: 40 });
    expect(store.products[id]).toMatchObject({
      includedAdults: 4,
      // Les champs non transmis restent intacts : le PATCH est partiel.
      includedChildren: 3,
      pricePerAdditionalAdultAnnual: 30_000,
      carenceBuyoutRate: 40,
    });
  });
});

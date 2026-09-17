import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { QuoteService } from '../src/modules/quote/quote.controller';

function makePrisma(product: any) {
  return {
    product: { findUnique: vi.fn().mockResolvedValue(product) },
    guarantee: { findMany: vi.fn().mockResolvedValue([]) },
  } as any;
}

const baseProduct = {
  id: 'prod1',
  status: 'ACTIVE',
  waitingPeriodDays: 30,
  globalAnnualCap: 5000000,
  oopAnnualCap: 100000,
  guarantees: [
    {
      annualLimit: 500000,
      familyLimit: null,
      rate: 70,
      minRate: 50,
      maxRate: 95,
      copayRate: 30,
      maxUnitPrice: null,
      guarantee: { category: 'CONSULTATION', name: 'Consultations' },
    },
  ],
  exclusions: [],
};

describe('QuoteService.estimate — le simulateur passe par le moteur réel des sinistres', () => {
  it('le taux est la vérité : 70 % remboursés, ticket = complément 30 % (pas de taux net)', async () => {
    const svc = new QuoteService(makePrisma(baseProduct));
    const res = await svc.estimate({
      productId: 'prod1',
      items: [{ categoryId: 'CONSULTATION', amountRequested: 10000 }],
    });
    const item = res.items[0];
    expect(item.amountEligible).toBe(10000);
    expect(item.rateApplied).toBe(70);
    expect(item.copayApplied).toBe(3000);
    expect(item.amountApproved).toBe(7000);
    expect(res.totals.approved).toBe(7000);
    expect(res.totals.outOfPocket).toBe(3000);
  });

  it('applique le barème (maxUnitPrice) : éligible borné au prix de référence', async () => {
    const svc = new QuoteService(makePrisma({
      ...baseProduct,
      guarantees: [{ ...baseProduct.guarantees[0], maxUnitPrice: 5000 }],
    }));
    const res = await svc.estimate({
      productId: 'prod1',
      items: [{ categoryId: 'CONSULTATION', amountRequested: 10000 }],
    });
    expect(res.items[0].amountEligible).toBe(5000);
    expect(res.items[0].amountApproved).toBe(3500); // 5 000 × 70 % — le taux décide
  });

  it('neutralise le délai de carence : aucun flag WAITING_PERIOD, couverture réelle affichée', async () => {
    const svc = new QuoteService(makePrisma(baseProduct));
    const res = await svc.estimate({
      productId: 'prod1',
      items: [{ categoryId: 'CONSULTATION', amountRequested: 10000 }],
    });
    expect(res.flags.filter((f: string) => f.startsWith('WAITING_PERIOD'))).toEqual([]);
    expect(res.blocked ?? false).toBe(false);
  });

  it('borne par le plafond annuel de la garantie (annualLimit)', async () => {
    const svc = new QuoteService(makePrisma({
      ...baseProduct,
      guarantees: [{ ...baseProduct.guarantees[0], annualLimit: 3000 }],
    }));
    const res = await svc.estimate({
      productId: 'prod1',
      items: [{ categoryId: 'CONSULTATION', amountRequested: 10000 }],
    });
    // Éligible plafonné à 3 000 puis taux 70 % ⇒ 2 100 remboursés, ticket = complément
    expect(res.items[0].amountEligible).toBe(3000);
    expect(res.items[0].amountApproved).toBe(2100);
  });

  it('refuse un produit inexistant ou inactif (404)', async () => {
    const svc = new QuoteService(makePrisma(null));
    await expect(svc.estimate({ productId: 'nope1', items: [{ categoryId: 'X', amountRequested: 100 }] }))
      .rejects.toBeInstanceOf(NotFoundException);
    const svc2 = new QuoteService(makePrisma({ ...baseProduct, status: 'DRAFT' }));
    await expect(svc2.estimate({ productId: 'prod1', items: [{ categoryId: 'X', amountRequested: 100 }] }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('exclut les catégories d’exclusion du produit', async () => {
    const svc = new QuoteService(makePrisma({
      ...baseProduct,
      exclusions: [{ categoryId: 'DENTAL' }],
    }));
    const res = await svc.estimate({
      productId: 'prod1',
      items: [{ categoryId: 'DENTAL', amountRequested: 10000 }],
    });
    expect(res.items[0].amountApproved).toBe(0);
  });
});

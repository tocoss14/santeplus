/**
 * Forfait Famille + rachat de carence hospitalisation (migration 20261027000000).
 *
 * Deux régressions constatées en production le 2026-10-27 :
 *   1. Santé Famille facturait 0 FCFA par conjoint et par enfant : un foyer de 1
 *      comme de 5 personnes payait 75 000 FCFA, et le simulateur de la page
 *      d'accueil affichait le même montant quelle que soit la composition.
 *   2. Aucune formule ne permettait d'écourter la carence hospitalisation de
 *      90 jours — l'option de rachat existe désormais, tarifée sur le produit.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CARENCE_BUYOUT_CATEGORIES,
  computeFlexibleQuote,
  estimateClaim,
  type ClaimCtx,
  type ProductPricing,
} from '../src/domain/engine';
import { SubscriptionService } from '../src/modules/subscription/subscription.service';

const principal = { birthDate: new Date('1990-01-01'), relation: 'PRINCIPAL' as const };
const spouse = { birthDate: new Date('1992-03-03'), relation: 'SPOUSE' as const };
const grandParent = { birthDate: new Date('1965-02-02'), relation: 'OTHER' as const };
const child = (year: number) => ({ birthDate: new Date(`${year}-05-05`), relation: 'CHILD' as const });

/** Grille Santé Famille après migration : forfait 2 adultes + 3 enfants. */
const famPricing: ProductPricing = {
  basePremiumAnnual: 75000,
  includedAdults: 2,
  includedChildren: 3,
  pricePerAdditionalAdultAnnual: 30000,
  pricePerChildAnnual: 18000,
  carenceBuyoutRate: 25,
  frequencyFactors: { ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.06 },
  minAge: 0,
  maxAge: 65,
  ageLoadings: [],
  beneficiaryRules: { spouse: true, childMaxAge: 21, otherAllowed: true, maxBeneficiaries: 10 },
};

/** Grille Essentielle : rien d'inclus au-delà de l'assuré principal. */
const essPricing: ProductPricing = {
  basePremiumAnnual: 25000,
  pricePerAdditionalAdultAnnual: 25000,
  pricePerChildAnnual: 15000,
  carenceBuyoutRate: 25,
  frequencyFactors: { ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.06 },
  minAge: 0,
  maxAge: 65,
  ageLoadings: [],
};

describe('forfait Famille — composition incluse et suppléments', () => {
  it('2 adultes + 1 enfant : le forfait couvre déjà la famille, 75 000 FCFA', () => {
    const { quote, flexibleDetails } = computeFlexibleQuote(famPricing, [principal, spouse, child(2018)], 'ANNUAL');
    expect(quote!.totalAnnual).toBe(75000);
    expect(flexibleDetails!.beneficiaryCost).toBe(0);
    expect(quote!.lines.some(l => l.label.startsWith('Ayants droit'))).toBe(false);
  });

  it('2 adultes + 3 enfants : toujours le forfait, sans supplément', () => {
    const { quote } = computeFlexibleQuote(
      famPricing,
      [principal, spouse, child(2012), child(2015), child(2018)],
      'ANNUAL',
    );
    expect(quote!.totalAnnual).toBe(75000);
  });

  it('2 adultes + 4 enfants : un enfant au-delà du forfait = +18 000 FCFA', () => {
    const { quote } = computeFlexibleQuote(
      famPricing,
      [principal, spouse, child(2012), child(2015), child(2018), child(2021)],
      'ANNUAL',
    );
    expect(quote!.totalAnnual).toBe(93000);
  });

  it('3 adultes + 5 enfants : un adulte (+30 000) et deux enfants (+36 000) au-delà', () => {
    const { quote } = computeFlexibleQuote(
      famPricing,
      [principal, spouse, grandParent, child(2010), child(2012), child(2015), child(2018), child(2021)],
      'ANNUAL',
    );
    expect(quote!.totalAnnual).toBe(141000);
  });

  it('ligne de devis lisible : ayants droit hors forfait seulement', () => {
    const { quote } = computeFlexibleQuote(
      famPricing,
      [principal, spouse, child(2012), child(2015), child(2018), child(2021)],
      'ANNUAL',
    );
    const ligne = quote!.lines.find(l => l.label.startsWith('Ayants droit'));
    expect(ligne).toMatchObject({ label: 'Ayants droit (0 adulte + 1 enfant)', amount: 18000 });
  });

  it('Essentielle reste facturée par tête (aucune inclusion par défaut)', () => {
    const { quote } = computeFlexibleQuote(essPricing, [principal, spouse, child(2018)], 'ANNUAL');
    expect(quote!.totalAnnual).toBe(65000); // 25 000 + 25 000 + 15 000
  });
});

describe('rachat de carence hospitalisation — tarification', () => {
  it('ajoute une surprime de 25 % et une ligne explicite', () => {
    const { quote, flexibleDetails } = computeFlexibleQuote(
      famPricing,
      [principal, spouse, child(2018)],
      'ANNUAL',
      undefined,
      { carenceBuyout: true },
    );
    expect(flexibleDetails!.carenceBuyoutFee).toBe(18750); // 25 % de 75 000
    expect(quote!.totalAnnual).toBe(93750);
    expect(quote!.lines).toContainEqual({
      label: 'Rachat de carence hospitalisation (surprime 25 %)',
      amount: 18750,
    });
  });

  it('sans option, aucune surprime (comportement historique intact)', () => {
    const { quote, flexibleDetails } = computeFlexibleQuote(famPricing, [principal, spouse, child(2018)], 'ANNUAL');
    expect(flexibleDetails!.carenceBuyout).toBe(false);
    expect(quote!.totalAnnual).toBe(75000);
  });

  it('un produit qui ne propose pas l’option ne facture rien', () => {
    const { quote, flexibleDetails } = computeFlexibleQuote(
      { ...famPricing, carenceBuyoutRate: 0 },
      [principal],
      'ANNUAL',
      undefined,
      { carenceBuyout: true },
    );
    expect(flexibleDetails!.carenceBuyout).toBe(false);
    expect(quote!.totalAnnual).toBe(75000);
  });
});

describe('rachat de carence — effet sur l’estimation de sinistre', () => {
  const baseCtx: ClaimCtx = {
    contractStatus: 'ACTIVE',
    startDate: new Date('2026-10-10'),
    endDate: new Date('2027-10-09'),
    waitingPeriodDays: 30,
    excludedCategories: [],
    rules: [
      { categoryId: 'HOSPITALIZATION', annualLimit: 800000, rate: 85 },
      { categoryId: 'CONSULTATION', annualLimit: 200000, rate: 90 },
    ],
    usedPerCategory: {},
  };

  it('sans rachat : la carence globale de 30 jours bloque l’hospitalisation', () => {
    const r = estimateClaim(baseCtx, new Date('2026-10-20'), [
      { categoryId: 'HOSPITALIZATION', amountRequested: 100000 },
    ]);
    expect(r.items[0].amountApproved).toBe(0);
    expect(r.items[0].reason).toBe('WAITING_PERIOD');
    expect(r.ok).toBe(false);
  });

  it('avec rachat : l’hospitalisation passe, la consultation reste bloquée', () => {
    const r = estimateClaim(
      {
        ...baseCtx,
        globalWaitingExemptCategories: [...CARENCE_BUYOUT_CATEGORIES],
      },
      new Date('2026-10-20'),
      [
        { categoryId: 'HOSPITALIZATION', amountRequested: 100000 },
        { categoryId: 'CONSULTATION', amountRequested: 20000 },
      ],
    );
    expect(r.items[0].amountApproved).toBe(85000); // 85 % — couvert dès J+10
    expect(r.items[0].reason).toBeUndefined();
    expect(r.items[1].amountApproved).toBe(0);
    expect(r.items[1].reason).toBe('WAITING_PERIOD');
    expect(r.flags).toContain('CARENCE_RACHETEE:HOSPITALIZATION');
  });

  it('le rachat ne lève pas la carence maternité, qui garde son propre délai', () => {
    const r = estimateClaim(
      {
        ...baseCtx,
        rules: [{ categoryId: 'MATERNITY', annualLimit: 400000, rate: 85 }],
        categoryWaitingPeriods: { MATERNITY: 270 },
        globalWaitingExemptCategories: [...CARENCE_BUYOUT_CATEGORIES],
      },
      new Date('2026-10-25'),
      [{ categoryId: 'MATERNITY', amountRequested: 200000 }],
    );
    expect(r.items[0].amountApproved).toBe(0);
    expect(r.items[0].reason).toBe('WAITING_PERIOD');
  });

  it('un contrat inactif reste bloqué même avec le rachat', () => {
    const r = estimateClaim(
      {
        ...baseCtx,
        contractStatus: 'SUSPENDED',
        globalWaitingExemptCategories: [...CARENCE_BUYOUT_CATEGORIES],
      },
      new Date('2026-10-20'),
      [{ categoryId: 'HOSPITALIZATION', amountRequested: 100000 }],
    );
    expect(r.items[0].amountApproved).toBe(0);
    expect(r.items[0].reason).toBe('CONTRACT_INACTIVE');
  });
});

describe('devis — règles d’ayants droit et option de rachat', () => {
  function serviceWith(product: any) {
    const prisma: any = {
      product: { findUnique: vi.fn(async () => product) },
      systemConfig: { findMany: vi.fn(async () => []) },
    };
    return new SubscriptionService(prisma, {} as any, {} as any);
  }

  const famProduct = {
    id: 'fam-1',
    code: 'FAM',
    name: 'Santé Famille',
    clientType: 'INDIVIDUAL',
    status: 'ACTIVE',
    basePremiumAnnual: 75000,
    includedAdults: 2,
    includedChildren: 3,
    pricePerAdditionalAdultAnnual: 30000,
    pricePerChildAnnual: 18000,
    carenceBuyoutRate: 25,
    frequencyFactors: JSON.stringify({ ANNUAL: 1 }),
    minAge: 0,
    maxAge: 65,
    waitingPeriodDays: 30,
    beneficiaryRules: JSON.stringify({ spouse: true, childMaxAge: 21, otherAllowed: true, maxBeneficiaries: 10 }),
    ageLoadings: JSON.stringify([]),
    guarantees: [],
  };

  it('le devis applique le quota d’ayants droit, comme la souscription', async () => {
    const service = serviceWith(famProduct);
    const trop = Array.from({ length: 11 }, (_, i) => ({
      birthDate: new Date(`20${String(10 + i).padStart(2, '0')}-01-01`),
      relation: 'CHILD',
    }));
    await expect(
      service.quote('fam-1', new Date('1990-01-01'), trop as any, 'ANNUAL'),
    ).rejects.toThrow("Nombre maximum d'ayants droit : 10");
  });

  it('le devis chiffre le rachat de carence', async () => {
    const service = serviceWith(famProduct);
    const res = await service.quote(
      'fam-1',
      new Date('1990-01-01'),
      [{ birthDate: new Date('1992-03-03'), relation: 'SPOUSE' }] as any,
      'ANNUAL',
      undefined,
      { carenceBuyout: true },
    );
    expect(res.quote.totalAnnual).toBe(93750);
    expect(res.flexibleDetails!.carenceBuyout).toBe(true);
  });

  it('refuse le rachat sur une formule qui ne le propose pas', async () => {
    const service = serviceWith({ ...famProduct, carenceBuyoutRate: 0 });
    await expect(
      service.quote('fam-1', new Date('1990-01-01'), [], 'ANNUAL', undefined, { carenceBuyout: true }),
    ).rejects.toThrow("Le rachat de carence n'est pas proposé sur cette formule");
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CtsV2Service } from '../../../src/modules/financial-model/cts-v2.service';

/**
 * Série mensuelle de la marge de solvabilité V2 (graphique admin) :
 * flux cumulés en fin de mois, seuil lu depuis SystemConfig, convention
 * marge = 1 tant qu'aucun engagement n'existe.
 */
function makePrisma(opts: { threshold?: string; history?: any[] } = {}) {
  // Contributions : 60 000 F encaissés CHAQUE mois (flux constant).
  // Sinistres : le n-ième appel (mois n) engage 10 000 × n — croissant,
  // ce qui rend la marge décroissante et vérifiable mois par mois.
  let claimCall = 0;
  return {
    contract: { findMany: vi.fn(async () => [{ id: 'ctr-a' }, { id: 'ctr-b' }]) },
    systemConfig: {
      findMany: vi.fn(async () => (opts.threshold !== undefined ? [{ key: 'v2SolvencyAlert.threshold', value: opts.threshold }] : [])),
    },
    v2SolvencySnapshot: {
      findMany: vi.fn(async () => opts.history ?? []),
    },
    contribution: {
      findMany: vi.fn(async () => [{ status: 'PAID', amount: 60000 }]),
    },
    claim: {
      findMany: vi.fn(async () => {
        claimCall++;
        return [{ status: 'APPROVED', totalRequested: 10000 * claimCall, totalApproved: 10000 * claimCall }];
      }),
    },
  };
}

describe('V2 — série mensuelle de la marge de solvabilité', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: CtsV2Service;

  beforeEach(() => {
    prisma = makePrisma();
    service = new CtsV2Service(prisma as any);
  });

  it('produit 12 points mensuels avec libellés fr', async () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const s = await service.portfolioSolvencySeries(12, now);
    expect(s.months).toHaveLength(12);
    // Premier point = fin du mois il y a 11 mois (octobre 2025)…
    expect(s.months[0].month).toBe('2025-10');
    // …dernier = fin du mois courant (septembre 2026).
    expect(s.months[11].month).toBe('2026-09');
    expect(s.months[11].label).toMatch(/sept/);
  });

  it('cumule les flux mois par mois (cotisations 60 k/mois)', async () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const s = await service.portfolioSolvencySeries(12, now);
    expect(s.months[0].contributions).toBe(60000);
    expect(s.months[1].contributions).toBe(120000);
    expect(s.months[11].contributions).toBe(720000);
  });

  it('recalcule la marge à chaque fin de mois (engagements croissants → marge décroissante)', async () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const s = await service.portfolioSolvencySeries(12, now);
    // Mois n : engagements cumulés = 10 k·n(n+1)/2, cotisations = 60 k·n.
    // Marge = position/engagements (fonds de solidarité 0) = 12/(n+1) − 1 :
    // 5, 3, 7/3, … décroissante stricte, cohérente avec le domaine.
    expect(s.months[0].solvencyRatio).toBeCloseTo(5, 6);
    expect(s.months[1].solvencyRatio).toBeCloseTo(3, 6);
    expect(s.months[11].solvencyRatio).toBeCloseTo(12 / 13 - 1, 6);
    for (let i = 1; i < 12; i++) {
      expect(s.months[i].solvencyRatio).toBeLessThan(s.months[i - 1].solvencyRatio);
    }
  });

  it('marge = 1 tant qu\u2019aucun engagement n\u2019existe (convention du domaine)', async () => {
    const prismaEmpty = makePrisma();
    (prismaEmpty.claim.findMany as any).mockResolvedValue([]);
    const serviceEmpty = new CtsV2Service(prismaEmpty as any);
    const s = await serviceEmpty.portfolioSolvencySeries(3, new Date('2026-09-15T12:00:00.000Z'));
    for (const point of s.months) {
      expect(point.solvencyRatio).toBe(1);
      expect(point.claims).toBe(0);
    }
  });

  it('lit le seuil d\u2019alerte configuré pour la ligne de référence', async () => {
    prisma = makePrisma({ threshold: '1.2' });
    service = new CtsV2Service(prisma as any);
    const s = await service.portfolioSolvencySeries(3);
    expect(s.threshold).toBe(1.2);
  });

  it('repli sur le seuil par défaut (1) si la config est absente ou corrompue', async () => {
    const s = await service.portfolioSolvencySeries(3);
    expect(s.threshold).toBe(1);
    prisma = makePrisma({ threshold: '"nimporte-quoi"' });
    service = new CtsV2Service(prisma as any);
    expect((await service.portfolioSolvencySeries(3)).threshold).toBe(1);
  });

  it('la position cumulée = cotisations − engagements, cohérente avec la marge', async () => {
    const s = await service.portfolioSolvencySeries(6);
    for (const point of s.months) {
      expect(point.position).toBe(point.contributions - point.claims);
      if (point.claims > 0) {
        expect(point.solvencyRatio).toBeCloseTo(point.position / point.claims, 6);
      }
    }
  });

  it('préfixe l\u2019historique persisté antérieur à la fenêtre vivante (fusion pluri-annuelle)', async () => {
    prisma = makePrisma({
      history: [
        // Semaines antérieures à la fenêtre 12 mois (run 2026-09-15 → fenêtre depuis 2025-09-01).
        { weekKey: '2025-01-06', weekStart: new Date('2025-01-06T00:00:00.000Z'), solvencyRatio: 4.2, threshold: 1, breach: false, contributions: 500000, engagedClaims: 90000, paidClaims: 30000, position: 380000 },
        { weekKey: '2025-04-07', weekStart: new Date('2025-04-07T00:00:00.000Z'), solvencyRatio: 3.1, threshold: 1, breach: false, contributions: 700000, engagedClaims: 150000, paidClaims: 20000, position: 530000 },
        // Deux semaines du même mois : seul le dernier point du mois compte.
        { weekKey: '2025-05-05', weekStart: new Date('2025-05-05T00:00:00.000Z'), solvencyRatio: 2.9, threshold: 1, breach: false, contributions: 760000, engagedClaims: 170000, paidClaims: 30000, position: 560000 },
        { weekKey: '2025-05-26', weekStart: new Date('2025-05-26T00:00:00.000Z'), solvencyRatio: 2.8, threshold: 1, breach: false, contributions: 790000, engagedClaims: 180000, paidClaims: 30000, position: 580000 },
      ],
    });
    service = new CtsV2Service(prisma as any);
    const s = await service.portfolioSolvencySeries(12, new Date('2026-09-15T12:00:00.000Z'));
    // 12 points vivants + 3 points historiques (2 janvier/février fusionnés…
    // non : 1 par mois → jan, avr, mai) = 15.
    expect(s.months).toHaveLength(15);
    expect(s.months[0].month).toBe('2025-01-06');
    expect(s.months[0].solvencyRatio).toBeCloseTo(4.2, 6);
    // Le point de mai retenu est le DERNIER de son mois (2025-05-26, ratio 2,8).
    const mai = s.months.find(m => m.month === '2025-05-26');
    expect(mai).toBeTruthy();
    expect(mai.solvencyRatio).toBeCloseTo(2.8, 6);
    expect(s.months.find(m => m.month === '2025-05-05')).toBeUndefined();
    // Les points vivants restent en queue, inchangés (3 historiques en tête).
    expect(s.months[3].month).toBe('2025-10');
    expect(s.months[14].month).toBe('2026-09');
  });

  it('écarte les points persistés tombant dans la fenêtre vivante (le recalcul fait foi)', async () => {
    prisma = makePrisma({
      history: [
        { weekKey: '2026-08-03', weekStart: new Date('2026-08-03T00:00:00.000Z'), solvencyRatio: 0.5, threshold: 1, breach: true, contributions: 100000, engagedClaims: 90000, paidClaims: 40000, position: -30000 },
      ],
    });
    service = new CtsV2Service(prisma as any);
    const s = await service.portfolioSolvencySeries(12, new Date('2026-09-15T12:00:00.000Z'));
    expect(s.months).toHaveLength(12); // aucun préfixe : le point est dans la fenêtre
    expect(s.months.find(m => m.month === '2026-08-03')).toBeUndefined();
  });

  it('plafonne le préfixe historique à 48 mois (60 mois au total avec la fenêtre vivante)', async () => {
    const history = [];
    for (let i = 0; i < 70; i++) {
      const d = new Date(Date.UTC(2026, 8 - i, 1)); // 70 mois en arrière depuis sept. 2026
      history.push({
        weekKey: d.toISOString().slice(0, 10),
        weekStart: d,
        solvencyRatio: 2 + i * 0.01,
        threshold: 1,
        breach: false,
        contributions: 1000,
        engagedClaims: 100,
        paidClaims: 0,
        position: 900,
      });
    }
    prisma = makePrisma({ history });
    service = new CtsV2Service(prisma as any);
    const s = await service.portfolioSolvencySeries(12, new Date('2026-09-15T12:00:00.000Z'));
    expect(s.months).toHaveLength(60); // 48 historiques + 12 vivants
    // Les plus anciens sont écartés (slice(-48)) : le premier point n'est pas
    // le plus vieux de l'historique fourni.
    expect(s.months[0].month).not.toBe(history[69].weekKey);
  });

  it('tolère une table d\u2019historique vide ou absente (série vivante seule)', async () => {
    const s = await service.portfolioSolvencySeries(6);
    expect(s.months).toHaveLength(6);
    // findMany qui lève (table absente) : dégradation gracieuse.
    (prisma.v2SolvencySnapshot.findMany as any).mockRejectedValueOnce(new Error('table missing'));
    const s2 = await service.portfolioSolvencySeries(6);
    expect(s2.months).toHaveLength(6);
  });
});

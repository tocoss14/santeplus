import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V2SolvencyAlertJob, buildAlertTitle, isoWeekKey, V2_SOLVENCY_TOPIC } from '../../../src/jobs/v2-solvency-alert.job';

function portfolio(overrides: any = {}) {
  return {
    model: 'V2_MUTUAL',
    contractsCount: 2,
    aggregates: {
      contributions: 300000,
      engagedClaims: 30000,
      paidClaims: 50000,
      expenses: 0,
      recoveries: 0,
      reserveAllocations: 0,
      rbns: 0,
      ibnr: 0,
    },
    position: { position: 220000 },
    result: { technicalResult: 220000, solidarityAllocation: 0, netResult: 220000 },
    reserveAllocation: 30000,
    solvency: { solvencyRatio: 2.75, lossRatio: 0.27, expenseRatio: 0, provisionCoverage: 1, monthsOfCoverage: 57.4 },
    contracts: [],
    ...overrides,
  };
}

function makeDeps(overrides: any = {}) {
  const prisma: any = {
    systemConfig: {
      findMany: vi.fn(async () => [
        { key: 'v2SolvencyAlert.enabled', value: overrides.enabled ?? 'true' },
        { key: 'v2SolvencyAlert.threshold', value: overrides.threshold ?? '1' },
      ]),
    },
    notification: { findFirst: vi.fn(async () => overrides.existingNotification ?? null) },
    user: { findMany: vi.fn(async () => [{ id: 'mgr-1' }, { id: 'mgr-2' }]) },
    auditLog: { create: vi.fn(async (args: any) => ({ id: 'log-1', ...args.data })) },
    v2SolvencySnapshot: {
      upsert: vi.fn(async (args: any) => ({ id: 'snap-1', ...args })),
    },
  };
  const dispatch: any = { dispatchToMany: vi.fn(async () => ({})) };
  const ctsV2: any = { portfolioPosition: vi.fn(async () => overrides.portfolio ?? portfolio()) };
  return { prisma, dispatch, ctsV2 };
}

describe('alerte hebdomadaire de solvabilité V2', () => {
  let job: V2SolvencyAlertJob;
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps();
    job = new V2SolvencyAlertJob(deps.prisma, deps.dispatch, deps.ctsV2);
  });

  it('par défaut : activé, seuil 100 %', async () => {
    const cfg = await job.readConfig();
    expect(cfg).toEqual({ enabled: true, threshold: 1 });
  });

  it('lit le seuil configuré (ex. 150 %)', async () => {
    deps = makeDeps({ threshold: '1.5' });
    job = new V2SolvencyAlertJob(deps.prisma, deps.dispatch, deps.ctsV2);
    expect((await job.readConfig()).threshold).toBe(1.5);
  });

  it('ignore une valeur de seuil corrompue ou hors bornes (repli défaut)', async () => {
    deps = makeDeps({ threshold: '"abc"' });
    job = new V2SolvencyAlertJob(deps.prisma, deps.dispatch, deps.ctsV2);
    expect((await job.readConfig()).threshold).toBe(1);
    deps = makeDeps({ threshold: '-3' });
    job = new V2SolvencyAlertJob(deps.prisma, deps.dispatch, deps.ctsV2);
    expect((await job.readConfig()).threshold).toBe(1);
  });

  it('notifie les gestionnaires et journalise l\u2019audit quand la marge passe sous le seuil', async () => {
    // marge 275 % > seuil 100 % → pas d'alerte avec le portefeuille par défaut.
    // On force une position dégradée : 300k cotisations, 80k prestations
    // + 250k provisions → position négative, marge < 100 %.
    deps = makeDeps({
      portfolio: portfolio({
        aggregates: {
          contributions: 300000, engagedClaims: 80000, paidClaims: 0, expenses: 0,
          recoveries: 0, reserveAllocations: 0, rbns: 250000, ibnr: 0,
        },
        position: { position: -30000 },
        solvency: { solvencyRatio: -0.375, lossRatio: 1.1, expenseRatio: 0, provisionCoverage: -0.12, monthsOfCoverage: -0.65 },
      }),
    });
    job = new V2SolvencyAlertJob(deps.prisma, deps.dispatch, deps.ctsV2);

    const r = await job.run();
    expect(r.breach).toBe(true);
    expect(r.notified).toBe(true);
    expect(deps.dispatch.dispatchToMany).toHaveBeenCalledTimes(1);
    const [ids, payload] = deps.dispatch.dispatchToMany.mock.calls[0];
    expect(ids).toEqual(['mgr-1', 'mgr-2']);
    expect(payload.topic).toBe(V2_SOLVENCY_TOPIC);
    expect(payload.body).toContain('V2_MUTUAL');
    expect(payload.body).toContain('-37,5');
    // Audit log avec agrégats et seuil
    const log = deps.prisma.auditLog.create.mock.calls[0][0].data;
    expect(log.action).toBe('V2_SOLVENCY_ALERT');
    expect(log.entityId).toBe('fmv_v2_mutual');
    const meta = JSON.parse(log.meta);
    expect(meta.threshold).toBe(1);
    expect(meta.solvencyRatio).toBeCloseTo(-0.375, 6);
  });

  it('ne notifie pas au-dessus du seuil (et ne crée pas d\u2019audit)', async () => {
    const r = await job.run();
    expect(r.breach).toBe(false);
    expect(r.notified).toBe(false);
    expect(deps.dispatch.dispatchToMany).not.toHaveBeenCalled();
    expect(deps.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('portefeuille vide : marge indéterminée, jamais une fausse alerte', async () => {
    deps = makeDeps({ portfolio: portfolio({ contractsCount: 0, solvency: { solvencyRatio: 1, lossRatio: 0, expenseRatio: 0, provisionCoverage: 1, monthsOfCoverage: Infinity } }) });
    job = new V2SolvencyAlertJob(deps.prisma, deps.dispatch, deps.ctsV2);
    const r = await job.run();
    expect(r.breach).toBe(false);
    expect(r.solvencyRatio).toBeNull();
    expect(deps.dispatch.dispatchToMany).not.toHaveBeenCalled();
  });

  it('désactivé par config : aucune exécution', async () => {
    deps = makeDeps({ enabled: 'false' });
    job = new V2SolvencyAlertJob(deps.prisma, deps.dispatch, deps.ctsV2);
    const r = await job.run();
    expect(r.enabled).toBe(false);
    expect(deps.ctsV2.portfolioPosition).not.toHaveBeenCalled();
  });

  it('persiste un point hebdomadaire à CHAQUE exécution, breach ou non (upsert par weekKey)', async () => {
    // Au-dessus du seuil : pas d'alerte mais un point persisté quand même.
    const r = await job.run();
    expect(r.snapshotSaved).toBe(true);
    expect(deps.prisma.v2SolvencySnapshot.upsert).toHaveBeenCalledTimes(1);
    const args = deps.prisma.v2SolvencySnapshot.upsert.mock.calls[0][0];
    expect(args.where.weekKey).toMatch(/^\d{4}-S\d{2}$/);
    expect(args.create.solvencyRatio).toBeCloseTo(2.75, 6);
    expect(args.create.breach).toBe(false);
    expect(args.create.contractsCount).toBe(2);
    expect(args.create.position).toBe(220000);
    // Lundi de la semaine du run (UTC).
    expect(args.create.weekStart.getUTCDay()).toBe(1);
  });

  it('persiste aussi le point en breach (avant la notification, indépendamment d\u2019elle)', async () => {
    deps = makeDeps({
      portfolio: portfolio({
        aggregates: { contributions: 300000, engagedClaims: 80000, paidClaims: 0, expenses: 0, recoveries: 0, reserveAllocations: 0, rbns: 250000, ibnr: 0 },
        position: { position: -30000 },
        solvency: { solvencyRatio: -0.375, lossRatio: 1.1, expenseRatio: 0, provisionCoverage: -0.12, monthsOfCoverage: -0.65 },
      }),
    });
    job = new V2SolvencyAlertJob(deps.prisma, deps.dispatch, deps.ctsV2);
    const r = await job.run();
    expect(r.breach).toBe(true);
    expect(r.snapshotSaved).toBe(true);
    const args = deps.prisma.v2SolvencySnapshot.upsert.mock.calls[0][0];
    expect(args.create.breach).toBe(true);
  });

  it('un échec de snapshot n\u2019empêche ni l\u2019alerte ni le résultat', async () => {
    deps = makeDeps({
      portfolio: portfolio({
        aggregates: { contributions: 300000, engagedClaims: 80000, paidClaims: 0, expenses: 0, recoveries: 0, reserveAllocations: 0, rbns: 250000, ibnr: 0 },
        position: { position: -30000 },
        solvency: { solvencyRatio: -0.375, lossRatio: 1.1, expenseRatio: 0, provisionCoverage: -0.12, monthsOfCoverage: -0.65 },
      }),
    });
    deps.prisma.v2SolvencySnapshot.upsert.mockRejectedValueOnce(new Error('db down'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    job = new V2SolvencyAlertJob(deps.prisma, deps.dispatch, deps.ctsV2);
    const r = await job.run();
    expect(r.snapshotSaved).toBe(false);
    expect(r.breach).toBe(true);
    expect(r.notified).toBe(true); // l'alerte part quand même
    consoleError.mockRestore();
  });

  it('dédup : pas de double notification pour la même semaine', async () => {
    deps = makeDeps({
      portfolio: portfolio({
        aggregates: { contributions: 300000, engagedClaims: 80000, paidClaims: 0, expenses: 0, recoveries: 0, reserveAllocations: 0, rbns: 250000, ibnr: 0 },
        position: { position: -30000 },
        solvency: { solvencyRatio: -0.375, lossRatio: 1.1, expenseRatio: 0, provisionCoverage: -0.12, monthsOfCoverage: -0.65 },
      }),
      existingNotification: { id: 'notif-1' },
    });
    job = new V2SolvencyAlertJob(deps.prisma, deps.dispatch, deps.ctsV2);
    const r = await job.run();
    expect(r.breach).toBe(true);
    expect(r.notified).toBe(false);
    expect(deps.dispatch.dispatchToMany).not.toHaveBeenCalled();
  });

  it('le titre d\u2019alerte porte la semaine ISO (clé de dédup hebdomadaire)', () => {
    const monday = new Date('2026-09-28T07:00:00.000Z'); // lundi
    expect(isoWeekKey(monday)).toMatch(/^\d{4}-S\d{2}$/);
    const title = buildAlertTitle(-0.375, 1, '2026-S40');
    expect(title).toContain('-37,5');
    expect(title).toContain('< 100 %');
    expect(title).toContain('2026-S40');
  });
});

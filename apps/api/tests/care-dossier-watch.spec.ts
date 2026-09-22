import { describe, expect, it, vi } from 'vitest';
import {
  CareDossierWatchJob,
  buildDossierAlertTitle,
  buildPatientMismatchAlertTitle,
} from '../src/jobs/care-dossier-watch.job';

// Watchdog de traçabilité : alerte les gestionnaires une seule fois
// 1. par claim tiers-payant créé sans dossier de soins (dédup par notif existante)
// 2. par dossier de soins rattaché à un sinistre d'un autre assuré.

const NOW = new Date('2026-09-20T10:00:00Z'); // mois courant : septembre 2026

function makeHarness(opts: { drifted?: any[]; mismatched?: any[]; alreadyAlerted?: string[] } = {}) {
  const dispatchCalls: any[] = [];
  const prisma: any = {
    claim: {
      findMany: vi.fn(async ({ where }: any) => {
        // Vérifie la fenêtre : le mois précédent complet (pas le mois courant).
        const gte = (where.careDate as any).gte as Date;
        const lte = (where.careDate as any).lte as Date;
        if (gte.getUTCMonth() !== 7 || lte.getUTCMonth() !== 7) throw new Error('fenêtre attendue : mois précédent (août)');
        return opts.drifted ?? [];
      }),
    },
    $queryRaw: vi.fn(async () => opts.mismatched ?? []),
    user: { findMany: vi.fn(async () => [{ id: 'mgr1' }, { id: 'mgr2' }]) },
    notification: {
      findFirst: vi.fn(async ({ where }: any) => (opts.alreadyAlerted ?? []).includes(where.title) ? { id: 'n1' } : null),
    },
  };
  const dispatch: any = {
    dispatchToMany: vi.fn(async (_ids: any, payload: any) => { dispatchCalls.push(payload); return {}; }),
  };
  const job = new CareDossierWatchJob(prisma, dispatch);
  return { job, prisma, dispatchCalls };
}

describe('CareDossierWatchJob — claim sans dossier', () => {
  it('titre d\'alerte normalisé pour la dédup', () => {
    expect(buildDossierAlertTitle('TPE-2026-ABC123')).toBe('Prise en charge TPE-2026-ABC123 sans dossier de soins');
  });

  it('scanne le mois précédent complet — pas le mois courant', async () => {
    const { job } = makeHarness({ drifted: [] });
    const res = await job.run(NOW);
    expect(res).toEqual({ drifted: 0, notified: 0, mismatched: 0, mismatchNotified: 0 });
  });

  it('dérive détectée : notification aux gestionnaires avec référence et action de correction', async () => {
    const { job, dispatchCalls } = makeHarness({ drifted: [{ id: 'c1', reference: 'TPE-2026-DRIFT1' }] });
    const res = await job.run(NOW);
    expect(res).toEqual({ drifted: 1, notified: 1, mismatched: 0, mismatchNotified: 0 });
    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0].topic).toBe('CLAIM_NO_DOSSIER');
    expect(dispatchCalls[0].title).toContain('TPE-2026-DRIFT1');
    expect(dispatchCalls[0].body).toContain('Rattacher');
  });

  it('dédup : un claim déjà signalé ne re-déclenche aucune notification', async () => {
    const { job, dispatchCalls } = makeHarness({
      drifted: [{ id: 'c1', reference: 'TPE-2026-DRIFT1' }, { id: 'c2', reference: 'TPE-2026-DRIFT2' }],
      alreadyAlerted: ['Prise en charge TPE-2026-DRIFT1 sans dossier de soins'],
    });
    const res = await job.run(NOW);
    expect(res).toEqual({ drifted: 2, notified: 1, mismatched: 0, mismatchNotified: 0 });
    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0].title).toContain('TPE-2026-DRIFT2');
  });

  it('pas de gestionnaire actif : dérive comptée mais rien de notifié', async () => {
    const harness = makeHarness({ drifted: [{ id: 'c1', reference: 'TPE-2026-DRIFT1' }] });
    harness.prisma.user.findMany = vi.fn(async () => []);
    const res = await harness.job.run(NOW);
    expect(res).toEqual({ drifted: 1, notified: 0, mismatched: 0, mismatchNotified: 0 });
  });
});

describe('CareDossierWatchJob — dossier incohérent avec le sinistre', () => {
  it('titre d\'alerte mismatch citant les deux références', () => {
    expect(buildPatientMismatchAlertTitle('SIN-2026-001', 'DOS-2026-009')).toBe(
      'Dossier DOS-2026-009 incohérent avec le sinistre SIN-2026-001',
    );
  });

  it('mismatch détecté : notif au topic dédié avec les deux références et le correctif', async () => {
    const { job, dispatchCalls } = makeHarness({
      mismatched: [{ id: 'c1', reference: 'SIN-2026-001', dossierId: 'd1', dossierReference: 'DOS-2026-009' }],
    });
    const res = await job.run(NOW);
    expect(res).toEqual({ drifted: 0, notified: 0, mismatched: 1, mismatchNotified: 1 });
    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0].topic).toBe('CLAIM_DOSSIER_PATIENT_MISMATCH');
    expect(dispatchCalls[0].title).toContain('DOS-2026-009');
    expect(dispatchCalls[0].title).toContain('SIN-2026-001');
    expect(dispatchCalls[0].body).toContain('détachez');
  });

  it('dédup par paire claim/dossier : le couple corrigé puis recassé ne re-spamme pas', async () => {
    const row = { id: 'c1', reference: 'SIN-2026-001', dossierId: 'd1', dossierReference: 'DOS-2026-009' };
    const { job, dispatchCalls } = makeHarness({
      mismatched: [row, { ...row, id: 'c2', reference: 'SIN-2026-002' }],
      alreadyAlerted: ['Dossier DOS-2026-009 incohérent avec le sinistre SIN-2026-001'],
    });
    const res = await job.run(NOW);
    expect(res.mismatched).toBe(2);
    expect(res.mismatchNotified).toBe(1);
    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0].title).toContain('SIN-2026-002');
  });

  it('mismatch + sans dossier : les deux dérives sont traitées indépendamment', async () => {
    const { job, dispatchCalls } = makeHarness({
      drifted: [{ id: 'c1', reference: 'TPE-2026-DRIFT1' }],
      mismatched: [{ id: 'c2', reference: 'SIN-2026-001', dossierId: 'd1', dossierReference: 'DOS-2026-009' }],
    });
    const res = await job.run(NOW);
    expect(res).toEqual({ drifted: 1, notified: 1, mismatched: 1, mismatchNotified: 1 });
    expect(dispatchCalls.map((c: any) => c.topic).sort()).toEqual(['CLAIM_DOSSIER_PATIENT_MISMATCH', 'CLAIM_NO_DOSSIER']);
  });

  it('pas de gestionnaire : mismatch compté mais rien de notifié (et scan no-dossier quand même)', async () => {
    const harness = makeHarness({ mismatched: [{ id: 'c1', reference: 'SIN-2026-001', dossierId: 'd1', dossierReference: 'DOS-2026-009' }] });
    harness.prisma.user.findMany = vi.fn(async () => []);
    const res = await harness.job.run(NOW);
    expect(res).toEqual({ drifted: 0, notified: 0, mismatched: 1, mismatchNotified: 0 });
  });
});

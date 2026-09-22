import { describe, expect, it, vi } from 'vitest';
import { CareDossierWatchJob, buildDossierAlertTitle } from '../src/jobs/care-dossier-watch.job';

// Watchdog de traçabilité : alerte les gestionnaires une seule fois par claim
// tiers-payant créé sans dossier de soins (dédup par notification existante).

const NOW = new Date('2026-09-20T10:00:00Z'); // mois courant : septembre 2026

function makeHarness(opts: { drifted?: any[]; alreadyAlerted?: string[] } = {}) {
  const dispatchCalls: any[] = [];
  const prisma: any = {
    claim: {
      findMany: vi.fn(async ({ where }: any) => {
        // Vérifie la fenêtre : le mois précédent complet (juin→…→août 2026), pas le mois courant.
        const gte = (where.careDate as any).gte as Date;
        const lte = (where.careDate as any).lte as Date;
        if (gte.getUTCMonth() !== 7 || lte.getUTCMonth() !== 7) throw new Error('fenêtre attendue : mois précédent (août)');
        return opts.drifted ?? [];
      }),
    },
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

describe('CareDossierWatchJob', () => {
  it('titre d\'alerte normalisé pour la dédup', () => {
    expect(buildDossierAlertTitle('TPE-2026-ABC123')).toBe('Prise en charge TPE-2026-ABC123 sans dossier de soins');
  });

  it('scanne le mois précédent complet — pas le mois courant', async () => {
    const { job } = makeHarness({ drifted: [] });
    const res = await job.run(NOW);
    expect(res).toEqual({ drifted: 0, notified: 0 });
  });

  it('dérive détectée : notification aux gestionnaires avec référence et action de correction', async () => {
    const { job, dispatchCalls } = makeHarness({ drifted: [{ id: 'c1', reference: 'TPE-2026-DRIFT1' }] });
    const res = await job.run(NOW);
    expect(res).toEqual({ drifted: 1, notified: 1 });
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
    expect(res).toEqual({ drifted: 2, notified: 1 });
    expect(dispatchCalls).toHaveLength(1);
    expect(dispatchCalls[0].title).toContain('TPE-2026-DRIFT2');
  });

  it('pas de gestionnaire actif : dérive comptée mais rien de notifié', async () => {
    const harness = makeHarness({ drifted: [{ id: 'c1', reference: 'TPE-2026-DRIFT1' }] });
    harness.prisma.user.findMany = vi.fn(async () => []);
    const res = await harness.job.run(NOW);
    expect(res).toEqual({ drifted: 1, notified: 0 });
  });
});

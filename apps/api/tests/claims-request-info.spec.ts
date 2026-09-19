import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CLAIM_TRANSITIONS } from '../src/domain/claim-machine';
import { ClaimsController, requestInfoSchema } from '../src/modules/claims/claims.controller';

// Demande d'information : le gestionnaire peut la poser depuis SUBMITTED ou
// UNDER_REVIEW, et la relancer (avec précisions actualisées) sur un dossier
// déjà en INFO_REQUESTED — l'assuré ajoute ses pièces puis le dossier repasse
// en analyse (POST /claims/:id/documents).

const authUser: any = { id: 'mgr1', email: 'm@x.bj', role: 'INSURANCE_MANAGER', companyId: null, providerId: null };

function makePrisma(status: string) {
  const updates: any[] = [];
  const prisma: any = {
    updates,
    claim: {
      findUnique: vi.fn(async () => ({
        id: 'c1', status, flags: '[]', reference: 'SIN-1',
        claimantUserId: 'u1', providerId: null, totalApproved: 0, items: [],
      })),
      update: vi.fn(async ({ data }: any) => {
        updates.push(data);
        return { id: 'c1', ...data };
      }),
    },
  };
  return prisma;
}

function makeController(prisma: any) {
  const dispatch: any = { dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) };
  const ctrl = new ClaimsController({} as any, prisma, dispatch, {} as any);
  return { ctrl, dispatch };
}

describe('table des transitions REQUEST_INFO', () => {
  it('autorise SUBMITTED, UNDER_REVIEW et INFO_REQUESTED (relance)', () => {
    expect(CLAIM_TRANSITIONS.REQUEST_INFO).toEqual(['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED']);
  });
});

describe('POST /admin/claims/:id/request-info', () => {
  it('depuis SUBMITTED : passe en INFO_REQUESTED, persiste la note et notifie l’assuré', async () => {
    const prisma = makePrisma('SUBMITTED');
    const { ctrl, dispatch } = makeController(prisma);

    const res = await ctrl.requestInfo(authUser, 'c1', { note: 'Merci de joindre l’ordonnance originale.' });

    expect(res.ok).toBe(true);
    expect(prisma.updates[0]).toMatchObject({ status: 'INFO_REQUESTED', decisionNote: 'Merci de joindre l’ordonnance originale.' });
    expect(dispatch.dispatchToUser).toHaveBeenCalledTimes(1);
    const [userId, msg] = dispatch.dispatchToUser.mock.calls[0];
    expect(userId).toBe('u1');
    expect(msg.title).toContain('SIN-1');
    expect(msg.body).toContain('ordonnance');
  });

  it('depuis INFO_REQUESTED : relance possible avec la note actualisée', async () => {
    const prisma = makePrisma('INFO_REQUESTED');
    const { ctrl } = makeController(prisma);

    const res = await ctrl.requestInfo(authUser, 'c1', { note: 'L’ordonnance reçue est illisible, merci de la re-numériser.' });

    expect(res.ok).toBe(true);
    expect(prisma.updates[0]).toMatchObject({ status: 'INFO_REQUESTED', decisionNote: 'L’ordonnance reçue est illisible, merci de la re-numériser.' });
  });

  it('depuis un statut hors SUBMITTED/UNDER_REVIEW/INFO_REQUESTED : refusé', async () => {
    for (const status of ['DRAFT', 'APPROVED', 'PAID', 'REJECTED']) {
      const prisma = makePrisma(status);
      const { ctrl } = makeController(prisma);
      await expect(ctrl.requestInfo(authUser, 'c1', { note: 'Note quelconque' })).rejects.toThrow(BadRequestException);
    }
  });

  it('note absente ou trop courte : refusée par le schéma', () => {
    expect(requestInfoSchema.safeParse({ note: 'ab' }).success).toBe(false);
    expect(requestInfoSchema.safeParse({ note: 'Note valide de trois caractères minimum' }).success).toBe(true);
    expect(requestInfoSchema.safeParse({}).success).toBe(false);
  });
});

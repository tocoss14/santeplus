import { describe, expect, it, vi } from 'vitest';
import { ClaimsController } from '../src/modules/claims/claims.controller';

// Dossier de soins lié : GET /claims/:id expose l'épisode de soins (DOS) qui a
// généré un sinistre tiers-payant, pour l'analyse gestionnaire (symbiose soin↔sinistre).

const staff: any = { id: 'mgr1', role: 'INSURANCE_MANAGER', companyId: null, providerId: null };
const member: any = { id: 'u1', role: 'MEMBER', companyId: null, providerId: null };

const dossier = {
  id: 'dos1',
  reference: 'DOS-2026-A00042',
  status: 'OPEN',
  type: 'GENERAL',
  createdAt: new Date('2026-09-18T10:00:00Z'),
  provider: { name: 'Clinique Mahouna' },
  consultation: { reference: 'CONS-2026-0007', createdAt: new Date('2026-09-18T09:00:00Z') },
  prescription: {
    number: 'ORD-2026-0011',
    createdAt: new Date('2026-09-18T09:30:00Z'),
    lines: [{ code: 'MED001', name: 'Paracétamol 500mg', quantity: 2 }],
  },
  delivery: {
    reference: 'DEL-2026-0009',
    createdAt: new Date('2026-09-18T11:00:00Z'),
    totalAmount: 5250,
    lines: [{ code: 'MED001', name: 'Paracétamol 500mg', quantity: 2 }],
  },
};

function makeController(opts: { withDossier: boolean; contract?: any }) {
  const claim: any = {
    id: 'c1',
    kind: 'THIRDPARTY',
    status: 'SUBMITTED',
    reference: 'SIN-2026-A00001',
    claimantUserId: 'u1',
    contract: opts.contract ?? { principalUserId: 'u1', companyId: null },
    items: [],
  };
  const prisma: any = {
    claim: { findUnique: vi.fn(async () => claim) },
    claimDocument: { findMany: vi.fn(async () => []) },
    careRecord: { findUnique: vi.fn(async () => (opts.withDossier ? dossier : null)) },
  };
  const ctrl = new ClaimsController({} as any, prisma, {} as any, {} as any);
  return { ctrl, prisma };
}

describe('GET /claims/:id — dossier de soins lié', () => {
  it('expose le dossier (DOS, consultation, ordonnance, délivrance) pour un sinistre tiers-payant lié', async () => {
    const { ctrl } = makeController({ withDossier: true });
    const res: any = await ctrl.detail(staff, 'c1');
    expect(res.careDossier).not.toBeNull();
    expect(res.careDossier.reference).toBe('DOS-2026-A00042');
    expect(res.careDossier.consultation.reference).toBe('CONS-2026-0007');
    expect(res.careDossier.prescription.number).toBe('ORD-2026-0011');
    expect(res.careDossier.prescription.lines[0].name).toBe('Paracétamol 500mg');
    expect(res.careDossier.delivery.reference).toBe('DEL-2026-0009');
  });

  it('renvoie careDossier: null quand aucun dossier n\'est lié (sinistre classique)', async () => {
    const { ctrl, prisma } = makeController({ withDossier: false });
    const res: any = await ctrl.detail(staff, 'c1');
    expect(res.careDossier).toBeNull();
    const call: any = prisma.careRecord.findUnique.mock.calls[0][0];
    expect(call.where).toEqual({ claimId: 'c1' });
  });

  it('l\'assuré propriétaire voit aussi le dossier de soins de son épisode', async () => {
    const { ctrl } = makeController({ withDossier: true });
    const res: any = await ctrl.detail(member, 'c1');
    expect(res.careDossier?.reference).toBe('DOS-2026-A00042');
  });
});

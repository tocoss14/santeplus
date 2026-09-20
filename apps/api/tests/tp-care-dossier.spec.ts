import { describe, expect, it, vi } from 'vitest';
import { ProviderPortalController } from '../src/modules/providers/provider-portal.controller';

// Symbiose soin ↔ sinistre : toute prise en charge (initiate tiers-payant)
// naît dans son dossier de soins, écrit dans la MÊME transaction que le claim
// (invariant : aucun claim TP sans dossier — l'échec dossier rejette le claim).

function makeHarness(opts: { dossierFails?: boolean } = {}) {
  const contract: any = {
    id: 'ctr-1', status: 'ACTIVE', principalUserId: 'patient-1',
    principalUser: { id: 'patient-1', firstName: 'Fatou', lastName: 'Bio Tano', memberNumber: 'MB-0001' },
    product: { insurerPartner: null },
    beneficiaries: [],
  };
  const calls: any = { dossierCreated: 0, eventCreated: 0 };
  const prisma: any = {
    claim: {
      create: vi.fn(async ({ data }: any) => ({ id: 'claim-1', ...data, items: [] })),
    },
    careRecord: {
      create: vi.fn(async () => {
        if (opts.dossierFails) throw new Error('dossier down');
        calls.dossierCreated++;
        return { id: 'dos-1', claimId: 'claim-1' };
      }),
    },
    careRecordEvent: {
      create: vi.fn(async () => { calls.eventCreated++; return {}; }),
    },
    fileObject: { create: vi.fn(async () => ({ id: 'f1' })) },
    claimDocument: { create: vi.fn(async () => ({})) },
    act: { findUnique: vi.fn(async () => null) },
    prescription: { findFirst: vi.fn(async () => null) },
    product: { findUnique: vi.fn(async () => ({ thirdPartyAuthThreshold: 150000 })) },
    user: { findMany: vi.fn(async () => []) },
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  };
  const claimsService: any = {
    buildEstimation: vi.fn(async () => ({
      totals: { requested: 5000, approved: 3500, outOfPocket: 1500 },
      items: [{ categoryId: 'CONSULTATION', amountRequested: 5000, amountEligible: 5000, rateApplied: 70, amountApproved: 3500 }],
      flags: [],
    })),
  };
  const portalService: any = {
    requireEstablishment: vi.fn(async () => ({ establishment: { id: 'prov-1', name: 'Clinique Test' }, user: { id: 'prov-user-1' } })),
    resolveContract: vi.fn(async () => contract),
  };
  const dispatch: any = { dispatchToUser: vi.fn(async () => {}), dispatchToMany: vi.fn(async () => {}) };
  const controller = new ProviderPortalController(
    prisma as any,
    claimsService,
    { save: vi.fn(async () => ({})) } as any,
    dispatch,
    portalService,
  );
  const payload = JSON.stringify({
    cardToken: 'tok-1234567890',
    items: [{ code: 'CONS', label: 'Consultation', categoryId: 'CONSULTATION', quantity: 1, unitPrice: 5000 }],
  });
  const auth = { id: 'prov-user-1', role: 'PROVIDER' } as any;
  return { controller, prisma, payload, auth, calls };
}

describe('POST /provider/thirdparty/initiate — dossier de soins transactionnel', () => {
  it('crée le dossier (claimId lié) + événement CLAIM_CREATED + careRecordId en réponse', async () => {
    const { controller, prisma, payload, auth, calls } = makeHarness();
    const res: any = await (controller as any).initiate(auth, payload, undefined);
    expect(res.careRecordId).toBe('dos-1');
    expect(calls.dossierCreated).toBe(1);
    expect(calls.eventCreated).toBe(1);
    // Le dossier est créé dans le même tx que le claim, avec claimId lié
    const dossierData = prisma.careRecord.create.mock.calls[0][0].data;
    expect(dossierData.claimId).toBe('claim-1');
    expect(dossierData.patientUserId).toBe('patient-1');
    expect(dossierData.providerId).toBe('prov-1');
    const eventData = prisma.careRecordEvent.create.mock.calls[0][0].data;
    expect(eventData.type).toBe('CLAIM_CREATED');
    expect(eventData.title).toContain(res.reference);
  });

  it('échec dossier → la transaction échoue : aucun claim TP sans dossier', async () => {
    const { controller, prisma, payload, auth } = makeHarness({ dossierFails: true });
    await expect((controller as any).initiate(auth, payload, undefined)).rejects.toThrow('dossier down');
  });
});

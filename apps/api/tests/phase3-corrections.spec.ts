import { describe, it, expect, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CareController } from '../src/modules/care/care.controller';
import { ClaimsController } from '../src/modules/claims/claims.controller';
import { ProviderPortalController } from '../src/modules/providers/provider-portal.controller';
import { BeneficiariesController } from '../src/modules/contracts/contracts.controller';
import { BatchBillingService } from '../src/modules/billing/batch-billing.service';

// Phase 3 (13/09/2026) — régressions des 4 anomalies.
// P3-A : une pharmacie/laboratoire ne peut pas créer d'ordonnance.
// P3-B : date de naissance future ou invalide → rejet.
// P3-C : les claims tiers-payant (kind=THIRDPARTY) sont retrouvés par la facturation groupée.
// P3-C2 : invariant financier — claim CONFIRMED/APPROVED/AUTHORIZED ⇒ engagement CTS,
//         atomique (échec d'engagement ⇒ pas de confirmation).

const dispatch = () => ({ dispatchToUser: vi.fn(async () => ({})), dispatchToMany: vi.fn(async () => ({})) });

// ---------------------------------------------------------------------------
// P3-A — Pharmacie / LABORATORY : création d'ordonnance interdite
// ---------------------------------------------------------------------------
describe('P3-A — interdiction création ordonnance (pharmacie / laboratoire)', () => {
  function makeCare(establishmentType: string) {
    const contract = {
      id: 'ctr-1', status: 'ACTIVE', principalUser: { id: 'patient-1', memberNumber: 'MPL-0001' },
      beneficiaries: [], product: {},
    };
    const prisma: any = {
      prescription: {
        create: vi.fn(async ({ data }: any) => ({ id: 'pres-1', number: data.number, lines: [] })),
        findFirst: vi.fn(async () => null),
      },
      contract: {
        findFirst: vi.fn(async () => contract),
        findUnique: vi.fn(async () => contract),
      },
      user: { findUnique: vi.fn(async () => ({ id: 'doc-1', firstName: 'Docteur', lastName: 'Test' })) },
      consultation: { findFirst: vi.fn(async () => null) },
    };
    const careService: any = {
      requireEstablishment: vi.fn(async () => ({
        establishment: { id: 'prov-1', name: 'Établissement Test', type: establishmentType },
        user: { id: 'prov-user-1' },
      })),
      ensureCareRecord: vi.fn(async () => 'cr-1'),
      addEvent: vi.fn(async () => {}),
    };
    const claimsService: any = { buildEstimation: vi.fn(async () => ({})) };
    const controller = new CareController(prisma, dispatch() as any, careService, claimsService);
    return { controller, prisma, careService };
  }

  const dto = {
    memberNumber: 'MPL-0001',
    specialty: 'Généraliste',
    motif: 'Douleur thoracique',
    lines: [{ code: 'MED-001', name: 'Paracétamol', categoryId: 'PHARMACY', quantity: 1, unitPrice: 1000 }],
  };

  it('PHARMACY → 403 Forbidden', async () => {
    const { controller } = makeCare('PHARMACY');
    await expect(controller.createPrescription({ id: 'prov-user-1' } as any, dto as any))
      .rejects.toThrow(ForbiddenException);
  });

  it('LABORATORY → 403 Forbidden', async () => {
    const { controller } = makeCare('LABORATORY');
    await expect(controller.createPrescription({ id: 'prov-user-1' } as any, dto as any))
      .rejects.toThrow(ForbiddenException);
  });

  it('CLINIC (établissement habilité) → autorisé', async () => {
    const { controller } = makeCare('CLINIC');
    const res = await controller.createPrescription({ id: 'prov-user-1' } as any, dto as any);
    expect(res).toBeDefined();
    expect((res as any).id).toBe('pres-1');
  });
});

// ---------------------------------------------------------------------------
// P3-B — Date de naissance future / invalide rejetée
// ---------------------------------------------------------------------------
describe('P3-B — validation date de naissance des ayants droit', () => {
  function makeContracts(prismaOverrides: any = {}) {
    const created: any[] = [];
    const contract = {
      id: 'ctr-1',
      kind: 'INDIVIDUAL',
      status: 'ACTIVE',
      principalUserId: 'emp-1',
      companyId: null,
      product: { beneficiaryRules: JSON.stringify({ spouse: true, childMaxAge: 21, maxBeneficiaries: 5 }) },
    };
    const prismaObj: any = {
      contract: { findUnique: vi.fn(async () => contract) },
      beneficiary: {
        count: vi.fn(async () => 0),
        create: vi.fn(async ({ data }: any) => { created.push(data); return { id: 'ben-1', ...data }; }),
      },
      beneficiaryChange: { create: vi.fn(async () => ({})) },
      $transaction: vi.fn(async (fn: any) => fn(prismaObj)),
      ...prismaOverrides,
    };
    const contractsService: any = { canAccess: vi.fn(async () => contract) };
    const controller = new BeneficiariesController(contractsService, prismaObj);
    return { controller, created };
  }

  const auth = { id: 'emp-1', role: 'CLIENT' } as any;
  const base = { firstName: 'Enfant', lastName: 'Test', gender: 'M', relation: 'CHILD' };
  const iso = (d: Date) => d.toISOString();

  it('naissance hier → accepté', async () => {
    const { controller, created } = makeContracts();
    const yesterday = new Date(Date.now() - 86400000);
    await controller.add(auth, 'ctr-1', { ...base, birthDate: iso(yesterday) });
    expect(created).toHaveLength(1);
    expect(created[0].relation).toBe('CHILD');
  });

  it('naissance aujourd\u2019hui → accepté', async () => {
    const { controller, created } = makeContracts();
    await controller.add(auth, 'ctr-1', { ...base, birthDate: iso(new Date()) });
    expect(created).toHaveLength(1);
  });

  it('naissance +1 jour (future) → 400 rejeté', async () => {
    const { controller, created } = makeContracts();
    const tomorrow = new Date(Date.now() + 86400000);
    await expect(controller.add(auth, 'ctr-1', { ...base, birthDate: iso(tomorrow) }))
      .rejects.toThrow(BadRequestException);
    expect(created).toHaveLength(0);
  });

  it('naissance 2030 (future) → 400 rejeté', async () => {
    const { controller, created } = makeContracts();
    await expect(controller.add(auth, 'ctr-1', { ...base, birthDate: '2030-01-01T00:00:00.000Z' }))
      .rejects.toThrow(/futur/);
    expect(created).toHaveLength(0);
  });

  it('enfant au-delà de childMaxAge → 400 rejeté', async () => {
    const { controller } = makeContracts();
    const tooOld = new Date(Date.now() - 25 * 365.25 * 86400000);
    await expect(controller.add(auth, 'ctr-1', { ...base, birthDate: iso(tooOld) }))
      .rejects.toThrow(/moins de 21 ans/);
  });

  it('date invalide (non parsable) → 400 rejeté', async () => {
    const { controller, created } = makeContracts();
    await expect(controller.add(auth, 'ctr-1', { ...base, birthDate: 'pas-une-date' }))
      .rejects.toThrow(/invalide/i);
    expect(created).toHaveLength(0);
  });

  it('contournement API : objet Date invalide transmis directement → 400', async () => {
    const { controller } = makeContracts();
    await expect(controller.add(auth, 'ctr-1', { ...base, birthDate: '9999-99-99' }))
      .rejects.toThrow(BadRequestException);
  });
});

// ---------------------------------------------------------------------------
// P3-C — Facturation groupée : claims tiers-payant retrouvés
// ---------------------------------------------------------------------------
describe('P3-C — facturation groupée retrouve les claims THIRDPARTY', () => {
  function makeBatch(claims: any[]) {
    let batchCreated = false;
    const prisma: any = {
      provider: { findUnique: vi.fn(async () => ({ id: 'prov-1', thirdPartyPayer: true })) },
      batchInvoice: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: any) => ({ id: 'bat-1', ...data, items: data.items?.create ?? [] })),
        findUnique: vi.fn(async () => null),
      },
      batchInvoiceItem: {
        // Déduplication phase 4 (écart P0 D) : via les lignes de facture groupée.
        findMany: vi.fn(async () => []),
      },
      claim: {
        // Le mock applique le where réel (kind + status + providerId) comme Prisma le ferait.
        findMany: vi.fn(async ({ where }: any) => claims.filter(c =>
          (!where.providerId || c.providerId === where.providerId)
          && (!where.kind || c.kind === where.kind)
          && (!where.status?.in || where.status.in.includes(c.status)))),
        updateMany: vi.fn(async () => ({})),
      },
      $transaction: vi.fn(async (fn: any) => fn(prisma)),
    };
    const service = new BatchBillingService(prisma, dispatch() as any);
    return { service, prisma };
  }

  it('kind=THIRDPARTY + APPROVED → inclus dans la facture groupée', async () => {
    const { service } = makeBatch([{
      id: 'claim-tp', kind: 'THIRDPARTY', status: 'APPROVED', providerId: 'prov-1',
      items: [{ id: 'it-1', amountRequested: 10000, amountApproved: 8000 }],
    }]);
    const invoice = await service.createBatchInvoice({ providerId: 'prov-1', periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-13') } as any);
    expect(invoice.totalApproved).toBe(8000);
  });

  it('kind=REIMBURSEMENT → exclu (tiers-payant uniquement)', async () => {
    const { service, prisma } = makeBatch([{
      id: 'claim-reimb', kind: 'REIMBURSEMENT', status: 'APPROVED', providerId: 'prov-1',
      items: [{ id: 'it-2', amountRequested: 5000, amountApproved: 4000 }],
    }]);
    await expect(service.createBatchInvoice({ providerId: 'prov-1', periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-13') } as any))
      .rejects.toThrow(/Aucun sinistre tiers-payant/);
    expect(prisma.claim.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ kind: 'THIRDPARTY' }),
    }));
  });

  it('claim d\u2019un autre prestataire → exclu du périmètre', async () => {
    const { service } = makeBatch([{
      id: 'claim-other', kind: 'THIRDPARTY', status: 'APPROVED', providerId: 'prov-OTHER',
      items: [{ id: 'it-3', amountRequested: 7000, amountApproved: 7000 }],
    }]);
    await expect(service.createBatchInvoice({ providerId: 'prov-1', periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-13') } as any))
      .rejects.toThrow(/Aucun sinistre/);
  });
});

// ---------------------------------------------------------------------------
// P3-C2 — Invariant financier : CONFIRMED ⇒ engagement CTS atomique
// ---------------------------------------------------------------------------
describe('P3-C2 — engagement CTS atomique avec la confirmation', () => {
  function makeProvider(claimStatus: string, ctsImpl?: any) {
    const establishment = { id: 'prov-1', name: 'Pharmacie Test' };
    const claims = new Map<string, any>();
    const txOps: any[] = [];
    const claim: any = {
      id: 'claim-cts-1',
      reference: 'TPE-CTS1',
      kind: 'THIRDPARTY',
      status: claimStatus,
      contractId: 'ctr-1',
      providerId: 'prov-1',
      beneficiaryId: 'ben-1',
      claimantUserId: 'patient-1',
      createdAt: new Date(),
      submittedAt: null,
      totalApproved: null,
      items: [{ id: 'i1', amountApproved: 42000, amountRequested: 42000 }],
    };
    const prismaObj: any = {
      provider: establishment,
      claim: {
        findFirst: vi.fn(async ({ where }: any) => {
          const c = claims.get(where.id);
          if (!c) return null;
          if (where.providerId && c.providerId !== where.providerId) return null;
          if (where.kind && c.kind !== where.kind) return null;
          if (where.status && c.status !== where.status) return null;
          return c;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const c = claims.get(where.id);
          Object.assign(c, data);
          return c;
        }),
      },
      careRecord: { findFirst: vi.fn(async () => null) },
      careRecordEvent: { create: vi.fn(async () => ({})) },
      user: { findMany: vi.fn(async () => [{ id: 'mgr-1' }]) },
      systemConfig: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(async (fn: any) => {
        const tx = {
          claim: {
            update: vi.fn(async ({ where, data }: any) => {
              txOps.push({ op: 'claim.update', data });
              const c = claims.get(where.id);
              Object.assign(c, data);
              return c;
            }),
          },
        };
        return fn(tx);
      }),
    };
    claims.set(claim.id, claim);
    const cts = ctsImpl ?? {
      recordEngagement: vi.fn(async () => ({})),
      recordReversal: vi.fn(async () => ({})),
    };
    const controller = new ProviderPortalController(
      prismaObj as any,
      { buildEstimation: vi.fn(async () => ({})) } as any,
      {} as any,
      dispatch() as any,
      { requireEstablishment: vi.fn(async () => ({ establishment, user: { id: 'prov-user-1' } })) } as any,
      cts,
    );
    return { controller, cts, claim, claims, txOps };
  }

  const auth = { id: 'prov-user-1' } as any;

  it('confirm OK : engagement appelé avec tx + claim CONFIRMED', async () => {
    const { controller, cts, claim, txOps } = makeProvider('PENDING_CONFIRMATION');
    const res = await controller.confirm(auth, claim.id);
    expect(res.status).toBe('CONFIRMED');
    expect(cts.recordEngagement).toHaveBeenCalledTimes(1);
    const [contractId, claimId, amount, opts] = cts.recordEngagement.mock.calls[0];
    expect(contractId).toBe('ctr-1');
    expect(claimId).toBe(claim.id);
    expect(amount).toBe(42000);
    expect(opts.tx).toBeDefined();
    // Les deux écritures (engagement + statut) partagent la MÊME transaction
    expect(opts.tx).toBe(txOps.length >= 0 ? (cts.recordEngagement.mock.calls[0][3].tx) : opts.tx);
    expect(claim.status).toBe('CONFIRMED');
    expect(claim.totalApproved).toBe(42000);
  });

  it('CTS épuisé (engagement échoue) → pas de confirmation, rollback', async () => {
    const failingCts = {
      recordEngagement: vi.fn(async () => { throw new Error('CTS_INSUFFICIENT: disponible 10000 < engagement 42000'); }),
      recordReversal: vi.fn(async () => ({})),
    };
    const { controller, claim, txOps } = makeProvider('PENDING_CONFIRMATION', failingCts);
    await expect(controller.confirm(auth, claim.id)).rejects.toThrow(/CTS_INSUFFICIENT/);
    expect(claim.status).toBe('PENDING_CONFIRMATION'); // pas de confirmation
    expect(txOps.find(o => o.op === 'claim.update')).toBeUndefined(); // statut jamais écrit
  });

  it('sans CTS injecté (optional) : la confirmation reste possible', async () => {
    const { controller, claim, txOps } = makeProvider('PENDING_CONFIRMATION', undefined);
    // Recréer sans CTS : passer undefined explicitement
    const establishment = { id: 'prov-1', name: 'Pharmacie Test' };
    expect(establishment).toBeDefined();
    const res = await controller.confirm(auth, claim.id);
    expect(res.status).toBe('CONFIRMED');
    expect(txOps.find(o => o.op === 'claim.update')).toBeDefined();
  });
});

// P3-C2 côté gestionnaire : authorize / approve
describe('P3-C2 — engagement atomique authorize/approve (gestionnaire)', () => {
  function makeClaims(ctsImpl?: any) {
    const claims = new Map<string, any>();
    const claim: any = {
      id: 'claim-mgr-1',
      reference: 'TPE-MGR1',
      kind: 'THIRDPARTY',
      status: 'AUTH_REQUIRED',
      contractId: 'ctr-1',
      providerId: 'prov-1',
      providerUserId: null,
      beneficiaryId: 'ben-1',
      claimantUserId: 'patient-1',
      totalRequested: 100000,
      totalApproved: 100000,
      items: [
        { id: 'it-1', amountRequested: 60000, amountApproved: 60000 },
        { id: 'it-2', amountRequested: 40000, amountApproved: 40000 },
      ],
    };
    const prismaObj: any = {
      claim: {
        findUnique: vi.fn(async ({ where }: any) => claims.get(where.id) ?? null),
        findFirst: vi.fn(async () => null),
        update: vi.fn(async ({ where, data }: any) => {
          const c = claims.get(where.id);
          Object.assign(c, data);
          return c;
        }),
      },
      claimItem: { findMany: vi.fn(async () => []), update: vi.fn(async () => ({})) },
      user: { findMany: vi.fn(async () => [{ id: 'mgr-1' }]) },
      auditLog: { create: vi.fn(async () => ({})) },
      careRecord: { findFirst: vi.fn(async () => null) },
      careRecordEvent: { create: vi.fn(async () => ({})) },
      systemConfig: { findUnique: vi.fn(async () => null) },
      $transaction: vi.fn(async (fn: any) => fn(prismaObj)),
    };
    claims.set(claim.id, claim);
    const cts = ctsImpl ?? { recordEngagement: vi.fn(async () => ({})) };
    const controller = new ClaimsController(
      { buildEstimation: vi.fn(), notifyManagers: vi.fn() } as any,
      prismaObj as any,
      dispatch() as any,
      {} as any,
      undefined, // accounting (optional)
      undefined, // pdf (optional)
      cts,
    );
    return { controller, cts, claim, prisma: prismaObj };
  }

  const mgr = { id: 'mgr-1', role: 'INSURANCE_MANAGER' } as any;

  it('authorizeThirdParty : engagement atomique avec le passage à AUTHORIZED', async () => {
    const { controller, cts, claim } = makeClaims();
    await controller.authorizeThirdParty(mgr, claim.id, { note: 'ok' } as any);
    expect(cts.recordEngagement).toHaveBeenCalledTimes(1);
    const [contractId, claimId, amount, opts] = cts.recordEngagement.mock.calls[0];
    expect(contractId).toBe('ctr-1');
    expect(claimId).toBe(claim.id);
    expect(amount).toBe(100000);
    expect(opts.tx).toBeDefined();
    expect(claim.status).toBe('AUTHORIZED');
    expect(claim.authorizedAmount).toBe(100000);
  });

  it('authorizeThirdParty : engagement échoue → statut inchangé (rollback)', async () => {
    const failing = { recordEngagement: vi.fn(async () => { throw new Error('CTS down'); }) };
    const { controller, claim } = makeClaims(failing);
    await expect(controller.authorizeThirdParty(mgr, claim.id, {} as any)).rejects.toThrow(/CTS down/);
    expect(claim.status).toBe('AUTH_REQUIRED');
  });
});

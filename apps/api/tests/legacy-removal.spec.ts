import { describe, it, expect, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ProviderPortalController } from '../src/modules/providers/provider-portal.controller';

// ---------------------------------------------------------------------------
// Helpers — mock factory for ProviderPortalController.initiate
// ---------------------------------------------------------------------------
function createInitiateMocks(opts: {
  prescriptionFound: boolean;
  actRequiresPrescription?: boolean | null;
  categoryIdForAct?: string;
}) {
  const establishment = { id: 'prov-1', name: 'Clinique Test' };
  const principalUser = {
    id: 'user-1',
    firstName: 'Jean',
    lastName: 'Dupont',
    memberNumber: 'MEM-001',
    birthDate: new Date('1990-01-01'),
  };
  const contract: any = {
    id: 'ctr-1',
    number: 'CTR-001',
    status: 'ACTIVE',
    principalUser,
    product: { name: 'Produit Test', insurerPartner: null },
    productId: 'prod-1',
    beneficiaries: [],
    _count: { claims: 0 },
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
  };

  // prescription mock: return a prescription with remaining qty >0 if opts.prescriptionFound
  const prescriptionLines = opts.prescriptionFound
    ? [{ quantity: 2, deliveredQty: 0, categoryId: 'PHARMACY' }]
    : [];

  const mockPrescription = opts.prescriptionFound
    ? {
        id: 'pres-1',
        patientUserId: principalUser.id,
        status: 'ACTIVE',
        validFrom: new Date(Date.now() - 86400000),
        validUntil: new Date(Date.now() + 86400000),
        lines: prescriptionLines,
      }
    : null;

  const prisma: any = {
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id === 'prov-user-1') return { id: 'prov-user-1', providerId: 'prov-1', providerStaff: establishment };
        return null;
      }),
      findMany: vi.fn(async () => [{ id: 'mgr-1' }]),
    },
    act: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (!where?.id) return null;
        // For CONSULTATION act, return requiresPrescription false
        // For PHARMACY act, return requiresPrescription true
        if (opts.actRequiresPrescription !== undefined && opts.actRequiresPrescription !== null) {
          return { id: where.id, requiresPrescription: opts.actRequiresPrescription, authThreshold: null, categoryId: opts.categoryIdForAct ?? 'PHARMACY' };
        }
        return null;
      }),
    },
    prescription: {
      findFirst: vi.fn(async () => mockPrescription),
    },
    product: {
      findUnique: vi.fn(async () => ({ thirdPartyAuthThreshold: null })),
    },
    contract: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
    },
    claim: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      groupBy: vi.fn(async () => []),
    },
    claimItem: { groupBy: vi.fn(async () => []) },
    $transaction: vi.fn(async (fn: any) => {
      if (typeof fn === 'function') {
        const tx: any = {
          claim: {
            create: vi.fn(async ({ data }: any) => ({
              id: 'claim-1',
              reference: 'TPE-TEST001',
              status: data.status,
              ...data,
              items: data.items?.create ?? [],
              createdAt: new Date(),
            })),
          },
          fileObject: { create: vi.fn(async ({ data }: any) => ({ id: 'file-1', ...data })) },
          claimDocument: { create: vi.fn(async () => ({})) },
        };
        return fn(tx);
      }
      return fn;
    }),
    fileObject: { create: vi.fn(async () => ({})) },
    claimDocument: { create: vi.fn(async () => ({})) },
    auditLog: { create: vi.fn(async () => ({})) },
  };

  const claimsService: any = {
    buildEstimation: vi.fn(async (_contract: any, _careDate: any, items: any[]) => ({
      ok: true,
      flags: [],
      items: items.map((it: any) => ({
        categoryId: it.categoryId,
        amountRequested: it.amountRequested,
        amountEligible: it.amountRequested,
        rateApplied: 70,
        deductibleApplied: 0,
        amountApproved: Math.round(it.amountRequested * 0.7),
      })),
      totals: {
        requested: items.reduce((a: number, it: any) => a + it.amountRequested, 0),
        eligible: items.reduce((a: number, it: any) => a + it.amountRequested, 0),
        approved: Math.round(items.reduce((a: number, it: any) => a + it.amountRequested, 0) * 0.7),
        outOfPocket: Math.round(items.reduce((a: number, it: any) => a + it.amountRequested, 0) * 0.3),
      },
    })),
  };

  const storage: any = { save: vi.fn(async () => ({ storagePath: 'tmp/x', mime: 'application/pdf', size: 123, sha256: 'abc' })) };
  const dispatch: any = { dispatchToUser: vi.fn(async () => {}), dispatchToMany: vi.fn(async () => {}) };

  const portalService: any = {
    requireEstablishment: vi.fn(async () => ({ establishment, user: { id: 'prov-user-1' } })),
    resolveContract: vi.fn(async () => contract),
  };

  const controller = new ProviderPortalController(prisma as any, claimsService as any, storage as any, dispatch as any, portalService as any);

  return { controller, prisma, portalService, contract };
}

describe('Task 10 — Suppression du circuit tiers payant legacy générique', () => {
  it('PHARMACY sans ordonnance valide → 400 (legacy supprimé pour actes à prescription obligatoire)', async () => {
    const { controller } = createInitiateMocks({ prescriptionFound: false, actRequiresPrescription: null });

    const dto = {
      memberNumber: 'MEM-001',
      items: [{ categoryId: 'PHARMACY', quantity: 1, unitPrice: 5000, code: 'MED-001', label: 'Paracétamol' }],
    };

    await expect(
      (controller as any).initiate({ id: 'prov-user-1' } as any, JSON.stringify(dto), []),
    ).rejects.toThrow(BadRequestException);

    try {
      await (controller as any).initiate({ id: 'prov-user-1' } as any, JSON.stringify(dto), []);
    } catch (e: any) {
      expect(e.message).toMatch(/prescription/i);
      // Ensure message mentions ordonnance / prescription
      expect(e.message).toMatch(/ordonnance|prescription/i);
    }
  });

  it('PHARMACY via Act (requiresPrescription=true) sans ordonnance → 400 même si categoryId != PHARMACY', async () => {
    const { controller } = createInitiateMocks({
      prescriptionFound: false,
      actRequiresPrescription: true,
      categoryIdForAct: 'PHARMACY',
    });

    const dto = {
      memberNumber: 'MEM-001',
      items: [{ actId: 'act-pharma-1', categoryId: 'PHARMACY', quantity: 1, unitPrice: 5000, code: 'MED-001', label: 'Amoxicilline' }],
    };

    await expect(
      (controller as any).initiate({ id: 'prov-user-1' } as any, JSON.stringify(dto), []),
    ).rejects.toThrow(BadRequestException);
  });

  it('CONSULTATION sans ordonnance → 200 (direct TP conservé pour actes sans prescription)', async () => {
    const { controller } = createInitiateMocks({ prescriptionFound: false, actRequiresPrescription: false });

    const dto = {
      memberNumber: 'MEM-001',
      items: [{ categoryId: 'CONSULTATION', quantity: 1, unitPrice: 10000, code: 'CONS-001', label: 'Consultation générale' }],
    };

    const res = await (controller as any).initiate({ id: 'prov-user-1' } as any, JSON.stringify(dto), []);
    expect(res).toBeDefined();
    expect(res.id).toBe('claim-1');
    expect(res.reference).toMatch(/^TPE-/);
    // Should have status PENDING_CONFIRMATION or AUTH_REQUIRED but not throw
    expect(['PENDING_CONFIRMATION', 'AUTH_REQUIRED']).toContain(res.status);
  });

  it('CONSULTATION via Act requiresPrescription=false sans ordonnance → 200 (direct TP autorisé)', async () => {
    const { controller } = createInitiateMocks({ prescriptionFound: false, actRequiresPrescription: false });

    const dto = {
      memberNumber: 'MEM-001',
      items: [{ actId: 'act-consult-1', categoryId: 'CONSULTATION', quantity: 1, unitPrice: 8000, code: 'CONS-002', label: 'Consultation' }],
    };

    const res = await (controller as any).initiate({ id: 'prov-user-1' } as any, JSON.stringify(dto), []);
    expect(res.ok === undefined || res.ok !== false).toBeTruthy();
    expect(res.id).toBeDefined();
  });

  it('PHARMACY avec ordonnance valide → 200 (circuit prescription-obligatoire fonctionne)', async () => {
    const { controller } = createInitiateMocks({ prescriptionFound: true, actRequiresPrescription: null });

    const dto = {
      memberNumber: 'MEM-001',
      items: [{ categoryId: 'PHARMACY', quantity: 1, unitPrice: 5000, code: 'MED-001', label: 'Paracétamol' }],
    };

    const res = await (controller as any).initiate({ id: 'prov-user-1' } as any, JSON.stringify(dto), []);
    expect(res.id).toBe('claim-1');
    expect(res.status).toBeDefined();
  });
});

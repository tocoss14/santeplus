import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ProviderPortalController } from '../src/modules/providers/provider-portal.controller';
import { CronService } from '../src/jobs/cron.service';

function createMockPrisma() {
  const claims = new Map<string, any>();
  const auditLogs: any[] = [];
  const careRecordEvents: any[] = [];
  const users: any[] = [
    { id: 'mgr-1', role: 'INSURANCE_MANAGER', status: 'ACTIVE' },
    { id: 'mgr-2', role: 'SUPER_ADMIN', status: 'ACTIVE' },
  ];
  const establishment = { id: 'prov-1', name: 'Clinique Test' };
  return {
    _claims: claims,
    _auditLogs: auditLogs,
    _careRecordEvents: careRecordEvents,
    provider: establishment,
    claim: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where.id && where.status) {
          const c = claims.get(where.id);
          if (!c) return null;
          if (where.providerId && c.providerId !== where.providerId) return null;
          if (c.status !== where.status) return null;
          return c;
        }
        if (where.id) return claims.get(where.id) ?? null;
        for (const c of claims.values()) {
          if (where.providerId && c.providerId !== where.providerId) continue;
          if (where.status && c.status !== where.status) continue;
          return c;
        }
        return null;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        const all = [...claims.values()];
        if (!where) return all;
        return all.filter(c => {
          if (where.status && c.status !== where.status) return false;
          if (where.emergencyAt?.lt && !(c.emergencyAt && c.emergencyAt < where.emergencyAt.lt)) return false;
          if (where.decidedAt !== undefined) {
            if (where.decidedAt === null && c.decidedAt !== null && c.decidedAt !== undefined) return false;
          }
          return true;
        });
      }),
      findUnique: vi.fn(async ({ where }: any) => claims.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const c = claims.get(where.id);
        if (!c) throw new Error('not found');
        Object.assign(c, data);
        return c;
      }),
      create: vi.fn(async ({ data }: any) => {
        const c = { id: `claim-${claims.size+1}`, ...data, createdAt: new Date(), updatedAt: new Date() };
        claims.set(c.id, c);
        return c;
      }),
      count: vi.fn(async () => 0),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => { auditLogs.push(data); return data; }),
    },
    careRecordEvent: {
      create: vi.fn(async ({ data }: any) => { careRecordEvents.push(data); return data; }),
    },
    careRecord: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (where?.claimId) {
          // simulate no direct claimId match unless test overrides
          return null;
        }
        if (where?.patientUserId) return { id: 'cr-1', patientUserId: where.patientUserId };
        return { id: 'cr-1', patientUserId: 'patient-1' };
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: any) => {
        if (where?.role?.in) return users.filter(u => where.role.in.includes(u.role));
        return users;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id === 'prov-user-1') return { id: 'prov-user-1', providerId: 'prov-1', providerStaff: { id: 'prov-1', name: 'Clinique Test', status: 'ACTIVE' }, isEstablishmentAdmin: true };
        return null;
      }),
    },
    notification: { create: vi.fn(async () => ({})) },
    systemConfig: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(async (fn: any) => fn({
      claim: { create: async (a: any) => ({ id: 'x' }) },
      fileObject: { create: async () => ({ id: 'f' }) },
      claimDocument: { create: async () => ({}) },
    })),
  };
}

describe('emergency override', () => {
  let prisma: any;
  let dispatch: any;
  let controller: any;

  beforeEach(() => {
    prisma = createMockPrisma();
    dispatch = { dispatchToUser: vi.fn(async () => {}), dispatchToMany: vi.fn(async () => {}) };
    const claimsService = { buildEstimation: vi.fn(async () => ({ totals: { requested: 100, approved: 200000 }, items: [], flags: [] })) };
    const storage = { save: vi.fn(async () => ({ storagePath: 'x', mime: 'pdf', size: 10, sha256: 'abc' })) };
    const portalService = {
      requireEstablishment: vi.fn(async () => ({ establishment: prisma.provider, user: { id: 'prov-user-1' } })),
      resolveContract: vi.fn(async () => ({ id: 'ctr-1', status: 'ACTIVE' })),
    };
    controller = new ProviderPortalController(prisma as any, claimsService as any, storage as any, dispatch as any, portalService as any);
  });

  it('Test 1: POST /provider/thirdparty/:id/confirm on AUTH_REQUIRED sans dérogation -> 400 bloqué', async () => {
    const claim = {
      id: 'claim-auth',
      providerId: 'prov-1',
      kind: 'THIRDPARTY',
      status: 'AUTH_REQUIRED',
      createdAt: new Date(),
      reference: 'TPE-001',
      items: [{ amountApproved: 100 }],
      claimantUserId: 'patient-1',
    };
    prisma._claims.set(claim.id, claim);
    await expect(controller.confirm({ id: 'prov-user-1' }, claim.id)).rejects.toThrow(BadRequestException);
    try {
      await controller.confirm({ id: 'prov-user-1' }, claim.id);
    } catch (e: any) {
      expect(e.message).toMatch(/Autorisation préalable/);
    }
  });

  it('Test 2: POST /provider/thirdparty/:id/emergency-confirm avec justification courte (<10) -> 400', async () => {
    expect(typeof controller.emergencyConfirm).toBe('function');
    const claim = {
      id: 'claim-auth-2',
      providerId: 'prov-1',
      kind: 'THIRDPARTY',
      status: 'AUTH_REQUIRED',
      createdAt: new Date(),
      reference: 'TPE-002',
      items: [{ amountApproved: 100 }],
      claimantUserId: 'patient-1',
    };
    prisma._claims.set(claim.id, claim);
    await expect(controller.emergencyConfirm({ id: 'prov-user-1' }, claim.id, { emergencyJustification: 'court' })).rejects.toThrow(BadRequestException);
    await expect(controller.emergencyConfirm({ id: 'prov-user-1' }, claim.id, { emergencyJustification: '123456789' })).rejects.toThrow(BadRequestException);
  });

  it('Test 3: emergency-confirm avec justification valide -> 200, status AUTHORIZED_EMERGENCY, champs emergency*, AuditLog et CareRecordEvent créés, notification EMERGENCY_OVERRIDE', async () => {
    const claim = {
      id: 'claim-auth-3',
      providerId: 'prov-1',
      kind: 'THIRDPARTY',
      status: 'AUTH_REQUIRED',
      createdAt: new Date(),
      reference: 'TPE-003',
      items: [{ amountApproved: 100 }],
      claimantUserId: 'patient-1',
      contractId: 'ctr-1',
    };
    prisma._claims.set(claim.id, claim);
    prisma.careRecord.findFirst = vi.fn(async () => ({ id: 'cr-1', patientUserId: 'patient-1' }));

    const res = await controller.emergencyConfirm({ id: 'prov-user-1' }, claim.id, { emergencyJustification: 'Urgence vitale, patient nécessite une délivrance immédiate.' });
    expect(res.status).toBe('AUTHORIZED_EMERGENCY');
    const updated = prisma._claims.get(claim.id);
    expect(updated.status).toBe('AUTHORIZED_EMERGENCY');
    expect(updated.emergencyOverride).toBe(true);
    expect(updated.emergencyJustification).toContain('Urgence vitale');
    expect(updated.emergencyActorId).toBe('prov-user-1');
    expect(updated.emergencyAt).toBeInstanceOf(Date);
    expect(prisma.auditLog.create).toHaveBeenCalled();
    const auditCall = prisma.auditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe('EMERGENCY_OVERRIDE');
    expect(prisma.careRecordEvent.create).toHaveBeenCalled();
    expect(dispatch.dispatchToMany).toHaveBeenCalled();
    const dispatchCall = dispatch.dispatchToMany.mock.calls[0];
    expect(dispatchCall[1].topic).toBe('EMERGENCY_OVERRIDE');
  });

  it('Test 4: après dérogation, confirm autorise AUTHORIZED_EMERGENCY -> CONFIRMED', async () => {
    const claim = {
      id: 'claim-emerg',
      providerId: 'prov-1',
      kind: 'THIRDPARTY',
      status: 'AUTHORIZED_EMERGENCY',
      createdAt: new Date(),
      reference: 'TPE-004',
      items: [{ amountApproved: 50000 }],
      claimantUserId: 'patient-1',
      emergencyOverride: true,
      emergencyAt: new Date(),
    };
    prisma._claims.set(claim.id, claim);
    const res = await controller.confirm({ id: 'prov-user-1' }, claim.id);
    expect(res.status).toBe('CONFIRMED');
    expect(prisma._claims.get(claim.id).status).toBe('CONFIRMED');
  });

  it('cron checkEmergencyOverrides envoie rappel après 48h si decidedAt null', async () => {
    const cron = new CronService(prisma as any, dispatch as any);
    expect(typeof cron.checkEmergencyOverrides).toBe('function');

    const oldClaim = {
      id: 'claim-old',
      reference: 'TPE-OLD',
      status: 'AUTHORIZED_EMERGENCY',
      emergencyAt: new Date(Date.now() - 49 * 3600 * 1000),
      decidedAt: null,
      providerId: 'prov-1',
    };
    const recentClaim = {
      id: 'claim-recent',
      reference: 'TPE-RECENT',
      status: 'AUTHORIZED_EMERGENCY',
      emergencyAt: new Date(Date.now() - 10 * 3600 * 1000),
      decidedAt: null,
      providerId: 'prov-1',
    };
    prisma._claims.set(oldClaim.id, oldClaim);
    prisma._claims.set(recentClaim.id, recentClaim);

    await cron.checkEmergencyOverrides();
    expect(dispatch.dispatchToMany).toHaveBeenCalled();
    const topics = dispatch.dispatchToMany.mock.calls.map((c: any) => c[1].topic);
    expect(topics).toContain('EMERGENCY_OVERRIDE');
    const bodies = dispatch.dispatchToMany.mock.calls.map((c: any) => JSON.stringify(c[1]));
    const hasOld = bodies.some((b: string) => b.includes('TPE-OLD') || b.includes('48h') || b.includes('urgence'));
    expect(hasOld).toBe(true);
  });
});

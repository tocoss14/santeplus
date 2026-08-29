import { describe, it, expect, vi } from 'vitest';
import { FraudDetectionJob, zScore, shouldAlert, mean, stddev } from '../src/jobs/fraud-detection.job';

describe('fraud pure helpers', () => {
  it('zScore computes (value-mean)/stddev', () => {
    expect(zScore(50000, 16666.666, 14907)).toBeCloseTo(2.236, 1);
    expect(zScore(10000, 16666.666, 14907)).toBeCloseTo(-0.447, 1);
    expect(zScore(100, 100, 0)).toBe(0); // stddev 0 → 0
  });
  it('shouldAlert true when |Z|>2', () => {
    expect(shouldAlert(2.1)).toBe(true);
    expect(shouldAlert(-2.5)).toBe(true);
    expect(shouldAlert(1.9)).toBe(false);
    expect(shouldAlert(2)).toBe(false); // strictly >2
    expect(shouldAlert(0)).toBe(false);
  });
  it('mean and stddev', () => {
    expect(mean([10, 10, 10, 10, 10, 50])).toBeCloseTo(16.666, 1);
    const vals = [10000, 10000, 10000, 10000, 10000, 50000];
    const m = mean(vals);
    const sd = stddev(vals, m);
    expect(m).toBeCloseTo(16666.666, 0);
    expect(sd).toBeGreaterThan(14000);
  });
});

function makeClaim(providerId: string, providerName: string, amount: number, date: Date) {
  return {
    id: `claim-${providerId}-${Math.random().toString(36).slice(2, 6)}`,
    providerId,
    provider: { name: providerName },
    totalRequested: amount,
    totalApproved: amount,
    contractId: `ctr-${providerId}`,
    beneficiaryId: `ben-${providerId}-${Math.random().toString(36).slice(2, 4)}`,
    claimantUserId: `user-${providerId}`,
    careDate: date,
    createdAt: date,
    items: [{ code: 'MED-001' }],
  };
}

function createMockPrismaForFraud(opts: {
  claims: any[];
  managers?: any[];
  auditLogs?: any[];
}) {
  const auditLogs: any[] = opts.auditLogs ?? [];
  const managers = opts.managers ?? [{ id: 'mgr-1' }, { id: 'mgr-2' }];
  const prisma: any = {
    claim: {
      findMany: vi.fn(async ({ where, select, include }: any) => {
        // Return all claims regardless of where; filtering done in job
        // But respect providerId not null filter if present
        let result = opts.claims;
        if (where?.providerId?.not === null) {
          result = result.filter((c: any) => c.providerId != null);
        }
        // Return with appropriate shape
        if (select) {
          return result.map((c: any) => ({
            providerId: c.providerId,
            provider: c.provider,
            totalRequested: c.totalRequested,
            totalApproved: c.totalApproved,
            careDate: c.careDate,
            createdAt: c.createdAt,
          }));
        }
        if (include) {
          return result;
        }
        return result;
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: any) => {
        if (where?.role?.in) return managers;
        return [];
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      }),
      findMany: vi.fn(async () => auditLogs),
    },
    notification: {
      create: vi.fn(async ({ data }: any) => data),
    },
    _auditLogs: auditLogs,
  };
  return prisma;
}

function createDispatchMock() {
  const calls: any[] = [];
  return {
    _calls: calls,
    dispatchToUser: vi.fn(async (userId: string, input: any) => { calls.push({ userId, input }); }),
    dispatchToMany: vi.fn(async (userIds: string[], input: any) => {
      for (const id of userIds) calls.push({ userId: id, input });
    }),
  };
}

describe('fraud detection — Z-score outlier', () => {
  it('5 normal providers (avg 10000, count 10) + 1 outlier avg 50000 → outlier flagged, normals not', async () => {
    const now = new Date();
    const claims: any[] = [];
    // 5 normal providers, 10 claims each at 10000
    for (let p = 1; p <= 5; p++) {
      for (let i = 0; i < 10; i++) {
        claims.push(makeClaim(`prov-${p}`, `Prestataire ${p}`, 10000, new Date(now.getTime() - i * 86400000)));
      }
    }
    // outlier provider avg 50000
    for (let i = 0; i < 10; i++) {
      claims.push(makeClaim('prov-outlier', 'Prestataire Outlier', 50000, new Date(now.getTime() - i * 86400000)));
    }

    const prisma = createMockPrismaForFraud({ claims });
    const dispatch = createDispatchMock();
    const job = new FraudDetectionJob(prisma as any, dispatch as any);
    const { zAlerts } = await job.checkFraud(now);

    expect(zAlerts.length).toBeGreaterThan(0);
    const outlier = zAlerts.find((a) => a.providerId === 'prov-outlier');
    expect(outlier).toBeDefined();
    expect(Math.abs(outlier!.zAvg)).toBeGreaterThan(2);
    // normal providers should not be flagged
    for (let p = 1; p <= 5; p++) {
      const normal = zAlerts.find((a) => a.providerId === `prov-${p}`);
      expect(normal).toBeUndefined();
    }
    // auditLog and notification created
    expect(prisma._auditLogs.length).toBeGreaterThan(0);
    expect(prisma._auditLogs.some((a: any) => a.entityId === 'prov-outlier' && a.action === 'FRAUD_ALERT')).toBe(true);
    const fraudCalls = dispatch._calls.filter((c: any) => c.input.topic === 'FRAUD_ALERT');
    expect(fraudCalls.length).toBeGreaterThan(0);
  });

  it('outlier by count 50 vs normal 10 → flagged', async () => {
    const now = new Date();
    const claims: any[] = [];
    for (let p = 1; p <= 5; p++) {
      for (let i = 0; i < 10; i++) {
        claims.push(makeClaim(`prov-${p}`, `Prestataire ${p}`, 10000, new Date(now.getTime() - i * 86400000)));
      }
    }
    // outlier with 50 claims
    for (let i = 0; i < 50; i++) {
      claims.push(makeClaim('prov-outlier-count', 'Prestataire Count Outlier', 10000, new Date(now.getTime() - (i % 25) * 86400000)));
    }
    const prisma = createMockPrismaForFraud({ claims });
    const dispatch = createDispatchMock();
    const job = new FraudDetectionJob(prisma as any, dispatch as any);
    const { zAlerts } = await job.checkFraud(now);
    const outlier = zAlerts.find((a) => a.providerId === 'prov-outlier-count');
    expect(outlier).toBeDefined();
    expect(Math.abs(outlier!.zCount)).toBeGreaterThan(2);
  });

  it('providers with <5 claims are ignored', async () => {
    const now = new Date();
    const claims: any[] = [];
    // only 3 claims for outlier, should be ignored even if avg is huge
    for (let i = 0; i < 3; i++) {
      claims.push(makeClaim('prov-small', 'Small', 100000, new Date(now.getTime() - i * 86400000)));
    }
    // need at least 2 providers with >=5 to compute, so add 2 normal with 10 each
    for (let p = 1; p <= 2; p++) {
      for (let i = 0; i < 10; i++) {
        claims.push(makeClaim(`prov-${p}`, `Prestataire ${p}`, 10000, new Date(now.getTime() - i * 86400000)));
      }
    }
    const prisma = createMockPrismaForFraud({ claims });
    const dispatch = createDispatchMock();
    const job = new FraudDetectionJob(prisma as any, dispatch as any);
    const { zAlerts } = await job.checkFraud(now);
    expect(zAlerts.find((a) => a.providerId === 'prov-small')).toBeUndefined();
  });
});

describe('fraud detection — cumul suspect', () => {
  it('same contract, same medication code, different beneficiaries, same day → flagged', async () => {
    const now = new Date();
    const day = new Date(now.getTime());
    const claims = [
      {
        id: 'claim-cumul-1',
        contractId: 'ctr-1',
        beneficiaryId: 'ben-A',
        claimantUserId: 'user-A',
        careDate: day,
        createdAt: day,
        providerId: 'prov-1',
        provider: { name: 'Pharmacie 1' },
        totalRequested: 5000,
        totalApproved: 5000,
        items: [{ code: 'MED-PARACETAMOL' }],
      },
      {
        id: 'claim-cumul-2',
        contractId: 'ctr-1',
        beneficiaryId: 'ben-B',
        claimantUserId: 'user-B',
        careDate: day,
        createdAt: day,
        providerId: 'prov-1',
        provider: { name: 'Pharmacie 1' },
        totalRequested: 5000,
        totalApproved: 5000,
        items: [{ code: 'MED-PARACETAMOL' }],
      },
    ];
    // add normal providers to avoid empty Z alerts interfering
    for (let p = 1; p <= 3; p++) {
      for (let i = 0; i < 10; i++) {
        claims.push(makeClaim(`prov-${p}`, `Prestataire ${p}`, 10000, new Date(now.getTime() - i * 86400000)));
      }
    }
    const prisma = createMockPrismaForFraud({ claims });
    const dispatch = createDispatchMock();
    const job = new FraudDetectionJob(prisma as any, dispatch as any);
    const { cumulAlerts } = await job.checkFraud(now);
    expect(cumulAlerts.length).toBe(1);
    expect(cumulAlerts[0].contractId).toBe('ctr-1');
    expect(cumulAlerts[0].code).toBe('MED-PARACETAMOL');
    expect(cumulAlerts[0].beneficiaryIds).toContain('ben-A');
    expect(cumulAlerts[0].beneficiaryIds).toContain('ben-B');
    expect(cumulAlerts[0].count).toBe(2);
    // audit log for cumul
    expect(prisma._auditLogs.some((a: any) => a.entityId === 'ctr-1' && JSON.parse(a.meta).type === 'CUMUL')).toBe(true);
  });

  it('single beneficiary same code same day → not flagged', async () => {
    const now = new Date();
    const day = new Date(now.getTime());
    const claims = [
      {
        id: 'claim-single-1',
        contractId: 'ctr-2',
        beneficiaryId: 'ben-A',
        claimantUserId: 'user-A',
        careDate: day,
        createdAt: day,
        providerId: 'prov-1',
        provider: { name: 'Pharmacie 1' },
        totalRequested: 5000,
        totalApproved: 5000,
        items: [{ code: 'MED-IBUPROFENE' }],
      },
      {
        id: 'claim-single-2',
        contractId: 'ctr-2',
        beneficiaryId: 'ben-A', // same beneficiary
        claimantUserId: 'user-A',
        careDate: day,
        createdAt: day,
        providerId: 'prov-1',
        provider: { name: 'Pharmacie 1' },
        totalRequested: 5000,
        totalApproved: 5000,
        items: [{ code: 'MED-IBUPROFENE' }],
      },
    ];
    for (let p = 1; p <= 3; p++) {
      for (let i = 0; i < 10; i++) {
        claims.push(makeClaim(`prov-${p}`, `Prestataire ${p}`, 10000, new Date(now.getTime() - i * 86400000)));
      }
    }
    const prisma = createMockPrismaForFraud({ claims });
    const dispatch = createDispatchMock();
    const job = new FraudDetectionJob(prisma as any, dispatch as any);
    const { cumulAlerts } = await job.checkFraud(now);
    expect(cumulAlerts.length).toBe(0);
  });

  it('same contract different codes same day → not flagged', async () => {
    const now = new Date();
    const day = new Date(now.getTime());
    const claims = [
      {
        id: 'c1',
        contractId: 'ctr-3',
        beneficiaryId: 'ben-A',
        careDate: day,
        createdAt: day,
        providerId: 'prov-1',
        provider: { name: 'P1' },
        totalRequested: 5000,
        totalApproved: 5000,
        items: [{ code: 'MED-A' }],
      },
      {
        id: 'c2',
        contractId: 'ctr-3',
        beneficiaryId: 'ben-B',
        careDate: day,
        createdAt: day,
        providerId: 'prov-1',
        provider: { name: 'P1' },
        totalRequested: 5000,
        totalApproved: 5000,
        items: [{ code: 'MED-B' }],
      },
    ];
    for (let p = 1; p <= 3; p++) {
      for (let i = 0; i < 10; i++) {
        claims.push(makeClaim(`prov-${p}`, `Prestataire ${p}`, 10000, new Date(now.getTime() - i * 86400000)));
      }
    }
    const prisma = createMockPrismaForFraud({ claims });
    const dispatch = createDispatchMock();
    const job = new FraudDetectionJob(prisma as any, dispatch as any);
    const { cumulAlerts } = await job.checkFraud(now);
    expect(cumulAlerts.length).toBe(0);
  });
});

describe('fraud detection — integration', () => {
  it('no claims → no alerts', async () => {
    const prisma = createMockPrismaForFraud({ claims: [] });
    const dispatch = createDispatchMock();
    const job = new FraudDetectionJob(prisma as any, dispatch as any);
    const res = await job.checkFraud(new Date());
    expect(res.zAlerts.length).toBe(0);
    expect(res.cumulAlerts.length).toBe(0);
  });
});

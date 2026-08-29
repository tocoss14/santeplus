import { describe, it, expect, vi } from 'vitest';
import { isExpired, isExpiredAt, retentionConfigKeys, parseRetentionDays, isRetentionEnabled, getRetentionDays } from '../src/domain/retention';
import { RetentionJob } from '../src/jobs/retention.job';

describe('isExpired helper', () => {
  it('null → false (disabled)', () => {
    expect(isExpired(new Date(Date.now() - 10 * 86400000), null)).toBe(false);
    expect(isExpired(new Date(Date.now() - 10 * 86400000), undefined as any)).toBe(false);
    expect(isExpired(new Date(), 0)).toBe(false);
    expect(isExpired(new Date(), -5)).toBe(false);
  });
  it('10 days ago with 7 days retention → true', () => {
    const createdAt = new Date(Date.now() - 10 * 86400000);
    expect(isExpired(createdAt, 7)).toBe(true);
  });
  it('5 days ago with 7 days → false', () => {
    const createdAt = new Date(Date.now() - 5 * 86400000);
    expect(isExpired(createdAt, 7)).toBe(false);
  });
  it('isExpiredAt deterministic with now param', () => {
    const now = new Date('2026-08-26T12:00:00Z');
    const tenDaysAgo = new Date('2026-08-16T12:00:00Z');
    const fiveDaysAgo = new Date('2026-08-21T12:00:00Z');
    expect(isExpiredAt(tenDaysAgo, 7, now)).toBe(true);
    expect(isExpiredAt(fiveDaysAgo, 7, now)).toBe(false);
    expect(isExpiredAt(tenDaysAgo, null, now)).toBe(false);
  });
});

describe('retentionConfigKeys', () => {
  it('returns expected keys', () => {
    const keys = retentionConfigKeys();
    expect(keys).toContain('retention.careRecordDays');
    expect(keys).toContain('retention.invoiceDays');
    expect(keys).toContain('retention.auditDays');
    expect(keys).toContain('retention.enabled');
  });
});

describe('parseRetentionDays', () => {
  it('parses JSON string numbers', () => {
    expect(parseRetentionDays('7')).toBe(7);
    expect(parseRetentionDays('"7"')).toBe(7);
    expect(parseRetentionDays('30')).toBe(30);
  });
  it('returns null for invalid/zero/negative', () => {
    expect(parseRetentionDays(null as any)).toBe(null);
    expect(parseRetentionDays('0')).toBe(null);
    expect(parseRetentionDays('-5')).toBe(null);
    expect(parseRetentionDays('not-a-number')).toBe(null);
    expect(parseRetentionDays('""')).toBe(null);
  });
  it('handles numeric input', () => {
    expect(parseRetentionDays(7 as any)).toBe(7);
    expect(parseRetentionDays(0 as any)).toBe(null);
  });
});

describe('isRetentionEnabled', () => {
  it('disabled when no numeric value', () => {
    expect(isRetentionEnabled({})).toBe(false);
    expect(isRetentionEnabled({ 'retention.careRecordDays': '0' })).toBe(false);
    expect(isRetentionEnabled({ 'retention.auditDays': '"not-a-number"' })).toBe(false);
  });
  it('enabled when any Days >0', () => {
    expect(isRetentionEnabled({ 'retention.careRecordDays': '30' })).toBe(true);
    expect(isRetentionEnabled({ 'retention.auditDays': '7' })).toBe(true);
    expect(isRetentionEnabled({ 'retention.invoiceDays': '365' })).toBe(true);
  });
  it('enabled=false overrides', () => {
    expect(isRetentionEnabled({ 'retention.enabled': 'false', 'retention.careRecordDays': '30' })).toBe(false);
    expect(isRetentionEnabled({ 'retention.enabled': false, 'retention.auditDays': '7' })).toBe(false);
  });
  it('enabled=true forces enabled', () => {
    expect(isRetentionEnabled({ 'retention.enabled': 'true' })).toBe(true);
    expect(isRetentionEnabled({ 'retention.enabled': true })).toBe(true);
  });
});

function createMockPrisma(opts: {
  configs: Array<{ key: string; value: string }>;
  careRecordUpdateMany?: any;
  auditLogDeleteMany?: any;
  careRecordEventDeleteMany?: any;
}) {
  const prisma: any = {
    systemConfig: {
      findMany: vi.fn(async ({ where }: any) => {
        if (where?.key?.in) {
          return opts.configs.filter((c) => where.key.in.includes(c.key));
        }
        return opts.configs;
      }),
      findUnique: vi.fn(async ({ where }: any) => opts.configs.find((c) => c.key === where.key) ?? null),
    },
    careRecord: {
      updateMany: opts.careRecordUpdateMany ?? vi.fn(async () => ({ count: 0 })),
    },
    careRecordEvent: {
      deleteMany: opts.careRecordEventDeleteMany ?? vi.fn(async () => ({ count: 0 })),
    },
    auditLog: {
      deleteMany: opts.auditLogDeleteMany ?? vi.fn(async () => ({ count: 0 })),
    },
  };
  return prisma;
}

describe('retention job — disabled by default', () => {
  it('no SystemConfig → 0 records purged, enabled=false', async () => {
    const prisma = createMockPrisma({ configs: [] });
    const job = new RetentionJob(prisma as any);
    const res = await job.run(new Date('2026-08-26T12:00:00Z'));
    expect(res.enabled).toBe(false);
    expect(res.careRecordsAnonymized).toBe(0);
    expect(res.auditLogsDeleted).toBe(0);
    expect(prisma.careRecord.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });

  it('enabled=false with Days set → still disabled, 0 purged', async () => {
    const prisma = createMockPrisma({
      configs: [
        { key: 'retention.enabled', value: 'false' },
        { key: 'retention.careRecordDays', value: '7' },
        { key: 'retention.auditDays', value: '7' },
      ],
    });
    const job = new RetentionJob(prisma as any);
    const res = await job.run(new Date('2026-08-26T12:00:00Z'));
    expect(res.enabled).toBe(false);
    expect(res.careRecordsAnonymized).toBe(0);
    expect(res.auditLogsDeleted).toBe(0);
  });
});

describe('retention job — enabled', () => {
  it('auditDays=7 → deletes AuditLog older than 7 days', async () => {
    const deleteMany = vi.fn(async ({ where }: any) => {
      // verify cutoff is 7 days before now
      const cutoff: Date = where.createdAt.lt;
      const now = new Date('2026-08-26T12:00:00Z');
      const diff = (now.getTime() - cutoff.getTime()) / 86400000;
      expect(diff).toBeCloseTo(7, 0);
      return { count: 5 };
    });
    const prisma = createMockPrisma({
      configs: [{ key: 'retention.auditDays', value: '7' }],
      auditLogDeleteMany: deleteMany,
    });
    const job = new RetentionJob(prisma as any);
    const res = await job.run(new Date('2026-08-26T12:00:00Z'));
    expect(res.enabled).toBe(true);
    expect(res.auditLogsDeleted).toBe(5);
    expect(deleteMany).toHaveBeenCalledOnce();
  });

  it('careRecordDays=30 → anonymizes CareRecord older than 30 days', async () => {
    const updateMany = vi.fn(async ({ where, data }: any) => {
      const cutoff: Date = where.createdAt.lt;
      const now = new Date('2026-08-26T12:00:00Z');
      const diff = (now.getTime() - cutoff.getTime()) / 86400000;
      expect(diff).toBeCloseTo(30, 0);
      expect(data.status).toBe('ANONYMIZED');
      expect(data.beneficiaryId).toBe(null);
      return { count: 3 };
    });
    const prisma = createMockPrisma({
      configs: [{ key: 'retention.careRecordDays', value: '30' }],
      careRecordUpdateMany: updateMany,
    });
    const job = new RetentionJob(prisma as any);
    const res = await job.run(new Date('2026-08-26T12:00:00Z'));
    expect(res.enabled).toBe(true);
    expect(res.careRecordsAnonymized).toBe(3);
    expect(updateMany).toHaveBeenCalledOnce();
  });
});

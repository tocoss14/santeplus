import { Injectable } from '@nestjs/common';
import * as cron from 'node-cron';
import { PrismaService } from '../common/prisma.module';
import {
  isRetentionEnabled,
  parseRetentionDays,
  retentionConfigKeys,
} from '../domain/retention';

export interface RetentionResult {
  enabled: boolean;
  careRecordsAnonymized: number;
  auditLogsDeleted: number;
  cutoffCareRecord?: string | null;
  cutoffAudit?: string | null;
}

@Injectable()
export class RetentionJob {
  constructor(private prisma: PrismaService) {}

  /** Schedule daily at 03:00 */
  schedule() {
    cron.schedule('0 3 * * *', () => void this.run().catch((e) => console.error('[retention] cron error', e)));
  }

  private async readConfig(): Promise<Record<string, unknown>> {
    const keys = retentionConfigKeys();
    const rows: any[] = await (this.prisma as any).systemConfig.findMany({
      where: { key: { in: keys } },
    });
    const map: Record<string, unknown> = {};
    for (const r of rows) {
      // r.value is JSON string (e.g., '7' or 'true')
      map[r.key] = r.value;
    }
    return map;
  }

  async isEnabled(): Promise<boolean> {
    const cfg = await this.readConfig();
    return isRetentionEnabled(cfg);
  }

  async run(now = new Date()): Promise<RetentionResult> {
    const cfg = await this.readConfig();
    const enabled = isRetentionEnabled(cfg);
    if (!enabled) {
      console.log('[retention] disabled — no valid retention.* config (requires retention.enabled=true or any retention.*Days >0)');
      return { enabled: false, careRecordsAnonymized: 0, auditLogsDeleted: 0, cutoffCareRecord: null, cutoffAudit: null };
    }

    const careRecordDays = parseRetentionDays(cfg['retention.careRecordDays']);
    const auditDays = parseRetentionDays(cfg['retention.auditDays']);
    // invoiceDays is read for completeness but not purged in MVP (no Invoice model); logged
    const invoiceDays = parseRetentionDays(cfg['retention.invoiceDays']);

    let careRecordsAnonymized = 0;
    let auditLogsDeleted = 0;
    let cutoffCareRecord: string | null = null;
    let cutoffAudit: string | null = null;

    if (careRecordDays != null && careRecordDays > 0) {
      const cutoff = new Date(now.getTime() - careRecordDays * 86400000);
      cutoffCareRecord = cutoff.toISOString();
      try {
        // Anonymize CareRecord: clear PII-adjacent nullable fields.
        // patientUserId is required (FK) so we keep reference but mask other fields
        // and mark status as ANONYMIZED.
        const res: any = await (this.prisma as any).careRecord.updateMany({
          where: { createdAt: { lt: cutoff } },
          data: {
            // Mask nullable relations; keep patientUserId for referential integrity
            beneficiaryId: null,
            providerId: null,
            status: 'ANONYMIZED',
          },
        });
        careRecordsAnonymized = typeof res?.count === 'number' ? res.count : 0;
        // Also delete events older than cutoff that belong to anonymized records
        // (optional — keep count in log via events)
        try {
          await (this.prisma as any).careRecordEvent.deleteMany({
            where: { createdAt: { lt: cutoff } },
          });
        } catch {}
      } catch (e) {
        console.error('[retention] careRecord anonymize error', e);
      }
    }

    if (auditDays != null && auditDays > 0) {
      const cutoff = new Date(now.getTime() - auditDays * 86400000);
      cutoffAudit = cutoff.toISOString();
      try {
        const res: any = await (this.prisma as any).auditLog.deleteMany({
          where: { createdAt: { lt: cutoff } },
        });
        auditLogsDeleted = typeof res?.count === 'number' ? res.count : 0;
      } catch (e) {
        console.error('[retention] auditLog delete error', e);
      }
    }

    if (invoiceDays != null) {
      // MVP: no dedicated Invoice model; Claim.invoiceNumber etc. are not purged.
      // Log for visibility; future: delete or anonymize invoices/payments older than cutoff.
      console.log(`[retention] retention.invoiceDays=${invoiceDays} configured — purge not implemented in MVP (no Invoice model)`);
    }

    console.log(`[retention] enabled — careRecordsAnonymized=${careRecordsAnonymized} (cutoff ${cutoffCareRecord ?? 'n/a'}), auditLogsDeleted=${auditLogsDeleted} (cutoff ${cutoffAudit ?? 'n/a'})`);
    return { enabled: true, careRecordsAnonymized, auditLogsDeleted, cutoffCareRecord, cutoffAudit };
  }
}

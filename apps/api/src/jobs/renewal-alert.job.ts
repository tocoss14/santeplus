import { Injectable } from '@nestjs/common';
import * as cron from 'node-cron';
import { PrismaService } from '../common/prisma.module';
import { NotificationDispatchService } from '../common/notifications/dispatch.service';

/**
 * Resolve medication class for grouping.
 * - If medication has a dci, use its first word (split on whitespace, '/', ',')
 * - Otherwise fallback to Act.categoryId or PrescriptionLine.categoryId
 * - Upper-cased for stable grouping, but keep original display?
 */
export function resolveMedicationClass(
  medication: { dci?: string | null } | null | undefined,
  fallbackCategoryId?: string | null,
): string {
  if (medication?.dci && medication.dci.trim().length > 0) {
    const first = medication.dci.trim().split(/[\s\/,]+/)[0];
    if (first) return first.toUpperCase();
  }
  if (fallbackCategoryId && fallbackCategoryId.trim().length > 0) {
    return fallbackCategoryId.trim().toUpperCase();
  }
  return 'UNKNOWN';
}

@Injectable()
export class RenewalAlertJob {
  constructor(
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
  ) {}

  /** Schedule daily at 02:30 */
  schedule() {
    cron.schedule('30 2 * * *', () => void this.checkRenewalAlerts().catch((e) => console.error('[renewal-alert] cron error', e)));
  }

  async getThreshold(): Promise<number> {
    try {
      const row = await this.prisma.systemConfig.findUnique({ where: { key: 'renewalAlertThreshold' } });
      if (!row) return 4;
      const parsed = JSON.parse(row.value);
      const n = Number(parsed);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
      return 4;
    } catch {
      return 4;
    }
  }

  /**
   * Daily check: groups by patient + medication class, counts deliveries in last 90 days.
   * If count > threshold -> Notification to managers (RENEWAL_ALERT) + AuditLog.
   */
  async checkRenewalAlerts(now = new Date()): Promise<Array<{ patientId: string; medicationClass: string; count: number }>> {
    const threshold = await this.getThreshold();
    const since = new Date(now.getTime() - 90 * 86400000);

    // Fetch deliveries in last 90 days with lines + medication
    // We query delivery with lines including medication relation
    const deliveries: any[] = await (this.prisma as any).delivery.findMany({
      where: { createdAt: { gte: since } },
      include: {
        lines: { include: { medication: { select: { dci: true } } } },
        patientUser: { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
      },
    });

    // Group by patientId + medicationClass
    const groups = new Map<string, { patientId: string; patientLabel: string; medicationClass: string; count: number }>();

    for (const del of deliveries) {
      const patientId = del.patientUserId ?? del.patientUser?.id;
      if (!patientId) continue;
      const patientLabel =
        del.patientUser?.memberNumber ??
        (del.patientUser ? `${del.patientUser.firstName ?? ''} ${del.patientUser.lastName ?? ''}`.trim() : patientId);
      const lines: any[] = del.lines ?? [];
      // If delivery has no lines (should not happen), skip
      for (const line of lines) {
        const medication = line.medication ?? null;
        // fallbackCategoryId: line.categoryId or act?.categoryId; we use line.categoryId primarily
        const fallback = line.categoryId ?? null;
        const cls = resolveMedicationClass(medication, fallback);
        const key = `${patientId}|${cls}`;
        const existing = groups.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          groups.set(key, { patientId, patientLabel, medicationClass: cls, count: 1 });
        }
      }
      // Edge: delivery with zero lines but should still not contribute; ignore
    }

    const alerts: Array<{ patientId: string; medicationClass: string; count: number }> = [];

    // Find managers to notify
    const managers: any[] = await (this.prisma as any).user.findMany({
      where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' },
      select: { id: true },
    });
    const managerIds = managers.map((m: any) => m.id);

    for (const group of groups.values()) {
      if (group.count > threshold) {
        alerts.push({ patientId: group.patientId, medicationClass: group.medicationClass, count: group.count });
        const title = `Renouvellements répétés — ${group.patientLabel} ${group.medicationClass}`;
        const body = `Patient ${group.patientLabel} — ${group.count} renouvellements de la classe ${group.medicationClass} sur les 90 derniers jours (seuil ${threshold}). Vérification recommandée.`;

        if (managerIds.length) {
          await this.dispatch.dispatchToMany(managerIds, {
            topic: 'RENEWAL_ALERT',
            title,
            body,
          });
        }

        // AuditLog per alert group
        try {
          await (this.prisma as any).auditLog.create({
            data: {
              action: 'RENEWAL_ALERT',
              entityType: 'patient',
              entityId: group.patientId,
              status: 'OK',
              meta: JSON.stringify({
                patientId: group.patientId,
                medicationClass: group.medicationClass,
                count: group.count,
                threshold,
                since: since.toISOString(),
              }),
            },
          });
        } catch {
          // ignore audit failures
        }
      }
    }

    return alerts;
  }
}

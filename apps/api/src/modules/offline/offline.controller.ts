import { BadRequestException, Body, Controller, Module, Post } from '@nestjs/common';
import { createHash } from 'crypto';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { ClaimsModule, ClaimsService } from '../claims/claims.controller';
import { CareService } from '../care/care.service';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';
import { resolveThreshold, needsPriorAuthorization } from '../../domain/engine';
import { ref } from '../../common/utils';

const syncSchema = z.object({
  items: z.array(z.object({
    id: z.string().optional(),
    payload: z.any(),
    hash: z.string().min(8),
    timestamp: z.number().optional(),
    sessionKey: z.string().min(1),
  })).min(1).max(50),
});

function computeHash(payload: any, sessionKey: string): string {
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return createHash('sha256').update(payloadStr + sessionKey).digest('hex');
}

@Controller('offline')
export class OfflineController {
  constructor(
    private prisma: PrismaService,
    private claims: ClaimsService,
    private care: CareService,
    private dispatch: NotificationDispatchService,
  ) {}

  @Post('sync')
  @RequirePermissions('provider.thirdparty')
  async sync(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodPipe(syncSchema)) body: any,
  ) {
    const { establishment } = await this.care.requireEstablishment(auth);
    const results: any[] = [];
    const conflicts: Array<{ id: string; reason: string; status: string }> = [];
    const succeededIds: string[] = [];
    let synced = 0;

    for (const item of body.items as Array<{ id?: string; payload: any; hash: string; timestamp?: number; sessionKey: string }>) {
      const itemId = item.id ?? `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      // 1) Hash validation
      const expected = computeHash(item.payload, item.sessionKey);
      if (expected !== item.hash) {
        conflicts.push({ id: itemId, reason: 'Hash invalide — données altérées', status: 'CONFLICT' });
        // alert managers — hash tampering
        await this.alertManagers(`Alerte intégrité — délivrance hors-ligne`, `Hash invalide pour l'item ${itemId} (prestataire ${establishment.name}) — possible altération.`);
        continue;
      }

      // 2) Validate payload structure
      let dto: any;
      try {
        dto = z.object({
          prescriptionNumber: z.string().min(3).optional(),
          qrToken: z.string().min(8).max(64).optional(),
          prescriptionId: z.string().optional(),
          lines: z.array(z.object({
            lineId: z.string(),
            quantity: z.number().int().min(1).max(30),
            unitPrice: z.number().int().min(1).optional(),
            substitutionNote: z.string().max(300).optional(),
          })).min(1).max(20),
          note: z.string().max(500).optional(),
        }).refine(v => Boolean(v.prescriptionNumber || v.qrToken || v.prescriptionId), 'Prescription requise')
          .parse(item.payload);
      } catch (e: any) {
        if (e instanceof z.ZodError) {
          conflicts.push({ id: itemId, reason: e.issues[0]?.message ?? 'Payload invalide', status: 'CONFLICT' });
        } else {
          conflicts.push({ id: itemId, reason: 'Payload invalide', status: 'CONFLICT' });
        }
        continue;
      }

      // 3) Load prescription
      const presWhere: any = dto.prescriptionId ? { id: dto.prescriptionId }
        : dto.qrToken ? { qrToken: dto.qrToken }
        : { number: dto.prescriptionNumber };
      const pres = await this.prisma.prescription.findFirst({
        where: presWhere,
        include: { lines: true, patientUser: { select: { id: true } }, deliveries: true },
      });
      if (!pres) {
        conflicts.push({ id: itemId, reason: 'Ordonnance introuvable', status: 'CONFLICT' });
        await this.alertManagers(`Conflit synchronisation — ordonnance introuvable`, `Item ${itemId} : ordonnance ${dto.prescriptionNumber ?? dto.qrToken ?? dto.prescriptionId} introuvable.`);
        continue;
      }
      if (pres.status === 'CANCELLED') {
        conflicts.push({ id: itemId, reason: 'Ordonnance annulée', status: 'CONFLICT' });
        await this.alertManagers(`Conflit synchronisation — ordonnance annulée`, `Item ${itemId} : ordonnance ${pres.number} annulée.`);
        continue;
      }
      if (new Date(pres.validUntil) < new Date()) {
        conflicts.push({ id: itemId, reason: `Ordonnance expirée (valide jusqu'au ${new Date(pres.validUntil).toLocaleDateString('fr-FR')})`, status: 'CONFLICT' });
        await this.alertManagers(`Conflit synchronisation — ordonnance expirée`, `Item ${itemId} : ordonnance ${pres.number} expirée.`);
        continue;
      }

      // 4) Double délivrance check (check PrescriptionLine deliveredQty vs quantity)
      let hasConflict = false;
      for (const req of dto.lines) {
        const line = pres.lines.find(l => l.id === req.lineId);
        if (!line) {
          conflicts.push({ id: itemId, reason: `Ligne ${req.lineId} inconnue dans cette ordonnance`, status: 'CONFLICT' });
          hasConflict = true;
          break;
        }
        const remaining = line.quantity - line.deliveredQty;
        if (remaining <= 0) {
          conflicts.push({ id: itemId, reason: 'Quantité déjà délivrée', status: 'CONFLICT' });
          hasConflict = true;
          break;
        }
        if (req.quantity > remaining) {
          conflicts.push({ id: itemId, reason: 'Quantité déjà délivrée', status: 'CONFLICT' });
          // also include detail
          conflicts[conflicts.length - 1].reason = `Quantité demandée (${req.quantity}) dépasse le reste disponible (${remaining}) pour ${line.name} — Quantité déjà délivrée`;
          hasConflict = true;
          break;
        }
      }
      if (hasConflict) {
        await this.alertManagers(
          `Conflit synchronisation — double délivrance détectée`,
          `Prestataire ${establishment.name} — ordonnance ${pres.number} — quantité déjà délivrée (item ${itemId}). Intervention requise.`,
        );
        // also audit
        await this.prisma.auditLog.create({
          data: {
            userId: auth.id,
            action: 'OFFLINE_SYNC_CONFLICT',
            entityType: 'prescription',
            entityId: pres.id,
            meta: JSON.stringify({ itemId, reason: conflicts[conflicts.length - 1].reason }),
          },
        });
        continue;
      }

      // 5) Otherwise create delivery — reuse same logic as CareController.createDelivery but per item
      try {
        const patient = await this.prisma.user.findUnique({ where: { id: pres.patientUserId } });
        if (!patient) {
          conflicts.push({ id: itemId, reason: 'Patient introuvable', status: 'CONFLICT' });
          continue;
        }
        const patientContract = await this.prisma.contract.findFirst({
          where: { principalUserId: patient.id, status: { in: ['ACTIVE', 'SUSPENDED'] } },
          include: { product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true } } },
          orderBy: { createdAt: 'desc' },
        });
        if (!patientContract || patientContract.status !== 'ACTIVE') {
          conflicts.push({ id: itemId, reason: 'Contrat du patient inactif — délivrance impossible', status: 'CONFLICT' });
          continue;
        }

        const deliveredLines = dto.lines.map((req: any) => {
          const line = pres.lines.find(l => l.id === req.lineId)!;
          const unitPrice = req.unitPrice ?? line.unitPrice;
          return { line, quantity: req.quantity, unitPrice, amount: req.quantity * unitPrice, substitutionNote: req.substitutionNote };
        });
        const totalRequested = deliveredLines.reduce((a: number, d: any) => a + d.amount, 0);
        const itemsForEstimation = deliveredLines.map((d: any) => ({ categoryId: d.line.categoryId, amountRequested: d.amount }));
        const estimation = await this.claims.buildEstimation(patientContract as any, new Date(), itemsForEstimation);
        const productThreshold: number | null =
          (await this.prisma.product.findUnique({ where: { id: (patientContract as any).productId }, select: { thirdPartyAuthThreshold: true } }))?.thirdPartyAuthThreshold ?? null;
        const thresholds: number[] = [];
        for (const dl of deliveredLines) {
          let actThreshold: number | null = null;
          if (dl.line.actId) {
            const act = await this.prisma.act.findUnique({ where: { id: dl.line.actId }, select: { authThreshold: true } });
            actThreshold = act?.authThreshold ?? null;
          }
          thresholds.push(resolveThreshold(productThreshold, actThreshold));
        }
        let needsAuth = false;
        if (estimation.items.length === thresholds.length) {
          needsAuth = estimation.items.some((e, idx) => needsPriorAuthorization(e.amountApproved, thresholds[idx]));
        }
        if (!needsAuth && thresholds.length) {
          const mostRestrictive = Math.min(...thresholds);
          needsAuth = needsPriorAuthorization(estimation.totals.approved, mostRestrictive);
        }
        const status = needsAuth ? 'AUTH_REQUIRED' : 'CONFIRMED';

        const result = await this.prisma.$transaction(async tx => {
          await tx.prescription.update({
            where: { id: pres.id },
            data: {
              status: deliveredLines.reduce((a: number, d: any) => a + d.quantity, 0) + pres.lines.reduce((a: number, l: any) => a + (l.deliveredQty ?? 0), 0) >= pres.lines.reduce((a: number, l: any) => a + l.quantity, 0)
                ? 'EXECUTED' : 'PARTIALLY_EXECUTED',
            },
          });
          for (const dl of deliveredLines) {
            await tx.prescriptionLine.update({
              where: { id: dl.line.id },
              data: { deliveredQty: dl.line.deliveredQty + dl.quantity },
            });
          }
          const del = await tx.delivery.create({
            data: {
              reference: ref('DEL'),
              prescriptionId: pres.id,
              providerId: establishment.id,
              userId: auth.id,
              patientUserId: patient.id,
              totalAmount: totalRequested,
              coveredAmount: estimation.totals.approved,
              patientAmount: estimation.totals.outOfPocket,
              lines: {
                create: deliveredLines.map((d: any) => ({
                  lineId: d.line.id, medicationId: d.line.medicationId ?? null,
                  code: d.line.code, name: d.line.name, categoryId: d.line.categoryId,
                  quantity: d.quantity, unitPrice: d.unitPrice, amount: d.amount, substitutionNote: d.substitutionNote ?? null,
                })),
              },
            },
            include: { lines: true },
          });
          const claim = await tx.claim.create({
            data: {
              reference: ref('TPE'),
              kind: 'THIRDPARTY',
              contractId: patientContract.id,
              claimantUserId: patient.id,
              providerId: establishment.id,
              providerUserId: auth.id,
              careDate: new Date(),
              status,
              totalRequested: estimation.totals.requested,
              totalApproved: estimation.totals.approved,
              estimation: JSON.stringify(estimation),
              flags: JSON.stringify(estimation.flags),
              prescriptionId: pres.id,
              deliveryId: del.id,
              items: {
                create: estimation.items.map((e, idx) => ({
                  actId: deliveredLines[idx]?.line.actId ?? null,
                  code: deliveredLines[idx]?.line.code ?? null,
                  label: deliveredLines[idx]?.line.name ?? null,
                  categoryLabel: e.categoryId, quantity: deliveredLines[idx]?.quantity ?? 1,
                  unitPrice: deliveredLines[idx]?.unitPrice ?? null,
                  amountRequested: e.amountRequested, amountEligible: e.amountEligible,
                  rateApplied: e.rateApplied ?? 0, deductibleApplied: e.deductibleApplied ?? 0, amountApproved: e.amountApproved,
                })),
              },
            },
          });
          await tx.delivery.update({ where: { id: del.id }, data: { claimId: claim.id } });
          return { del, claim };
        });

        synced++;
        succeededIds.push(itemId);
        results.push({ id: itemId, status, deliveryId: result.del.id, reference: result.del.reference });

        // care record + notifications (best effort)
        try {
          const dossierId = await this.care.ensureCareRecord(patient.id ?? pres.patientUserId, {
            beneficiaryId: pres.beneficiaryId ?? null,
            providerId: establishment.id,
            prescriptionId: pres.id,
            deliveryId: result.del.id,
            claimId: result.claim.id,
          });
          await this.care.addEvent(dossierId, {
            type: 'DELIVERY_CREATED',
            title: `Délivrance ${result.del.reference} — ${result.del.lines.length} produit(s) (sync hors-ligne)`,
            detail: `Couvert ${estimation.totals.approved} FCFA — à charge ${estimation.totals.outOfPocket} FCFA`,
            actorUserId: auth.id, actorRole: auth.role,
          });
        } catch { /* ignore */ }
      } catch (e: any) {
        conflicts.push({ id: itemId, reason: e?.message ?? 'Erreur interne lors de la synchronisation', status: 'CONFLICT' });
        continue;
      }
    }

    return { synced, conflicts, succeededIds, results };
  }

  private async alertManagers(title: string, body: string) {
    try {
      const managers = await this.prisma.user.findMany({
        where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' },
        select: { id: true },
      });
      if (managers.length) {
        await this.dispatch.dispatchToMany(managers.map(m => m.id), { topic: 'OFFLINE_SYNC_CONFLICT', title, body });
      }
    } catch { /* ignore */ }
  }
}

@Module({
  controllers: [OfflineController],
  providers: [CareService],
  imports: [ClaimsModule],
})
export class OfflineModule {}

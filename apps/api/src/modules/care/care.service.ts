import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { ref } from '../../common/utils';

@Injectable()
export class CareService {
  constructor(private prisma: PrismaService) {}

  async requireEstablishment(auth: { id: string; providerId?: string | null }) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.id }, include: { providerStaff: true } });
    if (!user?.providerId || !user.providerStaff) throw new BadRequestException('Aucun établissement rattaché à ce compte');
    return { user, establishment: user.providerStaff };
  }

  async ensureCareRecord(patientUserId: string, opts: {
    beneficiaryId?: string | null;
    providerId?: string | null;
    consultationId?: string | null;
    prescriptionId?: string | null;
    deliveryId?: string | null;
    claimId?: string | null;
  }): Promise<string> {
    const existing = await this.prisma.careRecord.findFirst({
      where: {
        patientUserId,
        ...(opts.consultationId ? { consultationId: opts.consultationId } : {}),
        ...(opts.prescriptionId ? { prescriptionId: opts.prescriptionId } : {}),
      },
    });
    if (existing) {
      const data: any = {};
      if (opts.beneficiaryId && !existing.beneficiaryId) data.beneficiaryId = opts.beneficiaryId;
      if (opts.deliveryId && !existing.deliveryId) data.deliveryId = opts.deliveryId;
      if (opts.claimId && !existing.claimId) data.claimId = opts.claimId;
      if (opts.prescriptionId && !existing.prescriptionId) data.prescriptionId = opts.prescriptionId;
      if (Object.keys(data).length) {
        await this.prisma.careRecord.update({ where: { id: existing.id }, data });
      }
      return existing.id;
    }

    const linked = opts.consultationId
      ? await this.prisma.careRecord.findFirst({ where: { consultationId: opts.consultationId } })
      : opts.prescriptionId
        ? await this.prisma.careRecord.findFirst({ where: { prescriptionId: opts.prescriptionId } })
        : null;
    if (linked) {
      const data: any = {};
      if (opts.deliveryId && !linked.deliveryId) data.deliveryId = opts.deliveryId;
      if (opts.claimId && !linked.claimId) data.claimId = opts.claimId;
      if (opts.prescriptionId && !linked.prescriptionId) data.prescriptionId = opts.prescriptionId;
      if (Object.keys(data).length) {
        await this.prisma.careRecord.update({ where: { id: linked.id }, data });
      }
      return linked.id;
    }

    const record = await this.prisma.careRecord.create({
      data: {
        reference: ref('DOS'),
        patientUserId,
        beneficiaryId: opts.beneficiaryId ?? null,
        providerId: opts.providerId ?? null,
        consultationId: opts.consultationId ?? null,
        prescriptionId: opts.prescriptionId ?? null,
        deliveryId: opts.deliveryId ?? null,
        claimId: opts.claimId ?? null,
      },
    });
    return record.id;
  }

  async addEvent(careRecordId: string, event: { type: string; title: string; detail?: string; actorUserId?: string; actorRole?: string }) {
    await this.prisma.careRecordEvent.create({
      data: {
        careRecordId,
        type: event.type,
        title: event.title,
        detail: event.detail,
        actorUserId: event.actorUserId,
        actorRole: event.actorRole,
      },
    });
    await this.prisma.careRecord.update({ where: { id: careRecordId }, data: { updatedAt: new Date() } });
  }

  async updateStatus(careRecordId: string, status: string) {
    await this.prisma.careRecord.update({ where: { id: careRecordId }, data: { status } });
  }
}

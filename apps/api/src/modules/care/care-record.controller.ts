import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../common/prisma.module';
import { canAccessMedical, decryptField, MEDICAL_MASKED } from '../../common/crypto';

@Controller('care-records')
export class CareRecordController {
  constructor(private prisma: PrismaService) {}

  private dossierInclude() {
    return {
      patientUser: { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
      beneficiary: { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
      provider: { select: { id: true, name: true, type: true, city: true } },
      consultation: { include: { provider: { select: { name: true } } } },
      prescription: { include: { lines: true, prescriberUser: { select: { firstName: true, lastName: true } } } },
      delivery: { include: { lines: true, provider: { select: { name: true } } } },
      claim: { include: { items: true, provider: { select: { name: true } } } },
      events: { orderBy: { createdAt: 'asc' as const } },
    };
  }

  @Get('mine')
  async mine(@CurrentUser() auth: AuthUser) {
    let records: any[];
    if (auth.role !== 'MEMBER' && auth.role !== 'SUPER_ADMIN') {
      const where: any = { patientUserId: auth.id };
      records = await this.prisma.careRecord.findMany({ where, include: this.dossierInclude(), orderBy: { createdAt: 'desc' }, take: 100 });
    } else {
      records = await this.prisma.careRecord.findMany({
        where: { patientUserId: auth.id },
        include: this.dossierInclude(),
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    }
    return records.map((r: any) => this.applyMedicalGate(auth, r));
  }

  @Get('provider/care-records')
  async providerRecords(@CurrentUser() auth: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.id } });
    if (!user?.providerId) throw new NotFoundException('Établissement non rattaché');
    const records = await this.prisma.careRecord.findMany({
      where: {
        OR: [
          { providerId: user.providerId },
          { prescription: { is: { providerId: user.providerId } } },
          { delivery: { is: { providerId: user.providerId } } },
        ],
      },
      include: this.dossierInclude(),
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return records.map((r: any) => this.applyMedicalGate(auth, r));
  }

  @Get(':id')
  async detail(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const dossier = await this.prisma.careRecord.findUnique({ where: { id }, include: this.dossierInclude() });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    this.assertVisible(auth, dossier);
    const gated = this.applyMedicalGate(auth, dossier);
    return this.filterDetailByRole(auth, gated);
  }

  @Get(':id/timeline')
  async timeline(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const dossier = await this.prisma.careRecord.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: 'asc' } }, consultation: true, prescription: true, delivery: true, claim: true },
    });
    if (!dossier) throw new NotFoundException();
    this.assertVisible(auth, dossier);
    const filtered = this.filterEventsByRole(auth, dossier.events);
    const gatedEvents = this.applyMedicalGateToEvents(auth, dossier, filtered);
    return { careRecordId: id, events: gatedEvents, dossier: { status: dossier.status, reference: dossier.reference } };
  }

  private assertVisible(auth: AuthUser, dossier: any) {
    if (['SUPER_ADMIN', 'INSURANCE_MANAGER', 'SUPPORT_AGENT'].includes(auth.role)) return;
    if (dossier.patientUserId === auth.id) return;
    if (auth.providerId && (dossier.providerId === auth.providerId
      || dossier.prescription?.providerId === auth.providerId
      || dossier.delivery?.providerId === auth.providerId)) return;
    if (auth.companyId) {
      // Autorisé mais contenu médical sera masqué par applyMedicalGate
      return;
    }
    throw new NotFoundException('Dossier introuvable');
  }

  private applyMedicalGate(auth: AuthUser, dossier: any): any {
    const providerId = dossier.providerId || dossier.prescription?.providerId || dossier.delivery?.providerId || null;
    const can = canAccessMedical(auth, dossier.patientUserId, providerId);
    if (dossier.consultation) {
      if (can) {
        if (dossier.consultation.motifEnc) {
          const dec = decryptField(dossier.consultation.motifEnc);
          if (dec !== null) dossier.consultation.motif = dec;
        }
        if (dossier.consultation.diagnosticEnc) {
          const dec = decryptField(dossier.consultation.diagnosticEnc);
          if (dec !== null) dossier.consultation.diagnostic = dec;
        }
      } else {
        dossier.consultation.motif = MEDICAL_MASKED;
        // mask diagnostic regardless of existence to avoid leaking presence
        dossier.consultation.diagnostic = MEDICAL_MASKED;
      }
      if ('motifEnc' in dossier.consultation) delete dossier.consultation.motifEnc;
      if ('diagnosticEnc' in dossier.consultation) delete dossier.consultation.diagnosticEnc;
    }
    if (dossier.prescription) {
      if (can) {
        if (dossier.prescription.noteEnc) {
          const dec = decryptField(dossier.prescription.noteEnc);
          if (dec !== null) dossier.prescription.note = dec;
        }
      } else {
        if (dossier.prescription.note != null || dossier.prescription.noteEnc != null) {
          dossier.prescription.note = MEDICAL_MASKED;
        }
      }
      if ('noteEnc' in dossier.prescription) delete dossier.prescription.noteEnc;
    }
    return dossier;
  }

  private applyMedicalGateToEvents(auth: AuthUser, dossier: any, events: any[]): any[] {
    const providerId = dossier.providerId || dossier.prescription?.providerId || dossier.delivery?.providerId || null;
    const can = canAccessMedical(auth, dossier.patientUserId, providerId);
    if (can) return events;
    // mask detail for unauthorized
    return events.map((e: any) => ({ ...e, detail: e.detail ? MEDICAL_MASKED : e.detail }));
  }

  private filterDetailByRole(auth: AuthUser, dossier: any) {
    if (auth.companyId && !['SUPER_ADMIN', 'INSURANCE_MANAGER'].includes(auth.role)) {
      const { events, claim, delivery, ...rest } = dossier;
      return { ...rest, _masked: 'Détail médical masqué pour ce rôle' };
    }
    return dossier;
  }

  private filterEventsByRole(auth: AuthUser, events: any[]) {
    if (auth.companyId && !['SUPER_ADMIN', 'INSURANCE_MANAGER'].includes(auth.role)) {
      return events.filter(e => !['DELIVERY_CREATED', 'CLAIM_CREATED'].includes(e.type))
        .map(e => ({ ...e, detail: undefined }));
    }
    return events;
  }
}

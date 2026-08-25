import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../common/prisma.module';

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
    if (auth.role !== 'MEMBER' && auth.role !== 'SUPER_ADMIN') {
      const where: any = { patientUserId: auth.id };
      return this.prisma.careRecord.findMany({ where, include: this.dossierInclude(), orderBy: { createdAt: 'desc' }, take: 100 });
    }
    return this.prisma.careRecord.findMany({
      where: { patientUserId: auth.id },
      include: this.dossierInclude(),
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Get('provider/care-records')
  async providerRecords(@CurrentUser() auth: AuthUser) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.id } });
    if (!user?.providerId) throw new NotFoundException('Établissement non rattaché');
    return this.prisma.careRecord.findMany({
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
  }

  @Get(':id')
  async detail(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const dossier = await this.prisma.careRecord.findUnique({ where: { id }, include: this.dossierInclude() });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    this.assertVisible(auth, dossier);
    return this.filterDetailByRole(auth, dossier);
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
    return { careRecordId: id, events: filtered, dossier: { status: dossier.status, reference: dossier.reference } };
  }

  private assertVisible(auth: AuthUser, dossier: any) {
    if (['SUPER_ADMIN', 'INSURANCE_MANAGER', 'SUPPORT_AGENT'].includes(auth.role)) return;
    if (dossier.patientUserId === auth.id) return;
    if (auth.providerId && (dossier.providerId === auth.providerId
      || dossier.prescription?.providerId === auth.providerId
      || dossier.delivery?.providerId === auth.providerId)) return;
    if (auth.companyId) {
      throw new NotFoundException('Accès restreint aux données administratives — le détail médical est masqué pour ce rôle.');
    }
    throw new NotFoundException('Dossier introuvable');
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

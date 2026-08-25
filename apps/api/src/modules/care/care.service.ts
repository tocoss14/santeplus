import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { ref, secureToken } from '../../common/utils';

@Injectable()
export class CareService {
  constructor(private prisma: PrismaService) {}

  async requireEstablishment(auth: { id: string; providerId?: string | null }) {
    const user = await this.prisma.user.findUnique({ where: { id: auth.id }, include: { providerStaff: true } });
    if (!user?.providerId || !user.providerStaff) throw new ForbiddenException('Aucun établissement rattaché à ce compte');
    return { user, establishment: user.providerStaff };
  }

  async patientContract(patientUserId: string, beneficiaryId?: string | null) {
    const user = await this.prisma.user.findUnique({ where: { id: patientUserId } });
    if (!user) throw new NotFoundException('Patient introuvable');
    const contract = await this.prisma.contract.findFirst({
      where: { principalUserId: patientUserId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
      include: { product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (beneficiaryId) {
      const ben = await this.prisma.beneficiary.findFirst({ where: { id: beneficiaryId, status: 'COVERED' } });
      if (!ben) throw new BadRequestException('Bénéficiaire non couvert');
      return { contract, beneficiary: ben };
    }
    return { contract, beneficiary: null };
  }
}

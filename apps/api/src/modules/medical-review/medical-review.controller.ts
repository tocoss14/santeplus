import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { RequirePermissions } from '../../common/guards/permissions.guard';

@Injectable()
export class MedicalReviewService {
  constructor(private prisma: PrismaService) {}

  async queue() {
    const claims = await this.prisma.claim.findMany({
      where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] }, totalRequested: { gte: 500000 } },
      include: { claimantUser: { select: { firstName: true, lastName: true, memberNumber: true } }, contract: { select: { number: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return claims.map(c => ({
      id: c.id,
      reference: c.reference,
      claimant: `${c.claimantUser.firstName} ${c.claimantUser.lastName}`,
      memberNumber: c.claimantUser.memberNumber,
      contractNumber: c.contract.number,
      totalRequested: c.totalRequested,
      totalApproved: c.totalApproved,
      status: c.status,
      createdAt: c.createdAt,
    }));
  }
}

@Controller('admin/medical-review')
export class MedicalReviewController {
  constructor(private svc: MedicalReviewService) {}

  @Get('queue')
  @RequirePermissions('contracts.viewAll')
  queue() {
    return this.svc.queue();
  }
}

@Module({ controllers: [MedicalReviewController], providers: [MedicalReviewService] })
export class MedicalReviewModule {}

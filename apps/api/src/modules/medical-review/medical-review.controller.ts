import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { assertClaimTransition } from '../../domain/claim-machine';

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

  async review(id: string, action: 'APPROVE' | 'REJECT' | 'REQUEST_INFO', note?: string, actorId?: string | null) {
    const claim = await this.prisma.claim.findUnique({ where: { id } });
    if (!claim) throw new Error('Sinistre introuvable');
    const map: Record<string, string> = { APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_INFO: 'INFO_REQUESTED' };
    const target = map[action];
    const transition = action === 'APPROVE' ? 'APPROVE' : action === 'REJECT' ? 'REJECT' : 'REQUEST_INFO';
    assertClaimTransition(claim.status, transition as any);
    const updated = await this.prisma.claim.update({ where: { id }, data: { status: target } });
    await this.prisma.auditLog.create({
      data: { userId: actorId ?? null, action: `MEDICAL_REVIEW_${action}`, entityType: 'claim', entityId: id, meta: JSON.stringify({ note: note ?? null, from: claim.status, to: target }) },
    });
    return updated;
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

  @Post('claims/:id/validate')
  @RequirePermissions('contracts.viewAll')
  async validate(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() body: any) {
    try {
      return await this.svc.review(id, 'APPROVE', body?.note, auth.id);
    } catch (e: any) {
      throw new BadRequestException(e?.message ?? 'Transition impossible');
    }
  }

  @Post('claims/:id/reject')
  @RequirePermissions('contracts.viewAll')
  async reject(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() body: any) {
    try {
      return await this.svc.review(id, 'REJECT', body?.note, auth.id);
    } catch (e: any) {
      throw new BadRequestException(e?.message ?? 'Transition impossible');
    }
  }

  @Post('claims/:id/request-info')
  @RequirePermissions('contracts.viewAll')
  async requestInfo(@CurrentUser() auth: AuthUser, @Param('id') id: string, @Body() body: any) {
    try {
      return await this.svc.review(id, 'REQUEST_INFO', body?.note, auth.id);
    } catch (e: any) {
      throw new BadRequestException(e?.message ?? 'Transition impossible');
    }
  }
}

@Module({ controllers: [MedicalReviewController], providers: [MedicalReviewService] })
export class MedicalReviewModule {}

import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { RequirePermissions } from '../../common/guards/permissions.guard';

@Injectable()
export class ImpayesService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const now = new Date();
    const overdue = await this.prisma.contribution.findMany({
      where: { status: 'PENDING', dueDate: { lt: now } },
      include: { contract: { include: { principalUser: { select: { firstName: true, lastName: true, memberNumber: true } }, product: { select: { name: true } } } } },
      orderBy: { dueDate: 'asc' },
    });
    return overdue.map(c => ({
      contributionId: c.id,
      contractId: c.contractId,
      contractNumber: c.contract.number,
      adherent: `${c.contract.principalUser.firstName} ${c.contract.principalUser.lastName}`,
      memberNumber: c.contract.principalUser.memberNumber,
      product: c.contract.product.name,
      amount: c.amount,
      dueDate: c.dueDate,
      daysOverdue: Math.floor((now.getTime() - new Date(c.dueDate).getTime()) / 86400000),
    }));
  }
}

@Controller('admin/impayes')
export class ImpayesController {
  constructor(private svc: ImpayesService) {}

  @Get()
  @RequirePermissions('contracts.viewAll')
  list() {
    return this.svc.list();
  }
}

@Module({ controllers: [ImpayesController], providers: [ImpayesService] })
export class ImpayesModule {}

import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { RequirePermissions } from '../../common/guards/permissions.guard';

@Injectable()
export class BiService {
  constructor(private prisma: PrismaService) {}

  async indicators() {
    const activeContracts = await this.prisma.contract.count({ where: { status: 'ACTIVE' } });

    const byProduct = await this.prisma.contract.groupBy({
      by: ['productId'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
    });
    const products = await this.prisma.product.findMany({ select: { id: true, name: true, code: true } });
    const mix = byProduct.map(b => {
      const p = products.find(x => x.id === b.productId);
      return { code: p?.code ?? b.productId, label: p?.name ?? 'Inconnu', value: b._count._all };
    });

    const claimsAgg = await this.prisma.claim.aggregate({ _sum: { totalApproved: true } });
    const paymentsAgg = await this.prisma.payment.aggregate({ where: { status: 'SUCCEEDED' }, _sum: { amount: true } });
    const sinistres = claimsAgg._sum.totalApproved ?? 0;
    const primes = paymentsAgg._sum.amount ?? 0;
    const spRatio = primes > 0 ? (sinistres / primes) * 100 : 0;

    const treasury = primes;

    return {
      generatedAt: new Date().toISOString(),
      indicators: [
        { code: 'ADH_ACTIVE', label: 'Adhésions actives', value: activeContracts, unit: 'contrats' },
        { code: 'MIX_FORMULE', label: 'Mix par formule', value: mix, unit: 'contrats' },
        { code: 'SP_RATIO', label: 'Taux de sinistralité S/P', value: Number(spRatio.toFixed(2)), unit: '%' },
        { code: 'TREASURY', label: 'Trésorerie disponible', value: treasury, unit: 'FCFA' },
        { code: 'ATTRITION', label: 'Taux d\'attrition (mensuel)', value: null, unit: '%' },
        { code: 'CAC', label: 'Coût d\'acquisition moyen', value: null, unit: 'FCFA' },
        { code: 'DELAY_CLAIM', label: 'Délai moyen déclaration sinistre', value: null, unit: 'jours' },
        { code: 'SOLVENCY', label: 'Marge de solvabilité', value: null, unit: '%' },
        { code: 'MGMT_RATIO', label: 'Ratio de gestion', value: null, unit: '%' },
        { code: 'SIN_FORMULE', label: 'Sinistralité par formule', value: null, unit: '%' },
      ],
    };
  }
}

@Controller('admin/bi')
export class BiController {
  constructor(private svc: BiService) {}

  @Get('indicators')
  @RequirePermissions('contracts.viewAll')
  indicators() {
    return this.svc.indicators();
  }
}

@Module({ controllers: [BiController], providers: [BiService] })
export class BiModule {}

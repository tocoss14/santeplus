import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { RequirePermissions } from '../../common/guards/permissions.guard';

@Injectable()
export class ComplianceService {
  constructor(private prisma: PrismaService) {}

  async ratios() {
    const claims = await this.prisma.claim.aggregate({ _sum: { totalApproved: true, totalRequested: true } });
    const payments = await this.prisma.payment.aggregate({ where: { status: 'SUCCEEDED' }, _sum: { amount: true } });
    const primes = payments._sum.amount ?? 0;
    const sinistres = claims._sum.totalApproved ?? 0;
    return {
      generatedAt: new Date().toISOString(),
      ratios: [
        { code: 'MARGE_SOLVABILITE', label: 'Marge de solvabilité', value: null, unit: '%', target: '≥ 130 %', status: 'À calculer' },
        { code: 'RATIO_GESTION', label: 'Ratio de gestion', value: null, unit: '%', target: '≤ 18 %', status: 'À calculer' },
        { code: 'FONDS_RESERVE', label: 'Fonds de réserve', value: null, unit: '%', target: '≥ 50 % du capital', status: 'À calculer' },
        { code: 'SP_RATIO', label: 'Taux de sinistralité S/P', value: primes > 0 ? Number(((sinistres / primes) * 100).toFixed(2)) : null, unit: '%', target: '≤ 75 %', status: primes > 0 ? 'Calculé' : 'Sans données' },
      ],
      note: 'Les ratios prudentiels complets (marge, gestion, fonds) nécessitent le module comptable SYSCOHADA et les données actuarielles.',
    };
  }
}

@Controller('admin/compliance')
export class ComplianceController {
  constructor(private svc: ComplianceService) {}

  @Get('ratios')
  @RequirePermissions('contracts.viewAll')
  ratios() {
    return this.svc.ratios();
  }
}

@Module({ controllers: [ComplianceController], providers: [ComplianceService] })
export class ComplianceModule {}

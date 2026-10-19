import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { RequirePermissions } from '../../common/guards/permissions.guard';

@Injectable()
export class ActuarialService {
  constructor(private prisma: PrismaService) {}

  async ibnr() {
    const claims = await this.prisma.claim.count();
    return {
      method: 'chain-ladder (à valider par actuaire)',
      claimsCount: claims,
      ibnrEstimate: null,
      sapEstimate: null,
      series: [],
      note: 'Module actuarial en cours de spécification — nécessite un actuaire consultant pour la validation des méthodes (chain-ladder, Bornhuetter-Ferguson).',
    };
  }
}

@Controller('admin/actuarial')
export class ActuarialController {
  constructor(private svc: ActuarialService) {}

  @Get('ibnr')
  @RequirePermissions('contracts.viewAll')
  ibnr() {
    return this.svc.ibnr();
  }
}

@Module({ controllers: [ActuarialController], providers: [ActuarialService] })
export class ActuarialModule {}

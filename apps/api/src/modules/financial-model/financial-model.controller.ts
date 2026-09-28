import { Body, Controller, Get, Module, Optional, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CommonModule } from '../../common/common.module';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { V2SolvencyAlertJob } from '../../jobs/v2-solvency-alert.job';
import { CtsV2Service } from './cts-v2.service';
import { FinancialModelService } from './financial-model.service';

const justificationSchema = z.object({
  justification: z.string().min(10, 'Une justification (≥ 10 caractères) est requise'),
});

const advanceSchema = z.object({
  contractId: z.string().min(1),
});

/**
 * Administration des modèles financiers (V1_LEGACY / V2_MUTUAL).
 * Toutes les routes mutations exigent `financial-model.admin` : la garde
 * PermissionsGuard vérifie la clé (ou le wildcard) du rôle, SUPER_ADMIN bypass.
 */
@Controller('admin/financial-models')
export class FinancialModelController {
  constructor(
    private models: FinancialModelService,
    private ctsV2: CtsV2Service,
    @Optional() private solvencyJob?: V2SolvencyAlertJob,
  ) {}

  @Get()
  @RequirePermissions('financial-model.admin')
  list() {
    return this.models.listVersions();
  }

  @Get('contracts/:id/model')
  @RequirePermissions('contracts.viewAll')
  contractModel(@Param('id') id: string) {
    return this.models.contractModel(id);
  }

  @Get('migrations')
  @RequirePermissions('financial-model.admin')
  migrations(@Query('contractId') contractId?: string) {
    return this.models.listMigrations(contractId);
  }

  @Post('versions/:id/activate')
  @RequirePermissions('financial-model.admin')
  activate(
    @Param('id') id: string,
    @Body(new ZodPipe(justificationSchema)) dto: any,
    @CurrentUser() auth: AuthUser,
  ) {
    return this.models.activateVersion(id, auth, dto.justification);
  }

  @Post('versions/:id/archive')
  @RequirePermissions('financial-model.admin')
  archive(
    @Param('id') id: string,
    @Body(new ZodPipe(justificationSchema)) dto: any,
    @CurrentUser() auth: AuthUser,
  ) {
    return this.models.archiveVersion(id, auth, dto.justification);
  }

  @Post('versions/:id/reactivate')
  @RequirePermissions('financial-model.admin')
  reactivate(
    @Param('id') id: string,
    @Body(new ZodPipe(justificationSchema)) dto: any,
    @CurrentUser() auth: AuthUser,
  ) {
    return this.models.reactivateVersion(id, auth, dto.justification);
  }

  /** Avance le workflow de migration du contrat d'une phase (7 phases au total). */
  @Post('migrations/advance')
  @RequirePermissions('financial-model.admin')
  advance(
    @Body(new ZodPipe(advanceSchema)) dto: any,
    @CurrentUser() auth: AuthUser,
  ) {
    return this.models.advanceMigration(dto.contractId, auth);
  }

  /** Position technique V2 d'un contrat (moteur déterminé par le modèle du contrat). */
  @Get('contracts/:id/position-v2')
  @RequirePermissions('cts.view')
  positionV2(@Param('id') id: string) {
    return this.ctsV2.contractPosition(id);
  }

  /**
   * Position technique consolidée du portefeuille V2 — strictement V2 :
   * aucune consolidation avec le portefeuille V1 (règles interdites sans
   * référentiel explicite). `from`/`to` (ISO, inclusifs) bornent la période
   * des cotisations et sinistres ET la date de création des contrats.
   */
  @Get('position-v2')
  @RequirePermissions('cts.view')
  portfolioPositionV2(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parse = (s?: string) => (s ? new Date(s.length === 10 ? s + 'T00:00:00.000Z' : s) : undefined);
    const toParsed = parse(to);
    const toInclusive = toParsed && to?.length === 10 ? new Date(toParsed.getTime() + 86_399_999) : toParsed;
    return this.ctsV2.portfolioPosition({ from: parse(from), to: toInclusive });
  }

  /**
   * Exécution immédiate du contrôle de solvabilité V2 (le cron hebdomadaire
   * passe par CronService) : même dédup hebdomadaire, même seuil SystemConfig.
   */
  @Post('run-solvency-check')
  @RequirePermissions('financial-model.admin')
  runSolvencyCheck() {
    if (!this.solvencyJob) throw new Error('Job de solvabilité V2 indisponible');
    return this.solvencyJob.run(new Date());
  }
}

@Module({
  controllers: [FinancialModelController],
  // CommonModule fournit NotificationDispatchService au job d'alerte.
  imports: [CommonModule],
  providers: [FinancialModelService, CtsV2Service, V2SolvencyAlertJob],
  exports: [FinancialModelService, CtsV2Service],
})
export class FinancialModelModule {}

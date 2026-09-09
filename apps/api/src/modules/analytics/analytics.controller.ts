import { Controller, Get, Module, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { AnalyticsService } from './analytics.service';

const monthsSchema = z.object({
  months: z.coerce.number().int().min(1).max(60).default(12),
});

@Controller('analytics')
@UseInterceptors(AuditInterceptor)
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Get('kpis')
  @RequirePermissions('stats.admin')
  async getKPIs() {
    return this.analytics.getGlobalKPIs();
  }

  @Get('loss-ratio')
  @RequirePermissions('stats.admin')
  async getLossRatio(@Query(new ZodPipe(monthsSchema)) dto: { months: number }) {
    return this.analytics.getLossRatio(dto.months);
  }

  @Get('technical-reserves')
  @RequirePermissions('stats.admin')
  async getTechnicalReserves() {
    return this.analytics.getTechnicalReserves();
  }

  @Get('product-profitability')
  @RequirePermissions('stats.admin')
  async getProductProfitability() {
    return this.analytics.getProductProfitability();
  }

  @Get('provider-performance')
  @RequirePermissions('stats.admin')
  async getProviderPerformance() {
    return this.analytics.getProviderPerformance();
  }

  @Get('portfolio-evolution')
  @RequirePermissions('stats.admin')
  async getPortfolioEvolution(@Query(new ZodPipe(monthsSchema)) dto: { months: number }) {
    return this.analytics.getPortfolioEvolution(dto.months);
  }
}

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './common/prisma.module';
import { AuditInterceptor } from './common/audit.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.controller';
import { ProductsModule } from './modules/products/products.controller';
import { SubscriptionModule } from './modules/subscription/subscription.controller';
import { ContractsModule } from './modules/contracts/contracts.controller';
import { PaymentsModule } from './modules/payments/payments.controller';
import { ClaimsModule } from './modules/claims/claims.controller';
import { FilesModule } from './modules/files/files.service';
import { ProvidersModule } from './modules/providers/providers.controller';
import { ProviderPortalModule } from './modules/providers/provider-portal.controller';
import { CareModule } from './modules/care/care.controller';
import { CompanyModule } from './modules/company/company.controller';
import { NotificationsHttpModule } from './modules/notifications/notifications.controller';
import { StatsModule } from './modules/stats/stats.controller';
import { AdminMiscModule } from './modules/admin-misc/admin-misc.controller';
import { DocumentsModule } from './modules/documents/documents.controller';
import { OfflineModule } from './modules/offline/offline.controller';
import { CronService } from './jobs/cron.service';
import { RenewalAlertJob } from './jobs/renewal-alert.job';
import { FraudDetectionJob } from './jobs/fraud-detection.job';
import { RetentionJob } from './jobs/retention.job';

@Module({
  imports: [
    CommonModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    SubscriptionModule,
    ContractsModule,
    PaymentsModule,
    ClaimsModule,
    FilesModule,
    ProvidersModule,
    ProviderPortalModule,
    CareModule,
    CompanyModule,
    NotificationsHttpModule,
    StatsModule,
    AdminMiscModule,
    DocumentsModule,
    OfflineModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    RenewalAlertJob,
    FraudDetectionJob,
    RetentionJob,
    CronService,
  ],
})
export class AppModule {}

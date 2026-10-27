import { Body, Controller, Module, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { SubscriptionService } from './subscription.service';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';
import { CtsModule } from '../cts/cts.service';
import { BirthCertificateModule } from './birth-certificate.controller';
import { FinancialModelModule } from '../financial-model/financial-model.controller';

const beneficiaryDraftSchema = z.object({
  firstName: z.string().min(2).max(60),
  lastName: z.string().min(2).max(60),
  birthDate: z.coerce.date(),
  gender: z.enum(['M', 'F']),
  relation: z.enum(['SPOUSE', 'CHILD', 'OTHER']),
});

const selectedGuaranteeSchema = z.object({
  categoryId: z.string().min(2),
  rate: z.number().int().min(0).max(100),
  annualLimit: z.number().int().min(0),
});

/**
 * Rachat de carence : `declarationAccepted` est la déclaration de santé
 * signée par le souscripteur. Elle est horodatée sur le contrat ; sans elle
 * le rachat est refusé (l'absence de carence ne serait pas opposable).
 */
const carenceBuyoutSchema = {
  carenceBuyout: z.boolean().default(false),
  declarationAccepted: z.boolean().default(false),
};

const quoteSchema = z.object({
  productId: z.string().min(5),
  frequency: z.enum(['ANNUAL', 'QUARTERLY', 'MONTHLY']),
  beneficiaries: z.array(z.object({ birthDate: z.coerce.date(), relation: z.enum(['SPOUSE', 'CHILD', 'OTHER']) })).default([]),
  selectedGuarantees: z.array(selectedGuaranteeSchema).optional(),
  ...carenceBuyoutSchema,
});

export const riskModelSchema = z.enum(['MUTUALITE', 'INDIVIDUEL']);

const subscribeIndividualSchema = z.object({
  productId: z.string().min(5),
  frequency: z.enum(['ANNUAL', 'QUARTERLY', 'MONTHLY']),
  beneficiaries: z.array(beneficiaryDraftSchema).default([]),
  selectedGuarantees: z.array(selectedGuaranteeSchema).optional(),
  riskModel: riskModelSchema.default('MUTUALITE'),
  ...carenceBuyoutSchema,
});

const subscribeCompanySchema = z.object({
  productId: z.string().min(5),
  frequency: z.enum(['ANNUAL', 'QUARTERLY', 'MONTHLY']),
  employeesCount: z.number().int().min(1).max(5000),
});

const guaranteeChangeRequestSchema = z.object({
  productId: z.string().min(5),
  categoryId: z.string().min(2),
  requestedRate: z.number().int().min(0).max(100).nullable().optional(),
  requestedAnnualLimit: z.number().int().min(0).max(100000000).nullable().optional(),
  reason: z.string().min(10).max(1000),
  frequency: z.enum(['ANNUAL', 'QUARTERLY', 'MONTHLY']),
  beneficiaries: z.array(z.object({
    birthDate: z.coerce.date(),
    relation: z.enum(['SPOUSE', 'CHILD', 'OTHER']),
  })).max(15).default([]),
}).superRefine((value, ctx) => {
  if (value.requestedRate == null && value.requestedAnnualLimit == null) {
    ctx.addIssue({ code: 'custom', message: 'Indiquez au moins un taux ou un plafond demandé' });
  }
});

@Controller('subscription')
export class SubscriptionController {
  constructor(private subscription: SubscriptionService) {}

  @Post('quote')
  quote(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(quoteSchema)) dto: any) {
    return this.subscription.quoteForUser(auth.id, dto.productId, dto.frequency, dto.beneficiaries, dto.selectedGuarantees, {
      carenceBuyout: dto.carenceBuyout,
      declarationAccepted: dto.declarationAccepted,
    });
  }

  @Post('subscribe')
  subscribe(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(subscribeIndividualSchema)) dto: any) {
    return this.subscription.subscribeIndividual(auth.id, dto.productId, dto.frequency, dto.beneficiaries, dto.selectedGuarantees, dto.riskModel, {
      carenceBuyout: dto.carenceBuyout,
      declarationAccepted: dto.declarationAccepted,
    });
  }

  @Post('guarantee-change-requests')
  guaranteeChangeRequest(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(guaranteeChangeRequestSchema)) dto: any) {
    return this.subscription.requestGuaranteeChange(auth.id, dto);
  }

  @Post('subscribe-company')
  subscribeCompany(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(subscribeCompanySchema)) dto: any) {
    return this.subscription.subscribeCompany(auth.id, dto.productId, dto.employeesCount, dto.frequency);
  }
}

@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService, NotificationDispatchService],
  imports: [CtsModule, BirthCertificateModule, FinancialModelModule],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}

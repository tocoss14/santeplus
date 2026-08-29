import { Body, Controller, Module, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { SubscriptionService } from './subscription.service';

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

const quoteSchema = z.object({
  productId: z.string().min(5),
  frequency: z.enum(['ANNUAL', 'QUARTERLY', 'MONTHLY']),
  beneficiaries: z.array(z.object({ birthDate: z.coerce.date(), relation: z.enum(['SPOUSE', 'CHILD', 'OTHER']) })).default([]),
  selectedGuarantees: z.array(selectedGuaranteeSchema).optional(),
});

const subscribeIndividualSchema = z.object({
  productId: z.string().min(5),
  frequency: z.enum(['ANNUAL', 'QUARTERLY', 'MONTHLY']),
  beneficiaries: z.array(beneficiaryDraftSchema).default([]),
  selectedGuarantees: z.array(selectedGuaranteeSchema).optional(),
});

const subscribeCompanySchema = z.object({
  productId: z.string().min(5),
  frequency: z.enum(['ANNUAL', 'QUARTERLY', 'MONTHLY']),
  employeesCount: z.number().int().min(1).max(5000),
});

@Controller('subscription')
export class SubscriptionController {
  constructor(private subscription: SubscriptionService) {}

  @Post('quote')
  quote(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(quoteSchema)) dto: any) {
    return this.subscription.quoteForUser(auth.id, dto.productId, dto.frequency, dto.beneficiaries, dto.selectedGuarantees);
  }

  @Post('subscribe')
  subscribe(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(subscribeIndividualSchema)) dto: any) {
    return this.subscription.subscribeIndividual(auth.id, dto.productId, dto.frequency, dto.beneficiaries, dto.selectedGuarantees);
  }

  @Post('subscribe-company')
  subscribeCompany(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(subscribeCompanySchema)) dto: any) {
    return this.subscription.subscribeCompany(auth.id, dto.productId, dto.employeesCount, dto.frequency);
  }
}

@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}

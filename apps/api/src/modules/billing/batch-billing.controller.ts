import { BadRequestException, Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { CurrentUser } from '../../common/decorators';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { BatchBillingService } from './batch-billing.service';

const createBatchSchema = z.object({
  providerId: z.string().min(5),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  claimIds: z.array(z.string().min(5)).optional(),
});

const submitBatchSchema = z.object({
  batchInvoiceId: z.string().min(5),
});

const validateItemSchema = z.object({
  batchInvoiceItemId: z.string().min(5),
  amountApproved: z.number().int().min(0),
  rejectionReason: z.string().max(500).optional(),
});

const validateBatchSchema = z.object({
  batchInvoiceId: z.string().min(5),
  items: z.array(validateItemSchema).min(1),
});

const payBatchSchema = z.object({
  batchInvoiceId: z.string().min(5),
  paymentRef: z.string().min(3),
});

const createRejectionSchema = z.object({
  batchInvoiceId: z.string().min(5),
  batchInvoiceItemId: z.string().min(5),
  type: z.enum(['MEDICAL', 'ADMINISTRATIVE', 'CODING', 'DUPLICATE', 'OUT_OF_COVERAGE', 'OTHER']),
  reason: z.string().min(5).max(500),
  amount: z.number().int().min(1),
});

const disputeRejectionSchema = z.object({
  rejectionId: z.string().min(5),
  resolutionNote: z.string().min(5).max(500),
});

const resolveRejectionSchema = z.object({
  rejectionId: z.string().min(5),
  resolutionNote: z.string().min(5).max(500),
});

const createCreditNoteSchema = z.object({
  providerId: z.string().min(5),
  batchInvoiceId: z.string().min(5).optional(),
  type: z.enum(['REJECTION', 'OVERPAYMENT', 'ADJUSTMENT', 'DUPLICATE_PAYMENT']),
  reason: z.string().min(5).max(500),
  amount: z.number().int().min(1),
});

const reconcileSchema = z.object({
  providerId: z.string().min(5),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  expectedAmount: z.number().int().min(0),
  paidAmount: z.number().int().min(0),
});

const acknowledgeProviderRejectionSchema = z.object({
  rejectionId: z.string().min(5),
});

const disputeProviderRejectionSchema = z.object({
  rejectionId: z.string().min(5),
  resolutionNote: z.string().min(5).max(500),
});

const createProviderBatchSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
}).refine(
  value => value.periodEnd >= value.periodStart,
  'La fin de période doit être postérieure ou égale au début',
);

@Controller('billing')
@UseInterceptors(AuditInterceptor)
export class BatchBillingController {
  constructor(private billing: BatchBillingService) {}

  // ═══ FACTURES GROUPÉES ═══

  @Post('batch-invoices')
  @RequirePermissions('billing.manage')
  async createBatchInvoice(@Body(new ZodPipe(createBatchSchema)) dto: any, @CurrentUser() auth: AuthUser) {
    return this.billing.createBatchInvoice(dto);
  }

  @Post('batch-invoices/submit')
  @RequirePermissions('billing.manage')
  async submitBatchInvoice(@Body(new ZodPipe(submitBatchSchema)) dto: any) {
    return this.billing.submitBatchInvoice(dto);
  }

  @Post('batch-invoices/validate')
  @RequirePermissions('billing.manage')
  async validateBatchInvoice(@Body(new ZodPipe(validateBatchSchema)) dto: any, @CurrentUser() auth: AuthUser) {
    return this.billing.validateBatchInvoice(dto, auth.id);
  }

  @Post('batch-invoices/pay')
  @RequirePermissions('billing.manage')
  async payBatchInvoice(@Body(new ZodPipe(payBatchSchema)) dto: any) {
    return this.billing.payBatchInvoice(dto.batchInvoiceId, dto.paymentRef);
  }

  @Get('batch-invoices')
  @RequirePermissions('billing.view')
  async listBatchInvoices(@Query('providerId') providerId?: string, @Query('status') status?: string) {
    if (!providerId) throw new BadRequestException('providerId requis');
    return this.billing.listBatchInvoices(providerId, status);
  }

  @Get('batch-invoices/:id')
  @RequirePermissions('billing.view')
  async getBatchInvoice(@Param('id') id: string) {
    return this.billing.getBatchInvoice(id);
  }

  // ═══ REJETS ═══

  @Post('rejections')
  @RequirePermissions('billing.manage')
  async createRejection(@Body(new ZodPipe(createRejectionSchema)) dto: any, @CurrentUser() auth: AuthUser) {
    return this.billing.createRejection(dto, auth.id);
  }

  @Post('rejections/dispute')
  @RequirePermissions('provider.thirdparty')
  async disputeRejection(@Body(new ZodPipe(disputeRejectionSchema)) dto: any) {
    return this.billing.disputeRejection(dto);
  }

  @Post('rejections/resolve')
  @RequirePermissions('billing.manage')
  async resolveRejection(@Body(new ZodPipe(resolveRejectionSchema)) dto: any) {
    return this.billing.resolveRejection(dto.rejectionId, dto.resolutionNote);
  }

  @Get('rejections')
  @RequirePermissions('billing.view')
  async listRejections(@Query('batchInvoiceId') batchInvoiceId?: string, @Query('status') status?: string) {
    return this.billing.listRejections(batchInvoiceId, status);
  }

  // ═══ AVOIRS (CREDIT NOTES) ═══

  @Post('credit-notes')
  @RequirePermissions('billing.manage')
  async createCreditNote(@Body(new ZodPipe(createCreditNoteSchema)) dto: any) {
    return this.billing.createCreditNote(dto);
  }

  @Post('credit-notes/:id/apply')
  @RequirePermissions('billing.manage')
  async applyCreditNote(@Param('id') id: string) {
    return this.billing.applyCreditNote(id);
  }

  @Get('credit-notes')
  @RequirePermissions('billing.view')
  async listCreditNotes(@Query('providerId') providerId: string, @Query('status') status?: string) {
    return this.billing.listCreditNotes(providerId, status);
  }

  // ═══ RÉCONCILIATION ═══

  @Post('reconciliations')
  @RequirePermissions('billing.manage')
  async reconcile(@Body(new ZodPipe(reconcileSchema)) dto: any) {
    return this.billing.reconcile(dto);
  }

  @Get('reconciliations')
  @RequirePermissions('billing.view')
  async listReconciliations(@Query('providerId') providerId: string, @Query('status') status?: string) {
    return this.billing.listReconciliations(providerId, status);
  }
}

@Controller('provider')
@UseInterceptors(AuditInterceptor)
export class ProviderBillingController {
  constructor(private billing: BatchBillingService) {}

  @Get('batch-invoices')
  @RequirePermissions('provider.thirdparty')
  async providerBatchInvoices(@CurrentUser() auth: AuthUser, @Query('status') status?: string) {
    return this.billing.providerBatchInvoices(auth.id, status);
  }

  @Get('batch-invoices/:id')
  @RequirePermissions('provider.thirdparty')
  async providerBatchInvoice(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    return this.billing.providerBatchInvoice(auth.id, id);
  }

  @Post('batch-invoices')
  @RequirePermissions('provider.thirdparty')
  async createProviderBatchInvoice(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodPipe(createProviderBatchSchema)) dto: any,
  ) {
    return this.billing.createProviderBatchInvoice(auth.id, dto);
  }

  @Post('batch-invoices/submit')
  @RequirePermissions('provider.thirdparty')
  async submitProviderBatchInvoice(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodPipe(submitBatchSchema)) dto: any,
  ) {
    return this.billing.submitProviderBatchInvoice(auth.id, dto.batchInvoiceId);
  }

  @Get('rejections')
  @RequirePermissions('provider.thirdparty')
  async providerRejections(
    @CurrentUser() auth: AuthUser,
    @Query('batchInvoiceId') batchInvoiceId?: string,
    @Query('status') status?: string,
  ) {
    return this.billing.providerRejections(auth.id, batchInvoiceId, status);
  }

  @Post('rejections/acknowledge')
  @RequirePermissions('provider.thirdparty')
  async acknowledgeProviderRejection(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodPipe(acknowledgeProviderRejectionSchema)) dto: any,
  ) {
    return this.billing.acknowledgeProviderRejection(auth.id, dto.rejectionId);
  }

  @Post('rejections/dispute')
  @RequirePermissions('provider.thirdparty')
  async disputeProviderRejection(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodPipe(disputeProviderRejectionSchema)) dto: any,
  ) {
    return this.billing.disputeProviderRejection(auth.id, dto.rejectionId, dto.resolutionNote);
  }
}

@Module({
  controllers: [BatchBillingController, ProviderBillingController],
  providers: [BatchBillingService],
  exports: [BatchBillingService],
})
export class BatchBillingModule {}
import { BadRequestException, Body, Controller, ForbiddenException, Get, Module, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { AuthUser } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { CLAIM_STATUSES_CONSUMING_CAPS, needsPriorAuthorization, resolveThreshold } from '../../domain/engine';
import { ClaimsModule, ClaimsService } from '../claims/claims.controller';
import { NotificationDispatchService } from '../../common/notifications/dispatch.service';
import { ref, secureToken } from '../../common/utils';
import { CareRecordController } from './care-record.controller';
import { CareService } from './care.service';
import { encryptMedical, decryptField, canAccessMedical, MEDICAL_MASKED } from '../../common/crypto';

const CAPS_CONSUMING: string[] = [...CLAIM_STATUSES_CONSUMING_CAPS];

function decryptConsultationForReader(c: any, requester: AuthUser): any {
  const can = canAccessMedical(requester, c.patientUserId, c.providerId);
  if (can) {
    if (c.motifEnc) {
      const dec = decryptField(c.motifEnc);
      if (dec !== null) c.motif = dec;
    }
    if (c.diagnosticEnc !== undefined) {
      if (c.diagnosticEnc) {
        const dec = decryptField(c.diagnosticEnc);
        if (dec !== null) c.diagnostic = dec;
      } else if (c.diagnosticEnc === null) {
        // keep diagnostic as is (may be null) if no enc; already plain
      }
    }
  } else {
    c.motif = MEDICAL_MASKED;
    if (c.diagnostic != null || c.diagnosticEnc != null) {
      c.diagnostic = MEDICAL_MASKED;
    } else {
      c.diagnostic = MEDICAL_MASKED;
    }
  }
  // Do not expose enc columns to client
  if ('motifEnc' in c) delete c.motifEnc;
  if ('diagnosticEnc' in c) delete c.diagnosticEnc;
  return c;
}

function decryptPrescriptionForReader(p: any, requester: AuthUser): any {
  if (!p) return p;
  const can = canAccessMedical(requester, p.patientUserId, p.providerId);
  if (can) {
    if (p.noteEnc) {
      const dec = decryptField(p.noteEnc);
      if (dec !== null) p.note = dec;
    }
  } else {
    if (p.note != null || p.noteEnc != null) {
      p.note = MEDICAL_MASKED;
    }
  }
  if ('noteEnc' in p) delete p.noteEnc;
  return p;
}

const medicationSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_-]{2,30}$/),
  name: z.string().min(2).max(120),
  dci: z.string().max(80).optional(),
  dosage: z.string().max(30).optional(),
  form: z.string().max(30).optional(),
  price: z.number().int().min(50),
  requiresPrescription: z.boolean().default(true),
  active: z.boolean().default(true),
});

const actCreateSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_-]{2,30}$/),
  name: z.string().min(2).max(120),
  categoryId: z.string().min(2),
  referencePrice: z.number().int().min(1),
  requiresPrescription: z.boolean().default(false),
  requiresPriorAuth: z.boolean().default(false),
  authThreshold: z.number().int().min(0).nullable().optional(),
  active: z.boolean().default(true),
});

@Controller()
@UseInterceptors(AuditInterceptor)
export class CareController {
  constructor(
    private prisma: PrismaService,
    private dispatch: NotificationDispatchService,
    private care: CareService,
    private claims: ClaimsService,
  ) {}

  @Get('medications')
  medications(@Query('q') q?: string, @Query('category') category?: string) {
    const where: any = { active: true };
    if (q) where.OR = [{ code: { contains: q } }, { name: { contains: q } }, { dci: { contains: q } }];
    if (category) where.categoryId = category;
    return this.prisma.medication.findMany({ where, orderBy: [{ name: 'asc' }], take: 100 });
  }

  @Post('admin/medications')
  @RequirePermissions('products.manage')
  createMed(@Body(new ZodPipe(medicationSchema)) dto: any) {
    return this.prisma.medication.create({ data: dto });
  }

  @Get('admin/medications')
  @RequirePermissions('products.manage')
  listMedsAdmin(@Query('q') q?: string) {
    return this.prisma.medication.findMany({
      where: q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] } : {},
      orderBy: { code: 'asc' }, take: 200,
    });
  }

  @Get('admin/acts')
  @RequirePermissions('products.manage')
  listActsAdmin(@Query('q') q?: string) {
    return this.prisma.act.findMany({
      where: q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] } : {},
      orderBy: [{ categoryId: 'asc' }, { code: 'asc' }], take: 200,
    });
  }

  @Post('admin/acts')
  @RequirePermissions('products.manage')
  createAct(@Body(new ZodPipe(actCreateSchema)) dto: any) {
    return this.prisma.act.create({ data: dto });
  }

  @Patch('admin/acts/:id')
  @RequirePermissions('products.manage')
  async updateAct(@Param('id') id: string, @Body(new ZodPipe(actCreateSchema.partial())) dto: any) {
    const existing = await this.prisma.act.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Acte introuvable');
    return this.prisma.act.update({ where: { id }, data: dto });
  }

  @Post('provider/consultations')
  @RequirePermissions('provider.thirdparty')
  async createConsultation(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodPipe(z.object({
      memberNumber: z.string().min(3).optional(),
      cardToken: z.string().min(10).max(64).optional(),
      contractNumber: z.string().min(4).max(40).optional(),
      beneficiaryMemberNumber: z.string().max(30).optional(),
      motif: z.string().min(3).max(500),
      diagnostic: z.string().max(800).optional(),
      practitioner: z.string().min(2).max(80).default(''),
      specialty: z.string().max(60).optional(),
      actId: z.string().optional(),
      amount: z.number().int().min(1).optional(),
    }).refine(v => Boolean(v.memberNumber || v.cardToken || v.contractNumber), 'Identification requise'))) dto: any,
  ) {
    const { establishment } = await this.care.requireEstablishment(auth);
    const contract = await this.resolveContract(dto);
    if (contract.status === 'TERMINATED' || contract.status === 'SUSPENDED') {
      throw new BadRequestException('Contrat radié — délivrance impossible');
    }
    const patientUserId = contract.principalUser.id;
    let beneficiaryId: string | null = null;
    if (dto.beneficiaryMemberNumber) {
      const ben = contract.beneficiaries.find((b: any) => b.memberNumber === dto.beneficiaryMemberNumber);
      if (!ben) throw new BadRequestException('Bénéficiaire non couvert');
      beneficiaryId = ben.id;
    }

    const practitionerUser = await this.prisma.user.findUnique({ where: { id: auth.id } });
    const consultation = await this.prisma.consultation.create({
      data: {
        reference: ref('CON'),
        patientUserId,
        beneficiaryId,
        providerId: establishment.id,
        practitionerUserId: auth.id,
        practitionerName: dto.practitioner || `${practitionerUser?.firstName} ${practitionerUser?.lastName}`,
        specialty: dto.specialty,
        motif: dto.motif,
        motifEnc: encryptMedical(dto.motif),
        diagnostic: dto.diagnostic,
        diagnosticEnc: dto.diagnostic ? encryptMedical(dto.diagnostic) : null,
      },
    });

    if (dto.actId && dto.amount) {
      const act = await this.prisma.act.findUnique({ where: { id: dto.actId } });
      if (!act) throw new BadRequestException('Acte inconnu');
      const estimation = await this.claims.buildEstimation(contract as any, consultation.careDate,
        [{ categoryId: act.categoryId, amountRequested: dto.amount }]);
      const claim = await this.prisma.claim.create({
        data: {
          reference: ref('SIN'),
          kind: 'THIRDPARTY',
          contractId: contract.id,
          claimantUserId: patientUserId,
          beneficiaryId,
          providerId: establishment.id,
          providerUserId: auth.id,
          careDate: consultation.careDate,
          status: 'PENDING_CONFIRMATION',
          totalRequested: dto.amount,
          totalApproved: estimation.totals.approved,
          estimation: JSON.stringify(estimation),
          flags: JSON.stringify(estimation.flags),
          prescriptionId: null,
          items: {
            create: estimation.items.map(e => ({
              actId: act.id, code: act.code, label: act.name, categoryLabel: e.categoryId,
              quantity: 1, unitPrice: dto.amount,
              amountRequested: e.amountRequested, amountEligible: e.amountEligible,
              rateApplied: e.rateApplied ?? 0, deductibleApplied: e.deductibleApplied ?? 0, amountApproved: e.amountApproved,
            })),
          },
        },
      });
      await this.prisma.consultation.update({ where: { id: consultation.id }, data: { claimId: claim.id } });
    }

    const dossierId = await this.care.ensureCareRecord(patientUserId, {
      beneficiaryId,
      providerId: establishment.id,
      consultationId: consultation.id,
    });
    await this.care.addEvent(dossierId, {
      type: 'CONSULTATION_CREATED',
      title: `Consultation ${consultation.reference} — ${consultation.motif}`,
      detail: consultation.diagnostic ?? undefined,
      actorUserId: auth.id, actorRole: auth.role,
    });

    return consultation;
  }

  @Get('provider/consultations')
  @RequirePermissions('provider.thirdparty')
  async listConsultations(@CurrentUser() auth: AuthUser, @Query('q') q?: string) {
    const { establishment } = await this.care.requireEstablishment(auth);
    const where: any = { providerId: establishment.id };
    if (q) where.OR = [
      { motif: { contains: q } }, { reference: { contains: q } },
      { patientUser: { is: { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }] } } },
    ];
    const items = await this.prisma.consultation.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 100,
      include: {
        patientUser: { select: { firstName: true, lastName: true, memberNumber: true } },
        prescriptions: { select: { number: true, status: true } },
      },
    });
    return items.map((c: any) => decryptConsultationForReader(c, auth));
  }

  @Get('consultations/mine')
  async mineConsultations(@CurrentUser() auth: AuthUser) {
    const items = await this.prisma.consultation.findMany({
      where: { patientUserId: auth.id },
      orderBy: { careDate: 'desc' },
      include: {
        provider: { select: { name: true, city: true } },
        prescriptions: { select: { number: true, status: true } },
      },
      take: 100,
    });
    return items.map((c: any) => decryptConsultationForReader(c, auth));
  }

  @Post('provider/prescriptions')
  @RequirePermissions('provider.thirdparty')
  async createPrescription(
    @CurrentUser() auth: AuthUser,
    @Body(new ZodPipe(z.object({
      memberNumber: z.string().min(3).optional(),
      cardToken: z.string().min(10).max(64).optional(),
      contractNumber: z.string().min(4).max(40).optional(),
      beneficiaryMemberNumber: z.string().max(30).optional(),
      consultationId: z.string().optional(),
      lines: z.array(z.object({
        medicationId: z.string().optional(),
        actId: z.string().optional(),
        code: z.string().min(1).max(40),
        name: z.string().min(2).max(120),
        categoryId: z.string().min(2),
        quantity: z.number().int().min(1).max(30),
        unitPrice: z.number().int().min(1),
        posology: z.string().max(200).optional(),
        duration: z.string().max(80).optional(),
        instructions: z.string().max(300).optional(),
      })).min(1).max(20),
      validDays: z.number().int().min(1).max(365).default(30),
      renewalsAllowed: z.number().int().min(0).max(10).default(0),
      note: z.string().max(500).optional(),
    }).refine(v => Boolean(v.memberNumber || v.cardToken || v.contractNumber), 'Identification requise'))) dto: any,
  ) {
    const { establishment } = await this.care.requireEstablishment(auth);
    const contract = await this.resolveContract(dto);
    if (contract.status === 'TERMINATED' || contract.status === 'SUSPENDED') {
      throw new BadRequestException('Contrat radié — délivrance impossible');
    }
    const patientUserId = contract.principalUser.id;
    let beneficiaryId: string | null = null;
    if (dto.beneficiaryMemberNumber) {
      const ben = contract.beneficiaries.find((b: any) => b.memberNumber === dto.beneficiaryMemberNumber);
      if (!ben) throw new BadRequestException('Bénéficiaire non couvert');
      beneficiaryId = ben.id;
    }
    if (dto.consultationId) {
      const cons = await this.prisma.consultation.findFirst({
        where: { id: dto.consultationId, providerId: establishment.id },
      });
      if (!cons) throw new BadRequestException('Consultation introuvable');
    }

    const prescriber = await this.prisma.user.findUnique({ where: { id: auth.id } });
    const now = new Date();
    const until = new Date(now); until.setDate(until.getDate() + dto.validDays);

    const pres = await this.prisma.prescription.create({
      data: {
        number: ref('ORD'),
        qrToken: secureToken(12),
        patientUserId,
        beneficiaryId,
        consultationId: dto.consultationId ?? null,
        providerId: establishment.id,
        prescriberUserId: auth.id,
        prescriberName: `${prescriber?.firstName} ${prescriber?.lastName}`.trim(),
        specialty: dto.specialty,
        validFrom: now,
        validUntil: until,
        renewalsAllowed: dto.renewalsAllowed,
        note: dto.note,
        noteEnc: dto.note ? encryptMedical(dto.note) : null,
        status: 'ACTIVE',
        lines: {
          create: dto.lines.map((l: any) => ({
            medicationId: l.medicationId ?? null,
            actId: l.actId ?? null,
            code: l.code, name: l.name, categoryId: l.categoryId,
            quantity: l.quantity, unitPrice: l.unitPrice,
            posology: l.posology, duration: l.duration, instructions: l.instructions,
          })),
        },
      },
      include: { lines: true, patientUser: { select: { firstName: true, lastName: true, memberNumber: true } } },
    });

    await this.dispatch.dispatchToUser(patientUserId, {
      topic: 'PRESCRIPTION_CREATED',
      title: `Ordonnance ${pres.number} : consultez vos prescriptions`,
      body: 'Une ordonnance a été créée par votre prescripteur. Procurez-vous les produits chez un prestataire partenaire.',
    });

    const dossierId2 = await this.care.ensureCareRecord(patientUserId, {
      beneficiaryId,
      providerId: establishment.id,
      consultationId: pres.consultationId ?? undefined,
      prescriptionId: pres.id,
    });
    await this.care.addEvent(dossierId2, {
      type: 'PRESCRIPTION_CREATED',
      title: `Ordonnance ${pres.number} — ${pres.lines.length} produit(s)`,
      detail: pres.note ?? undefined,
      actorUserId: auth.id, actorRole: auth.role,
    });

    return pres;
  }

  @Get('provider/prescriptions')
  async listPrescriptions(@CurrentUser() auth: AuthUser, @Query('status') status?: string, @Query('q') q?: string) {
    const { establishment } = await this.care.requireEstablishment(auth);
    const where: any = { providerId: establishment.id };
    if (status) where.status = status;
    if (q) where.OR = [{ number: { contains: q } }, { patientUser: { is: { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { memberNumber: { contains: q } }] } } }];
    const items = await this.prisma.prescription.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 100,
      include: {
        patientUser: { select: { firstName: true, lastName: true, memberNumber: true } },
        lines: { take: 1 },
        _count: { select: { deliveries: true } },
      },
    });
    return items.map((p: any) => decryptPrescriptionForReader(p, auth));
  }

  @Get('provider/prescriptions/:id')
  async prescriptionDetail(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const { establishment } = await this.care.requireEstablishment(auth);
    const p = await this.prisma.prescription.findFirst({
      where: { id, providerId: establishment.id },
      include: {
        patientUser: { select: { firstName: true, lastName: true, memberNumber: true } },
        lines: true,
        deliveries: { include: { lines: true } },
        consultation: { select: { reference: true, motif: true, motifEnc: true, diagnostic: true, diagnosticEnc: true } },
      },
    });
    if (!p) throw new NotFoundException();
    const decrypted = decryptPrescriptionForReader(p, auth);
    if ((p as any).consultation) {
      decryptConsultationForReader(decrypted.consultation, auth);
    }
    const enriched = { ...decrypted, isExpired: new Date(p.validUntil) < new Date() };
    return enriched;
  }

  @Post('provider/prescriptions/:id/renew')
  async renewPrescription(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const { establishment } = await this.care.requireEstablishment(auth);
    const p = await this.prisma.prescription.findFirst({ where: { id, providerId: establishment.id } });
    if (!p) throw new NotFoundException();
    // Hard cap: renewalsAllowed is absolute ceiling, not informative
    const used = typeof p.renewalsUsed === 'number' ? p.renewalsUsed : 0;
    const allowed = typeof p.renewalsAllowed === 'number' ? p.renewalsAllowed : 0;
    if (used >= allowed)
      throw new BadRequestException(`Aucun renouvellement restant (${allowed} autorisés)`);
    await this.prisma.$transaction(async (tx: any) => {
      // Re-check inside transaction to avoid race
      const fresh = await tx.prescription.findUnique({ where: { id } });
      if (!fresh) throw new NotFoundException();
      const freshUsed = typeof fresh.renewalsUsed === 'number' ? fresh.renewalsUsed : 0;
      const freshAllowed = typeof fresh.renewalsAllowed === 'number' ? fresh.renewalsAllowed : 0;
      if (freshUsed >= freshAllowed) throw new BadRequestException(`Aucun renouvellement restant (${freshAllowed} autorisés)`);
      await tx.prescription.update({
        where: { id },
        data: {
          renewalsUsed: freshUsed + 1,
          validUntil: new Date(Date.now() + 30 * 86400000),
          status: 'ACTIVE',
        },
      });
      const lines = await tx.prescriptionLine.findMany({ where: { prescriptionId: id } });
      for (const line of lines) {
        await tx.prescriptionLine.update({ where: { id: line.id }, data: { deliveredQty: 0 } });
      }
    });
    return { ok: true };
  }

  @Post('provider/prescriptions/:id/cancel')
  async cancelPrescription(@CurrentUser() auth: AuthUser, @Param('id') id: string) {
    const { establishment } = await this.care.requireEstablishment(auth);
    const p = await this.prisma.prescription.findFirst({ where: { id, providerId: establishment.id } });
    if (!p) throw new NotFoundException();
    await this.prisma.prescription.update({ where: { id }, data: { status: 'CANCELLED' } });
    return { ok: true };
  }

  @Post('provider/prescriptions/scan')
  async scanPrescription(@CurrentUser() auth: AuthUser, @Body(new ZodPipe(z.object({
    qrToken: z.string().min(8).max(64).optional(),
    number: z.string().min(4).max(40).optional(),
  }).refine(v => Boolean(v.qrToken || v.number), 'Numéro ou QR requis'))) dto: any) {
    const p = await this.prisma.prescription.findFirst({
      where: dto.qrToken ? { qrToken: dto.qrToken } : { number: dto.number },
      include: {
        patientUser: { select: { firstName: true, lastName: true, memberNumber: true } },
        lines: true,
        deliveries: { include: { lines: true } },
      },
    });
    if (!p) throw new NotFoundException('Ordonnance introuvable');

    const decryptedP = decryptPrescriptionForReader({ ...p }, auth);
    const remaining = (p as any).lines.map((l: any) => ({
      lineId: l.id, code: l.code, name: l.name, categoryId: l.categoryId,
      quantity: l.quantity, deliveredQty: l.deliveredQty, remaining: l.quantity - l.deliveredQty,
      unitPrice: l.unitPrice, posology: l.posology, duration: l.duration, instructions: l.instructions,
    }));
    const isExpired = new Date(p.validUntil) < new Date();
    const status = isExpired ? 'EXPIRED' : p.status === 'CANCELLED' ? 'CANCELLED'
      : remaining.every((r: any) => r.remaining <= 0) ? 'EXECUTED'
      : remaining.some((r: any) => r.deliveredQty > 0) ? 'PARTIALLY_EXECUTED'
      : p.status;

    return { ...decryptedP, remainingLines: remaining, isExpired, computedStatus: status };
  }

  @Post('provider/deliveries')
  @UseInterceptors(require('@nestjs/platform-express').FilesInterceptor('documents', 4))
  async createDelivery(
    @CurrentUser() auth: AuthUser,
    @Body('payload') payloadRaw: string,
    @Param() _unused: any,
    ..._args: any[]
  ) {
    const { establishment } = await this.care.requireEstablishment(auth);
    let dto: any;
    try {
      dto = z.object({
        prescriptionNumber: z.string().min(3).optional(),
        qrToken: z.string().min(8).max(64).optional(),
        prescriptionId: z.string().optional(),
        lines: z.array(z.object({
          lineId: z.string(),
          quantity: z.number().int().min(1).max(30),
          unitPrice: z.number().int().min(1).optional(),
          substitutionNote: z.string().max(300).optional(),
        })).min(1).max(20),
        note: z.string().max(500).optional(),
      }).refine(v => Boolean(v.prescriptionNumber || v.qrToken || v.prescriptionId), 'Prescription requise')
        .parse(JSON.parse(payloadRaw ?? '{}'));
    } catch (e: any) {
      if (e instanceof z.ZodError) throw new BadRequestException({ statusCode: 400, message: e.issues[0]?.message ?? 'Données invalides', errors: e.flatten() });
      throw new BadRequestException('Payload invalide');
    }

    const presWhere: any = dto.prescriptionId ? { id: dto.prescriptionId }
      : dto.qrToken ? { qrToken: dto.qrToken }
      : { number: dto.prescriptionNumber };
    const pres = await this.prisma.prescription.findFirst({
      where: presWhere,
      include: {
        lines: true,
        patientUser: { select: { id: true } },
        deliveries: true,
      },
    });
    if (!pres) throw new NotFoundException('Ordonnance introuvable');
    if (pres.status === 'CANCELLED') throw new BadRequestException('Ordonnance annulée');
    if (new Date(pres.validUntil) < new Date())
      throw new BadRequestException(`Ordonnance expirée (valide jusqu'au ${new Date(pres.validUntil).toLocaleDateString('fr-FR')})`);

    for (const req of dto.lines) {
      const line = pres.lines.find(l => l.id === req.lineId);
      if (!line) throw new BadRequestException(`Ligne ${req.lineId} inconnue dans cette ordonnance`);
      const remaining = line.quantity - line.deliveredQty;
      if (remaining <= 0)
        throw new BadRequestException(`Cette ordonnance a déjà été entièrement exécutée.`);
      if (req.quantity > remaining)
        throw new BadRequestException(`Quantité demandée (${req.quantity}) dépasse le reste disponible (${remaining}) pour ${line.name}`);
    }

    const patient = await this.prisma.user.findUnique({ where: { id: pres.patientUserId } });
    if (!patient) throw new NotFoundException();
    const patientContract = await this.prisma.contract.findFirst({
      where: { principalUserId: patient.id, status: { in: ['ACTIVE', 'SUSPENDED', 'TERMINATED'] } },
      include: { product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!patientContract) throw new BadRequestException('Contrat du patient inactif — délivrance impossible');
    if (patientContract.status === 'TERMINATED' || patientContract.status === 'SUSPENDED') {
      throw new BadRequestException('Contrat radié — délivrance impossible');
    }
    if (patientContract.status !== 'ACTIVE')
      throw new BadRequestException('Contrat du patient inactif — délivrance impossible');

    for (const req of dto.lines) {
      const line = pres.lines.find(l => l.id === req.lineId)!;
      const act = line.actId ? await this.prisma.act.findUnique({ where: { id: line.actId } }) : null;
      const med = line.medicationId ? await this.prisma.medication.findUnique({ where: { id: line.medicationId } }) : null;
      const requiresPrescription = act?.requiresPrescription ?? med?.requiresPrescription ?? false;
      void requiresPrescription;
    }

    const deliveredLines = dto.lines.map((req: any) => {
      const line = pres.lines.find(l => l.id === req.lineId)!;
      const unitPrice = req.unitPrice ?? line.unitPrice;
      return {
        line, quantity: req.quantity, unitPrice, amount: req.quantity * unitPrice, substitutionNote: req.substitutionNote,
      };
    });
    const totalRequested = deliveredLines.reduce((a: number, d: any) => a + d.amount, 0);
    const items = deliveredLines.map((d: any) => ({ categoryId: d.line.categoryId, amountRequested: d.amount }));
    const estimation = await this.claims.buildEstimation(patientContract as any, new Date(), items);
    const productThreshold: number | null =
      (await this.prisma.product.findUnique({ where: { id: (patientContract as any).productId }, select: { thirdPartyAuthThreshold: true } }))?.thirdPartyAuthThreshold ?? null;
    const thresholds: number[] = [];
    for (const dl of deliveredLines) {
      let actThreshold: number | null = null;
      if (dl.line.actId) {
        const act = await this.prisma.act.findUnique({ where: { id: dl.line.actId }, select: { authThreshold: true } });
        actThreshold = act?.authThreshold ?? null;
      }
      thresholds.push(resolveThreshold(productThreshold, actThreshold));
    }
    let needsAuth = false;
    if (estimation.items.length === thresholds.length) {
      needsAuth = estimation.items.some((e, idx) => needsPriorAuthorization(e.amountApproved, thresholds[idx]));
    }
    if (!needsAuth && thresholds.length) {
      const mostRestrictive = Math.min(...thresholds);
      needsAuth = needsPriorAuthorization(estimation.totals.approved, mostRestrictive);
    }
    const status = needsAuth ? 'AUTH_REQUIRED' : 'CONFIRMED';

    // Hard cap: if a prior authorized claim exists for this prescription/contract, delivery must not exceed authorizedAmount
    const existingCap = await (this.prisma.claim.findFirst as any)?.({
      where: {
        prescriptionId: pres.id,
        authorizedAmount: { not: null },
        status: { in: ['AUTHORIZED', 'AUTHORIZED_EMERGENCY', 'CONFIRMED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existingCap?.authorizedAmount != null && totalRequested > existingCap.authorizedAmount) {
      throw new BadRequestException(`Facture de ${totalRequested} FCFA dépasse le montant autorisé de ${existingCap.authorizedAmount} FCFA`);
    }

    const result = await this.prisma.$transaction(async tx => {
      await tx.prescription.update({
        where: { id: pres.id },
        data: {
          status: deliveredLines.reduce((a: number, d: any) => a + d.quantity, 0) + pres.lines.reduce((a: number, l: any) => a + (l.deliveredQty ?? 0), 0) >= pres.lines.reduce((a: number, l: any) => a + l.quantity, 0)
            ? 'EXECUTED' : 'PARTIALLY_EXECUTED',
        },
      });
      for (const dl of deliveredLines) {
        await tx.prescriptionLine.update({
          where: { id: dl.line.id },
          data: { deliveredQty: dl.line.deliveredQty + dl.quantity },
        });
      }
      const del = await tx.delivery.create({
        data: {
          reference: ref('DEL'),
          prescriptionId: pres.id,
          providerId: establishment.id,
          userId: auth.id,
          patientUserId: patient.id,
          totalAmount: totalRequested,
          coveredAmount: estimation.totals.approved,
          patientAmount: estimation.totals.outOfPocket,
          lines: {
            create: deliveredLines.map((d: any) => ({
              lineId: d.line.id, medicationId: d.line.medicationId ?? null,
              code: d.line.code, name: d.line.name, categoryId: d.line.categoryId,
              quantity: d.quantity, unitPrice: d.unitPrice, amount: d.amount, substitutionNote: d.substitutionNote ?? null,
            })),
          },
        },
        include: { lines: true },
      });

      const claim = await tx.claim.create({
        data: {
          reference: ref('TPE'),
          kind: 'THIRDPARTY',
          contractId: patientContract.id,
          claimantUserId: patient.id,
          providerId: establishment.id,
          providerUserId: auth.id,
          careDate: new Date(),
          status,
          totalRequested: estimation.totals.requested,
          totalApproved: estimation.totals.approved,
          estimation: JSON.stringify(estimation),
          flags: JSON.stringify(estimation.flags),
          prescriptionId: pres.id,
          deliveryId: del.id,
          items: {
            create: estimation.items.map((e, idx) => ({
              actId: deliveredLines[idx]?.line.actId ?? null,
              code: deliveredLines[idx]?.line.code ?? null,
              label: deliveredLines[idx]?.line.name ?? null,
              categoryLabel: e.categoryId, quantity: deliveredLines[idx]?.quantity ?? 1,
              unitPrice: deliveredLines[idx]?.unitPrice ?? null,
              amountRequested: e.amountRequested, amountEligible: e.amountEligible,
              rateApplied: e.rateApplied ?? 0, deductibleApplied: e.deductibleApplied ?? 0, amountApproved: e.amountApproved,
            })),
          },
        },
      });
      await tx.delivery.update({ where: { id: del.id }, data: { claimId: claim.id } });
      return { del, claim };
    });

    const delivery = result.del;

    const dossierId3 = await this.care.ensureCareRecord(patient.id ?? pres.patientUserId, {
      beneficiaryId: pres.beneficiaryId ?? null,
      providerId: establishment.id,
      prescriptionId: pres.id,
      deliveryId: delivery.id,
      claimId: result.claim.id,
    });
    await this.care.addEvent(dossierId3, {
      type: 'DELIVERY_CREATED',
      title: `Délivrance ${result.del.reference} — ${result.del.lines.length} produit(s)`,
      detail: `Couvert ${estimation.totals.approved} FCFA — à charge ${estimation.totals.outOfPocket} FCFA`,
      actorUserId: auth.id, actorRole: auth.role,
    });

    if (status === 'AUTH_REQUIRED') {
      await this.dispatch.dispatchToMany(
        (await this.prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN', 'INSURANCE_MANAGER'] }, status: 'ACTIVE' }, select: { id: true } })).map(m => m.id),
        { topic: 'THIRDPARTY_AUTH_REQUEST', title: `Autorisation demandée — ${delivery.reference}`, body: `${establishment.name} — ${pres.number} — ${estimation.totals.approved} FCFA` },
      );
    } else {
      await this.dispatch.dispatchToUser(patient.id, {
        topic: 'THIRDPARTY_CONFIRMED',
        title: `Délivrance ${delivery.reference} — prise en charge ${estimation.totals.approved} FCFA`,
        body: `Vos produits ont été délivrés chez ${establishment.name}. Reste à charge : ${estimation.totals.outOfPocket} FCFA.`,
      });
    }

    return { deliveryId: delivery.id, reference: delivery.reference, status, estimation };
  }

  @Get('provider/deliveries')
  async listDeliveries(@CurrentUser() auth: AuthUser, @Query('q') q?: string) {
    const { establishment } = await this.care.requireEstablishment(auth);
    const where: any = { providerId: establishment.id };
    if (q) where.OR = [{ reference: { contains: q } }, { prescription: { is: { number: { contains: q } } } }];
    return this.prisma.delivery.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 100,
      include: {
        prescription: { select: { number: true } },
        lines: { take: 1 },
        patientUser: { select: { firstName: true, lastName: true } },
      },
    });
  }

  @Get('prescriptions/mine')
  async myPrescriptions(@CurrentUser() auth: AuthUser) {
    const items = await this.prisma.prescription.findMany({
      where: { patientUserId: auth.id },
      orderBy: { createdAt: 'desc' },
      include: {
        lines: true,
        provider: { select: { name: true } },
        prescriberUser: { select: { firstName: true, lastName: true } },
      },
      take: 100,
    });
    return items.map((p: any) => decryptPrescriptionForReader(p, auth));
  }

  @Get('consultations/mine-old')
  _mineConsultationsOld(@CurrentUser() auth: AuthUser) {
    void auth;
    return [];
  }

  assertAuthorizedCap(claim: any, invoiceTotal: number) {
    if (claim?.authorizedAmount != null && invoiceTotal > claim.authorizedAmount) {
      throw new BadRequestException(`Facture de ${invoiceTotal} FCFA dépasse le montant autorisé de ${claim.authorizedAmount} FCFA`);
    }
  }

  private async resolveContract(dto: any) {
    if (dto.cardToken) {
      const c = await this.prisma.contract.findUnique({
        where: { cardToken: dto.cardToken },
        include: {
          principalUser: { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
          product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true, insurerPartner: { select: { name: true } } } },
          beneficiaries: { where: { status: 'COVERED' }, select: { id: true, firstName: true, lastName: true, memberNumber: true } },
        },
      });
      if (c) return c;
    }
    const memberNumber = dto.memberNumber?.trim()?.toUpperCase();
    const contractNumber = dto.contractNumber?.trim()?.toUpperCase();
    if (contractNumber) {
      const c = await this.prisma.contract.findFirst({
        where: { number: contractNumber },
        include: {
          principalUser: { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
          product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true, insurerPartner: { select: { name: true } } } },
          beneficiaries: { where: { status: 'COVERED' }, select: { id: true, firstName: true, lastName: true, memberNumber: true } },
        },
      });
      if (c) return c;
    }
    if (memberNumber) {
      let contract = await this.prisma.contract.findFirst({
        where: { principalUser: { is: { memberNumber } } },
        include: {
          principalUser: { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
          product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true, insurerPartner: { select: { name: true } } } },
          beneficiaries: { where: { status: 'COVERED' }, select: { id: true, firstName: true, lastName: true, memberNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (contract) return contract;
      const ben = await this.prisma.beneficiary.findFirst({ where: { memberNumber } });
      if (ben) {
        contract = await this.prisma.contract.findUnique({
          where: { id: ben.contractId },
          include: {
            principalUser: { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
            product: { include: { guarantees: { include: { guarantee: true } }, exclusions: true, insurerPartner: { select: { name: true } } } },
            beneficiaries: { where: { status: 'COVERED' }, select: { id: true, firstName: true, lastName: true, memberNumber: true } },
          },
        });
        if (contract) return contract;
      }
    }
    throw new NotFoundException('Assuré introuvable — vérifiez le QR, le n° assuré ou le n° contrat');
  }
}

@Module({
  controllers: [CareController, CareRecordController],
  providers: [CareService],
  imports: [ClaimsModule],
})
export class CareModule {}

import { BadRequestException, Body, Controller, Delete, Get, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditInterceptor } from '../../common/audit.interceptor';
import { Public } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard, RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { UseInterceptors } from '@nestjs/common';

const beneficiaryRulesSchema = z.object({
  spouse: z.boolean().default(true),
  childMaxAge: z.number().int().min(0).max(30).default(21),
  otherAllowed: z.boolean().default(false),
  maxBeneficiaries: z.number().int().min(0).max(15).default(6),
});

const productBaseSchema = z
  .object({    code: z.string().min(2).max(20).regex(/^[A-Z0-9_-]+$/),
    name: z.string().min(2).max(80),
    description: z.string().max(2000).optional(),
    clientType: z.enum(['INDIVIDUAL', 'COMPANY']).default('INDIVIDUAL'),
    minAge: z.number().int().min(0).max(100).default(0),
    maxAge: z.number().int().min(0).max(100).default(65),
    basePremiumAnnual: z.number().int().min(0),
    pricePerAdditionalAdultAnnual: z.number().int().min(0).default(0),
    pricePerChildAnnual: z.number().int().min(0).default(0),
    frequencyFactors: z.record(z.number()).optional(),
    waitingPeriodDays: z.number().int().min(0).max(365).default(0),
    eligibilityConditions: z.string().max(2000).optional(),
    renewalConditions: z.string().max(2000).optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
    sortOrder: z.number().int().default(0),
    thirdPartyAuthThreshold: z.number().int().min(0).nullable().optional(),
    insurerPartnerId: z.string().optional().nullable(),
    beneficiaryRules: beneficiaryRulesSchema.default(beneficiaryRulesSchema.parse({})),
    guarantees: z
      .array(
        z.object({
          guaranteeId: z.string(),
          annualLimit: z.number().int().nullable(),
          rate: z.number().int().min(0).max(100),
          deductibleType: z.enum(['NONE', 'FIXED', 'PERCENT']).default('NONE'),
          deductibleValue: z.number().int().min(0).default(0),
        }),
      )
      .optional(),
    exclusions: z.array(z.object({ categoryId: z.string().optional(), description: z.string() })).optional(),
  });

const productSchema = productBaseSchema.superRefine((p, ctx) => {
  if (p.maxAge < p.minAge) ctx.addIssue({ code: 'custom', message: 'maxAge < minAge' });
});

const guaranteeCatalogSchema = z.object({
  code: z.string().regex(/^[A-Z0-9_-]{2,40}$/),
  name: z.string().min(2).max(80),
  category: z.string().min(2).max(60),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

const partnerSchema = z.object({
  name: z.string().min(2),
  kind: z.enum(['INSURER', 'MUTUAL']).default('INSURER'),
  agreementNumber: z.string().optional(),
  contactEmail: z.string().email().optional(),
  phone: z.string().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).default('ACTIVE'),
  notes: z.string().max(500).optional(),
});

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  listPublic(clientType?: string) {
    return this.prisma.product.findMany({
      where: { status: 'ACTIVE', ...(clientType ? { clientType } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { basePremiumAnnual: 'asc' }],
      include: {
        guarantees: { include: { guarantee: true }, orderBy: { id: 'asc' } },
        exclusions: true,
        insurerPartner: { select: { name: true, kind: true } },
      },
    });
  }

  async getForAdmin(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        guarantees: { include: { guarantee: true } },
        exclusions: true,
        insurerPartner: { select: { name: true, kind: true } },
        _count: { select: { contracts: true } },
      },
    });
    if (!p) throw new BadRequestException('Produit introuvable');
    return p;
  }

  async create(dto: any) {
    await this.assertCodeFree(dto.code);
    const { guarantees, exclusions, frequencyFactors, beneficiaryRules, ...rest } = dto;
    return this.prisma.$transaction(async tx => {
      const product = await tx.product.create({
        data: {
          ...rest,
          ...(beneficiaryRules ? { beneficiaryRules: typeof beneficiaryRules === 'string' ? beneficiaryRules : JSON.stringify(beneficiaryRules) } : {}),
          frequencyFactors: JSON.stringify(frequencyFactors ?? { ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.06 }),
        },
      });
      if (guarantees?.length)
        await tx.productGuarantee.createMany({
          data: guarantees.map((g: any) => ({ ...g, productId: product.id })),
        });
      if (exclusions?.length)
        await tx.productExclusion.createMany({ data: exclusions.map((e: any) => ({ ...e, productId: product.id })) });
      return product.id;
    });
  }

  async update(id: string, dto: any) {
    await this.getForAdmin(id);
    const { guarantees, exclusions, frequencyFactors, beneficiaryRules, code, ...rest } = dto;
    return this.prisma.$transaction(async tx => {
      if (code && code !== (await tx.product.findUnique({ where: { id } }))!.code) await this.assertCodeFree(code);
      const product = await tx.product.update({
        where: { id },
        data: {
          ...rest,
          ...(code ? { code } : {}),
          ...(beneficiaryRules ? { beneficiaryRules: typeof beneficiaryRules === 'string' ? beneficiaryRules : JSON.stringify(beneficiaryRules) } : {}),
          ...(frequencyFactors ? { frequencyFactors: JSON.stringify(frequencyFactors) } : {}),
        },
      });
      if (guarantees !== undefined) {
        await tx.productGuarantee.deleteMany({ where: { productId: id } });
        if (guarantees.length)
          await tx.productGuarantee.createMany({ data: guarantees.map((g: any) => ({ ...g, productId: id })) });
      }
      if (exclusions !== undefined) {
        await tx.productExclusion.deleteMany({ where: { productId: id } });
        if (exclusions.length)
          await tx.productExclusion.createMany({ data: exclusions.map((e: any) => ({ ...e, productId: id })) });
      }
      return product;
    });
  }

  private async assertCodeFree(code: string) {
    const existing = await this.prisma.product.findUnique({ where: { code } });
    if (existing) throw new BadRequestException(`Le code produit ${code} existe déjà`);
  }

  catalog() {
    return this.prisma.guarantee.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  createCatalogItem(dto: any) {
    return this.prisma.guarantee.create({ data: dto });
  }

  async updateCatalogItem(id: string, dto: any) {
    await this.prisma.guarantee.update({ where: { id }, data: dto });
    return { ok: true };
  }

  partners() {
    return this.prisma.insurerPartner.findMany({ orderBy: { createdAt: 'desc' } });
  }

  createPartner(dto: any) {
    return this.prisma.insurerPartner.create({ data: dto });
  }

  updatePartner(id: string, dto: any) {
    return this.prisma.insurerPartner.update({ where: { id }, data: dto });
  }
}

@Controller()
@UseInterceptors(AuditInterceptor)
export class ProductsController {
  constructor(
    private products: ProductsService,
    private prisma: PrismaService,
  ) {}

  @Public()
  @Get('products')
  listPublic(@Query('clientType') clientType?: string) {
    return this.products.listPublic(clientType);
  }

  @Get('admin/products')
  @RequirePermissions('products.manage')
  adminList(@Query('status') status?: string, @Query('clientType') clientType?: string) {
    return this.prisma.product.findMany({
      where: { ...(status ? { status } : {}), ...(clientType ? { clientType } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { basePremiumAnnual: 'asc' }],
      include: {
        insurerPartner: { select: { name: true } },
        _count: { select: { contracts: true, guarantees: true, exclusions: true } },
      },
    });
  }

  @Get('admin/products/:id')
  @RequirePermissions('products.manage')
  detail(@Param('id') id: string) {
    return this.products.getForAdmin(id);
  }

  @Post('admin/products')
  @RequirePermissions('products.manage')
  create(@Body(new ZodPipe(productSchema)) dto: any) {
    return this.products.create(dto);
  }

  @Patch('admin/products/:id')
  @RequirePermissions('products.manage')
  update(@Param('id') id: string, @Body(new ZodPipe(productBaseSchema.partial())) dto: any) {
    return this.products.update(id, dto);
  }

  @Get('admin/guarantees')
  @RequirePermissions('products.manage')
  catalogItems() {
    return this.products.catalog();
  }

  @Post('admin/guarantees')
  @RequirePermissions('products.manage')
  createCatalogItem(@Body(new ZodPipe(guaranteeCatalogSchema)) dto: any) {
    return this.products.createCatalogItem(dto);
  }

  @Patch('admin/guarantees/:id')
  @RequirePermissions('products.manage')
  updateCatalogItem(@Param('id') id: string, @Body(new ZodPipe(guaranteeCatalogSchema.partial())) dto: any) {
    return this.products.updateCatalogItem(id, dto);
  }

  @Get('admin/partners')
  @RequirePermissions('partners.manage', 'products.manage')
  partnerList() {
    return this.products.partners();
  }

  @Post('admin/partners')
  @RequirePermissions('partners.manage')
  createPartner(@Body(new ZodPipe(partnerSchema)) dto: any) {
    return this.products.createPartner(dto);
  }

  @Patch('admin/partners/:id')
  @RequirePermissions('partners.manage')
  updatePartner(@Param('id') id: string, @Body(new ZodPipe(partnerSchema.partial())) dto: any) {
    return this.products.updatePartner(id, dto);
  }
}

@Module({ controllers: [ProductsController], providers: [ProductsService] })
export class ProductsModule {}

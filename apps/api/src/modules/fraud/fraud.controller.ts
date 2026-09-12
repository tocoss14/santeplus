import { BadRequestException, Body, Controller, Get, Module, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditInterceptor, UseInterceptors } from '../../common/audit.interceptor';
import { RequirePermissions } from '../../common/guards/permissions.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';

const FRAUD_STATUSES = ['OPEN', 'REVIEWING', 'CONFIRMED', 'DISMISSED'] as const;
const FRAUD_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['REVIEWING', 'DISMISSED'],
  REVIEWING: ['OPEN', 'CONFIRMED', 'DISMISSED'],
  CONFIRMED: ['OPEN'],
  DISMISSED: ['OPEN'],
};

function parseLinkedAuditIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => String(item));
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : [];
  } catch {
    return [];
  }
}

function mapFraudCase(fraudCase: any) {
  const holder = fraudCase.contract?.principalUser;
  return {
    id: fraudCase.id,
    caseNumber: `FRA-${new Date(fraudCase.createdAt).getFullYear()}-${fraudCase.id.slice(-6).toUpperCase()}`,
    kind: fraudCase.kind,
    status: fraudCase.status,
    note: fraudCase.note,
    createdAt: fraudCase.createdAt,
    updatedAt: fraudCase.updatedAt,
    contract: fraudCase.contract
      ? {
          id: fraudCase.contract.id,
          number: fraudCase.contract.number,
          holder: holder ? `${holder.firstName} ${holder.lastName}` : null,
          memberNumber: holder?.memberNumber ?? null,
        }
      : null,
    provider: fraudCase.provider
      ? { id: fraudCase.provider.id, name: fraudCase.provider.name }
      : null,
    linkedAuditIds: parseLinkedAuditIds(fraudCase.linkedAuditIds),
  };
}

const listSchema = z.object({
  status: z.enum(FRAUD_STATUSES).optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const reviewSchema = z.object({
  status: z.enum(FRAUD_STATUSES),
  note: z.string().max(1000).optional(),
});

@Controller('admin/fraud')
@UseInterceptors(AuditInterceptor)
export class FraudController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequirePermissions('claims.viewAll')
  async list(@Query(new ZodPipe(listSchema)) query: any) {
    const where: any = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.OR = [
        { kind: { contains: query.q } },
        { note: { contains: query.q } },
        { contract: { number: { contains: query.q } } },
        { provider: { name: { contains: query.q } } },
      ];
    }
    const take = 20;
    const [items, total] = await Promise.all([
      this.prisma.fraudCase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * take,
        take,
        include: {
          contract: {
            select: {
              id: true,
              number: true,
              principalUser: { select: { firstName: true, lastName: true, memberNumber: true } },
            },
          },
          provider: { select: { id: true, name: true } },
        },
      }),
      this.prisma.fraudCase.count({ where }),
    ]);
    return {
      items: items.map(mapFraudCase),
      total,
      page: query.page,
      pages: Math.max(1, Math.ceil(total / take)),
    };
  }

  @Get(':id')
  @RequirePermissions('claims.viewAll')
  async detail(@Param('id') id: string) {
    const fraudCase = await this.prisma.fraudCase.findUnique({
      where: { id },
      include: {
        contract: {
          select: {
            id: true,
            number: true,
            principalUser: { select: { firstName: true, lastName: true, memberNumber: true } },
          },
        },
        provider: { select: { id: true, name: true } },
      },
    });
    if (!fraudCase) throw new NotFoundException('Dossier fraude introuvable');
    return mapFraudCase(fraudCase);
  }

  @Post(':id/review')
  @RequirePermissions('claims.decide')
  async review(@Param('id') id: string, @Body(new ZodPipe(reviewSchema)) dto: any) {
    const fraudCase = await this.prisma.fraudCase.findUnique({ where: { id } });
    if (!fraudCase) throw new NotFoundException('Dossier fraude introuvable');
    if (!FRAUD_TRANSITIONS[fraudCase.status]?.includes(dto.status)) {
      throw new BadRequestException(`Transition impossible depuis ${fraudCase.status}`);
    }
    const updated = await this.prisma.fraudCase.update({
      where: { id },
      data: {
        status: dto.status,
        note: dto.note ?? fraudCase.note,
      },
      include: {
        contract: {
          select: {
            id: true,
            number: true,
            principalUser: { select: { firstName: true, lastName: true, memberNumber: true } },
          },
        },
        provider: { select: { id: true, name: true } },
      },
    });
    return mapFraudCase(updated);
  }
}

@Module({
  controllers: [FraudController],
  providers: [],
})
export class FraudModule {}

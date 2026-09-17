import { Body, Controller, Get, Injectable, Module, NotFoundException, Post } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../common/guards/jwt-auth.guard';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { PrismaService } from '../../common/prisma.module';
import { estimateClaim, CoverageRule, ClaimItemInput, EstimationResult } from '../../domain/engine';

/**
 * Simulateur de prise en charge (zéro divergence affichage/moteur).
 *
 * Au lieu de recalculer un « net estimé » côté client (formule locale, risque
 * de dérive avec les règles réelles), le front envoie ici un panier de soins
 * fictif et reçoit la sortie du MÊME moteur que les sinistres (`estimateClaim`,
 * domaine/engine.ts) : taux, ticket modérateur, barème (maxUnitPrice),
 * plafonds par catégorie, plafond global et plafond RAC.
 *
 * Le contrat est virtuel (jamais persisté) : il porte les garanties du produit
 * avec les taux/plafonds par défaut, statut ACTIVE, sans historique consommé.
 * `careDate` est forcé au lendemain de la carence pour neutraliser WAITING_PERIOD
 * (l'estimation illustre la couverture, pas l'éligibilité calendaire).
 */

const estimateSchema = z.object({
  productId: z.string().min(5),
  careDate: z.coerce.date().optional(),
  items: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        label: z.string().max(120).optional(),
        amountRequested: z.number().int().min(1).max(100_000_000),
      }),
    )
    .min(1)
    .max(30),
});

@Injectable()
@Injectable()
export class QuoteService {
  constructor(private prisma: PrismaService) {}

  async estimate(dto: z.infer<typeof estimateSchema>): Promise<EstimationResult> {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      include: { guarantees: { include: { guarantee: true } }, exclusions: true },
    });
    if (!product || (product as any).status !== 'ACTIVE') throw new NotFoundException('Produit introuvable');

    const rules: CoverageRule[] = product.guarantees.map((pg: any) => ({
      categoryId: pg.guarantee.category,
      categoryName: pg.guarantee.name,
      annualLimit: pg.annualLimit,
      familyLimit: pg.familyLimit ?? null,
      rate: pg.rate ?? pg.minRate ?? 50,
      copayRate: pg.copayRate ?? 15,
      maxUnitPrice: pg.maxUnitPrice ?? null,
    }));
    const excludedCategories = product.exclusions
      .filter((e: any) => e.categoryId)
      .map((e: any) => e.categoryId);

    const waitingPeriodDays = product.waitingPeriodDays ?? 0;
    const startDate = dto.careDate ? new Date(dto.careDate) : new Date();
    startDate.setDate(startDate.getDate() - (waitingPeriodDays + 1));

    return estimateClaim(
      {
        contractStatus: 'ACTIVE',
        startDate,
        endDate: new Date('9999-12-31'),
        waitingPeriodDays,
        excludedCategories,
        rules,
        usedPerCategory: {},
        usedGlobal: 0,
        usedOop: 0,
      },
      dto.careDate ? new Date(dto.careDate) : new Date(),
      dto.items as ClaimItemInput[],
      false,
    );
  }
  async categories() {
    const guarantees = await this.prisma.guarantee.findMany({
      where: { active: true },
      select: { category: true, name: true },
      orderBy: { sortOrder: 'asc' },
      distinct: ['category'],
    });
    return guarantees;
  }
}

@Controller('quote')
export class QuoteController {
  constructor(private quote: QuoteService) {}

  @Public()
  @Post('estimate')
  estimate(@Body(new ZodPipe(estimateSchema)) dto: z.infer<typeof estimateSchema>) {
    return this.quote.estimate(dto);
  }

  @Public()
  @Get('estimate/categories')
  categories() {
    // Catégories disponibles pour composer un panier de soins (référentiel actif).
    return this.quote.categories();
  }
}

@Module({
  controllers: [QuoteController],
  providers: [QuoteService],
})
export class QuoteModule {}

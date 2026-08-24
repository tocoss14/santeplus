import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { computeQuote, buildSchedule, Frequency, QuotePerson } from '../../domain/engine';
import { ref, memberNumber, secureToken, startOfDay } from '../../common/utils';

export interface BeneficiaryDraft {
  firstName: string;
  lastName: string;
  birthDate: Date;
  gender: 'M' | 'F';
  relation: 'SPOUSE' | 'CHILD' | 'OTHER';
}

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  private parseProduct(product: any) {
    return {
      basePremiumAnnual: product.basePremiumAnnual,
      pricePerAdditionalAdultAnnual: product.pricePerAdditionalAdultAnnual,
      pricePerChildAnnual: product.pricePerChildAnnual,
      frequencyFactors: JSON.parse(product.frequencyFactors || '{}'),
      minAge: product.minAge,
      maxAge: product.maxAge,
      waitingPeriodDays: product.waitingPeriodDays,
      beneficiaryRules: JSON.parse(product.beneficiaryRules || '{}'),
    };
  }

  async quote(productId: string, principalBirthDate: Date, beneficiaries: BeneficiaryDraft[], frequency: Frequency) {
    const product = await this.getActiveProduct(productId);
    const persons: QuotePerson[] = [
      { birthDate: principalBirthDate, relation: 'PRINCIPAL' },
      ...beneficiaries.map(b => ({ birthDate: b.birthDate, relation: b.relation })),
    ];
    const { errors, quote } = computeQuote(this.parseProduct(product), persons, frequency);
    if (errors.length) throw new BadRequestException({ message: errors[0], errors });
    return { product: { id: product.id, name: product.name, code: product.code }, quote };
  }

  async quoteForUser(userId: string, productId: string, frequency: Frequency, beneficiaries: { birthDate: Date; relation: string }[]) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.birthDate) throw new BadRequestException('Renseignez votre date de naissance dans votre profil avant de simuler');
    return this.quote(productId, user.birthDate, beneficiaries as BeneficiaryDraft[], frequency);
  }

  async validateBeneficiaryRules(productId: string, existingCount: number, draft: BeneficiaryDraft) {
    const product = await this.getActiveProduct(productId);
    const rules = JSON.parse(product.beneficiaryRules || '{}') as { spouse?: boolean; childMaxAge?: number; otherAllowed?: boolean; maxBeneficiaries?: number };
    if (rules.maxBeneficiaries != null && existingCount >= rules.maxBeneficiaries)
      throw new BadRequestException(`Nombre maximum d'ayants droit atteint (${rules.maxBeneficiaries})`);
    if (draft.relation === 'SPOUSE' && rules.spouse === false) throw new BadRequestException('Ce produit ne couvre pas le conjoint');
    if (draft.relation === 'OTHER' && rules.otherAllowed !== true) throw new BadRequestException('Ce produit ne permet pas les autres ayants droit');
    if (draft.relation === 'CHILD') {
      const childMax = rules.childMaxAge ?? 21;
      const age = Math.floor((Date.now() - new Date(draft.birthDate).getTime()) / (365.25 * 86400000));
      if (age >= childMax) throw new BadRequestException(`Un enfant doit avoir moins de ${childMax} ans`);
    }
    return true;
  }

  async subscribeIndividual(
    userId: string,
    productId: string,
    frequency: Frequency,
    beneficiaries: BeneficiaryDraft[],
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.birthDate) throw new BadRequestException('Renseignez votre date de naissance dans votre profil avant de souscrire');

    const activeContract = await this.prisma.contract.findFirst({
      where: { principalUserId: userId, status: { in: ['ACTIVE', 'PENDING_PAYMENT', 'DRAFT', 'SUSPENDED'] }, kind: 'INDIVIDUAL' },
    });
    if (activeContract) throw new BadRequestException('Vous avez déjà un contrat en cours ou en attente de paiement');

    const product = await this.getActiveProduct(productId);
    if (product.clientType !== 'INDIVIDUAL') throw new BadRequestException('Produit réservé aux entreprises');

    const rules = JSON.parse(product.beneficiaryRules || '{}') as {
      spouse?: boolean;
      childMaxAge?: number;
      otherAllowed?: boolean;
      maxBeneficiaries?: number;
    };
    if (rules.maxBeneficiaries != null && beneficiaries.length > rules.maxBeneficiaries)
      throw new BadRequestException(`Nombre maximum d'ayants droit : ${rules.maxBeneficiaries}`);
    if (beneficiaries.some(b => b.relation === 'SPOUSE') && rules.spouse === false)
      throw new BadRequestException('Ce produit ne couvre pas le conjoint');
    if (beneficiaries.some(b => b.relation === 'OTHER') && rules.otherAllowed !== true)
      throw new BadRequestException('Ce produit ne permet pas les autres ayants droit');
    if (beneficiaries.filter(b => b.relation === 'SPOUSE').length > 1)
      throw new BadRequestException("Un seul conjoint est autorisé");
    for (const b of beneficiaries) {
      if (b.relation === 'CHILD') {
        const childMax = rules.childMaxAge ?? 21;
        const age = Math.floor((Date.now() - new Date(b.birthDate).getTime()) / (365.25 * 86400000));
        if (age >= childMax) throw new BadRequestException(`Enfant ${b.firstName} : doit avoir moins de ${childMax} ans`);
      }
      if (!b.firstName || !b.lastName) throw new BadRequestException('Nom et prénom requis pour chaque ayant droit');
    }
    const { errors, quote } = computeQuote(
      this.parseProduct(product),
      [{ birthDate: user.birthDate, relation: 'PRINCIPAL' }, ...beneficiaries.map(b => ({ birthDate: b.birthDate, relation: b.relation }))],
      frequency,
    );
    if (errors.length || !quote) throw new BadRequestException({ message: errors[0] ?? 'Devis invalide', errors });

    const today = startOfDay(new Date());
    const schedule = buildSchedule(quote.totalAnnual, frequency, today);

    const contract = await this.prisma.$transaction(async tx => {
      const created = await tx.contract.create({
        data: {
          number: ref('CTR'),
          kind: 'INDIVIDUAL',
          status: 'PENDING_PAYMENT',
          principalUserId: userId,
          productId,
          insurerPartnerId: product.insurerPartnerId,
          premiumAnnual: quote.totalAnnual,
          frequency,
          quote: JSON.stringify(quote),
          cardToken: secureToken(16),
        },
      });
      if (beneficiaries.length) {
        await tx.beneficiary.createMany({
          data: beneficiaries.map(b => ({
            contractId: created.id,
            firstName: b.firstName,
            lastName: b.lastName,
            birthDate: b.birthDate,
            gender: b.gender,
            relation: b.relation,
            memberNumber: memberNumber(),
          })),
        });
      }
      await tx.contribution.createMany({
        data: schedule.map(s => ({ contractId: created.id, sequence: s.sequence, dueDate: s.dueDate, amount: s.amount })),
      });
      return created;
    });

    return {
      contractId: contract.id,
      number: contract.number,
      quote,
      contributions: schedule,
      firstPayment: schedule[0],
    };
  }

  async subscribeCompany(companyAdminUserId: string, productId: string, employeesCount: number, frequency: Frequency) {
    const admin = await this.prisma.user.findUnique({ where: { id: companyAdminUserId } });
    if (!admin?.companyId) throw new ForbiddenException('Compte entreprise requis');
    const company = await this.prisma.company.findUnique({ where: { id: admin.companyId } });
    if (!company || company.status !== 'ACTIVE') throw new BadRequestException('Entreprise non active');
    const existingGroup = await this.prisma.contract.findFirst({
      where: { companyId: company.id, kind: 'GROUP', status: { in: ['ACTIVE', 'PENDING_PAYMENT', 'DRAFT'] } },
    });
    if (existingGroup) throw new BadRequestException('Un contrat collectif existe déjà pour cette entreprise');

    const product = await this.getActiveProduct(productId);
    if (product.clientType !== 'COMPANY') throw new BadRequestException('Produit individuel sélectionné pour une souscription collective');
    if (!Number.isInteger(employeesCount) || employeesCount < 1 || employeesCount > 5000)
      throw new BadRequestException('Nombre de salariés invalide (1 à 5000)');

    const parsed = this.parseProduct(product);
    const totalAnnual =
      employeesCount * parsed.pricePerAdditionalAdultAnnual;
    const factor = parsed.frequencyFactors[frequency] ?? 1;
    const total = Math.round((totalAnnual * factor) / 5) * 5;
    const quote = {
      lines: [{ label: `Salariés assurés (${employeesCount})`, amount: total }],
      subtotalAnnual: totalAnnual,
      frequency,
      factor,
      totalAnnual: total,
      periods: frequency === 'MONTHLY' ? 12 : frequency === 'QUARTERLY' ? 4 : 1,
      periodicAmount: 0,
      currency: 'XOF',
    };
    quote.periodicAmount = Math.ceil(total / quote.periods);

    const today = startOfDay(new Date());
    const schedule = buildSchedule(total, frequency, today);

    const contract = await this.prisma.$transaction(async tx => {
      const created = await tx.contract.create({
        data: {
          number: ref('CTR'),
          kind: 'GROUP',
          status: 'PENDING_PAYMENT',
          companyId: company.id,
          principalUserId: admin.id,
          productId,
          insurerPartnerId: product.insurerPartnerId,
          premiumAnnual: total,
          frequency,
          quote: JSON.stringify({ ...quote, employeesCount }),
          cardToken: secureToken(16),
        },
      });
      await tx.contribution.createMany({
        data: schedule.map(s => ({ contractId: created.id, sequence: s.sequence, dueDate: s.dueDate, amount: s.amount })),
      });
      return created;
    });

    return { contractId: contract.id, number: contract.number, quote, contributions: schedule, firstPayment: schedule[0] };
  }

  private async getActiveProduct(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Produit introuvable');
    if (product.status !== 'ACTIVE') throw new BadRequestException('Produit non disponible');
    return product;
  }
}

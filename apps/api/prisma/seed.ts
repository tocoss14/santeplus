import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  INSURANCE_MANAGER: [
    'members.read', 'members.manage', 'companies.read', 'providers.read', 'providers.manage',
    'contracts.viewAll', 'contracts.manage', 'claims.viewAll', 'claims.decide',
    'payments.viewAll', 'payments.manage', 'stats.admin',
  ],
  SUPPORT_AGENT: ['members.read', 'providers.read', 'claims.viewAll', 'contracts.viewAll'],
  COMPANY_ADMIN: ['company.dashboard', 'company.employees.manage', 'company.claims.view', 'company.contracts.manage'],
  MEMBER: [],
  PROVIDER: ['provider.verify', 'provider.thirdparty', 'provider.staff', 'provider.prescribe', 'provider.emergencyOverride'],
};

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

function date(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

async function main() {
  console.log('Suppression des donnÃ©es existantesâ€¦');
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.beneficiaryChange.deleteMany(),
    prisma.claimDocument.deleteMany(),
    prisma.claimItem.deleteMany(),
    prisma.claim.deleteMany(),
    prisma.careRecordEvent.deleteMany(),
    prisma.careRecord.deleteMany(),
    prisma.deliveryLine.deleteMany(),
    prisma.delivery.deleteMany(),
    prisma.prescriptionLine.deleteMany(),
    prisma.prescription.deleteMany(),
    prisma.consultation.deleteMany(),
    prisma.medication.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.contribution.deleteMany(),
    prisma.fileObject.deleteMany(),
    prisma.beneficiary.deleteMany(),
    prisma.commission.deleteMany(),
    prisma.performanceBonus.deleteMany(),
    prisma.contract.updateMany({ data: { groupContractId: null } }),
    prisma.contract.deleteMany(),
    prisma.productExclusion.deleteMany(),
    prisma.productGuarantee.deleteMany(),
    prisma.product.deleteMany(),
    prisma.guarantee.deleteMany(),
    prisma.insurerPartner.deleteMany(),
    prisma.provider.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.distributor.deleteMany(),
    prisma.accountingEntry.deleteMany(),
    prisma.account.deleteMany(),
    prisma.journal.deleteMany(),
    prisma.branch.deleteMany(),
    prisma.disease.deleteMany(),
    prisma.user.deleteMany(),
    prisma.company.deleteMany(),
    prisma.act.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.systemConfig.deleteMany(),
  ]);

  const password = await bcrypt.hash('Demo1234!', 10);

  await prisma.systemConfig.createMany({
    data: [
      { key: 'graceDays', value: '15' },
      { key: 'suspendAfterOverdueDays', value: '45' },
      { key: 'expiryReminders', value: '[30,15,7]' },
      { key: 'thirdPartyAuthThreshold', value: '150000' },
      { key: 'renewalAlertThreshold', value: '4' },
      { key: 'adhesionFeePerPerson', value: '3000' },
      { key: 'adhesionFeeEnterpriseCap', value: '100000' },
      { key: 'retention.enabled', value: 'true' },
      { key: 'retention.careRecordDays', value: '3650' },
      { key: 'retention.auditDays', value: '1095' },
      { key: 'retention.invoiceDays', value: '3650' },
      { key: 'appName', value: '"SantÃ©Plus BÃ©nin"' },
      { key: 'platformRole', value: '"Plateforme technologique â€” le risque est portÃ© par un assureur/mutuelle partenaire agrÃ©Ã©."' },
    ],
  });

  for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    if (role === 'SUPER_ADMIN') continue;
    await prisma.rolePermission.createMany({ data: keys.map(permissionKey => ({ role, permissionKey })) });
  }
  console.log('RÃ´les et configuration OK');

  // Branches & plan comptable OHADA
  const branchMal = await prisma.branch.create({ data: { code: 'MAL', name: 'Maladie', description: 'Assurance maladie / santé', sortOrder: 1 } });
  await prisma.branch.createMany({
    data: [
      { code: 'PREV', name: 'Prévoyance', description: 'Décès, invalidité', sortOrder: 2 },
      { code: 'MAT', name: 'Maternité', description: 'Maternité isolée', sortOrder: 3 },
    ],
    skipDuplicates: true,
  });
  await prisma.journal.createMany({
    data: [{ code: 'OD', name: 'Opérations diverses' }, { code: 'BQ', name: 'Banque' }],
    skipDuplicates: true,
  });
  await prisma.account.createMany({
    data: [
      { code: '702100', name: 'Primes émises — Santé', type: 'REVENUE', sortOrder: 1 },
      { code: '603100', name: 'Sinistres payés — Santé', type: 'EXPENSE', sortOrder: 2 },
      { code: '395000', name: 'Provisions sinistres à payer', type: 'PROVISION', sortOrder: 3 },
      { code: '512000', name: 'Banque', type: 'ASSET', sortOrder: 4 },
      { code: '411100', name: 'Assurés — créances primes', type: 'ASSET', sortOrder: 5 },
      { code: '401100', name: 'Prestataires — dettes sinistres', type: 'LIABILITY', sortOrder: 6 },
      { code: '706100', name: 'Frais d’adhésion', type: 'REVENUE', sortOrder: 7 },
    ],
    skipDuplicates: true,
  });
  await prisma.disease.createMany({
    data: [
      { code: 'B54', name: 'Paludisme, sans précision', category: 'Infectieux' },
      { code: 'A09', name: 'Diarrhée et gastro-entérite', category: 'Infectieux' },
      { code: 'J06', name: 'Infection aiguë des voies respiratoires', category: 'Respiratoire' },
      { code: 'I10', name: 'Hypertension essentielle', category: 'Cardio' },
      { code: 'E11', name: 'Diabète sucré type 2', category: 'Métabolique' },
      { code: 'O80', name: 'Accouchement unique spontané', category: 'Maternité' },
      { code: 'K02', name: 'Carie dentaire', category: 'Dentaire' },
      { code: 'H52', name: 'Troubles de la réfraction (optique)', category: 'Optique' },
      { code: 'S09', name: 'Lésion traumatique tête', category: 'Trauma' },
      { code: 'N39', name: 'Infection urinaire', category: 'Uro' },
    ],
    skipDuplicates: true,
  });
  console.log('Branches, plan comptable et maladies OK');

  const guaranteesData = [
    { code: 'HOSP', name: 'Hospitalisation', category: 'HOSPITALIZATION', sortOrder: 1, basePrice: 25000 },
    { code: 'CONS', name: 'Consultations', category: 'CONSULTATION', sortOrder: 2, basePrice: 8000 },
    { code: 'PHAR', name: 'Pharmacie', category: 'PHARMACY', sortOrder: 3, basePrice: 12000 },
    { code: 'LABO', name: 'Analyses & imagerie', category: 'LABORATORY', sortOrder: 4, basePrice: 10000 },
    { code: 'SPEC', name: 'Soins spÃ©cialisÃ©s', category: 'SPECIALIZED', sortOrder: 5, basePrice: 15000 },
    { code: 'MAT', name: 'MaternitÃ©', category: 'MATERNITY', sortOrder: 6, basePrice: 18000 },
    { code: 'DENT', name: 'Soins dentaires', category: 'DENTAL', sortOrder: 7, basePrice: 6000 },
    { code: 'OPT', name: 'Optique', category: 'OPTICAL', sortOrder: 8, basePrice: 5000 },
  ];
  const guarantees: Record<string, string> = {};
  for (const g of guaranteesData) {
    const created = await prisma.guarantee.create({ data: g });
    guarantees[g.category] = created.id;
  }

  const partnerA = await prisma.insurerPartner.create({
    data: { name: 'Assurance Partenaire SA', kind: 'INSURER', agreementNumber: 'CONV-2026-001', contactEmail: 'partenaire@assurance-bj.example', phone: '+229 21 30 00 01' },
  });
  const partnerB = await prisma.insurerPartner.create({
    data: { name: 'Mutuelle SantÃ© ZÃ©midjan', kind: 'MUTUAL', agreementNumber: 'CONV-2026-002', contactEmail: 'contact@mutuelle-zem.example', phone: '+229 21 30 00 02' },
  });

  async function createProduct(data: any) {
    const { guarantees: gs, exclusions, ...rest } = data;
    if (!rest.branchId) rest.branchId = branchMal.id;
    return prisma.product.create({
      data: {
        ...rest,
        beneficiaryRules: typeof rest.beneficiaryRules === 'string' ? rest.beneficiaryRules : JSON.stringify(rest.beneficiaryRules),
        ageLoadings: typeof rest.ageLoadings === 'string' ? rest.ageLoadings : JSON.stringify(rest.ageLoadings ?? []),
        eligibilityConditions: typeof rest.eligibilityConditions === 'string' ? rest.eligibilityConditions : JSON.stringify(rest.eligibilityConditions ?? null),
        frequencyFactors: typeof rest.frequencyFactors === 'string' ? rest.frequencyFactors : JSON.stringify(rest.frequencyFactors ?? { ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.06 }),
        guarantees: {
          create: gs.map((g: any) => ({
            guaranteeId: guarantees[g.category],
            annualLimit: g.limit ?? null,
            rate: g.rate,
            minRate: g.minRate ?? 50,
            maxRate: g.maxRate ?? 95,
            minLimit: g.minLimit ?? 0,
            maxLimit: g.maxLimit ?? (g.limit ? g.limit * 2 : 10000000),
            limitStep: g.limitStep ?? 50000,
            pricePerLimitStep: g.pricePerLimitStep ?? 0,
            deductibleType: g.deductibleType ?? 'NONE',
            deductibleValue: g.deductibleValue ?? 0,
            copayRate: g.copayRate ?? 15,
            mandatory: g.mandatory ?? true,
            customizable: g.customizable ?? false,
          })),
        },
        exclusions: { create: (exclusions ?? []).map((e: any) => ({ categoryId: e.categoryId ? guarantees[e.categoryId] : null, description: e.description })) },
      },
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // FORMULES v2.0 — Équilibre Technique Bénin
  // Objectif : résultat technique positif via tickets modérateurs,
  // plafonds stricts par acte, délais de carence et entente préalable.
  // ═══════════════════════════════════════════════════════════════════

  // --- Formule 1 : Santé Essentielle (6 000 FCFA/mois) ---
  // Gestion du risque de base. Pas de maternité/optique/dentaire.
  // Ticket modérateur fort (30%) pour freiner la surconsommation.
  const prodEssentielle = await createProduct({
    code: 'ESS', name: 'Santé Essentielle', clientType: 'INDIVIDUAL', status: 'ACTIVE', sortOrder: 1,
    description: "Gestion du risque de base : consultations, pharmacie, analyses et hospitalisation courte. Ticket modérateur de 30% pour responsabiliser l'assuré.",
    minAge: 0, maxAge: 65, waitingPeriodDays: 30,
    basePremiumAnnual: 72000, // 6 000 FCFA/mois
    pricePerAdditionalAdultAnnual: 48000, // 4 000 FCFA/mois par conjoint/adulte
    pricePerChildAnnual: 48000, // 4 000 FCFA/mois par enfant
    thirdPartyAuthThreshold: 120000,
    globalAnnualCap: 500000, // Plafond annuel global par assuré
    ageLoadings: [
      { minAge: 0, maxAge: 30, factor: 1.0 },
      { minAge: 31, maxAge: 45, factor: 1.1 },
      { minAge: 46, maxAge: 55, factor: 1.25 },
      { minAge: 56, maxAge: 65, factor: 1.4 },
    ],
    insurerPartnerId: partnerB.id,
    beneficiaryRules: { spouse: true, childMaxAge: 21, otherAllowed: false, maxBeneficiaries: 6 },
    eligibilityConditions: JSON.stringify({
      waitingPeriodDays: { default: 30, hospitalization: 90, maternity: null }, // Maternité non couverte
      copayRate: 30, // Ticket modérateur 30% sur tous les actes
      perActCap: { CONSULTATION: 10000, SPECIALIST: 12000 }, // Plafond par acte
      specialistConsultationsPerYear: 3, // Max 3 consultations spécialiste/an
    }),
    guarantees: [
      // Hospitalisation : 60%, plafond 150 000 FCFA/an, maxUnitPrice 45 000/jour
      { category: 'HOSPITALIZATION', limit: 150000, rate: 60, minRate: 60, maxRate: 60, minLimit: 150000, maxLimit: 150000, limitStep: 0, customizable: false, copayRate: 40, deductibleType: 'FIXED', deductibleValue: 10000, maxUnitPrice: 45000 },
      // Consultation généraliste : 70%, plafond par acte 10 000 FCFA
      { category: 'CONSULTATION', limit: 100000, rate: 70, minRate: 70, maxRate: 70, minLimit: 100000, maxLimit: 100000, limitStep: 0, customizable: false, copayRate: 30, maxUnitPrice: 10000 },
      // Pharmacie : 60%, plafond 15 000 FCFA/mois (180 000/an), maxUnitPrice 15 000/ordonnance
      { category: 'PHARMACY', limit: 180000, rate: 60, minRate: 60, maxRate: 60, minLimit: 180000, maxLimit: 180000, limitStep: 0, customizable: false, copayRate: 40, maxUnitPrice: 15000 },
      // Analyses & labos : 50%, plafond annuel 30 000 FCFA, maxUnitPrice 10 000/acte
      { category: 'LABORATORY', limit: 30000, rate: 50, minRate: 50, maxRate: 50, minLimit: 30000, maxLimit: 30000, limitStep: 0, customizable: false, copayRate: 50, maxUnitPrice: 10000 },
    ],
    exclusions: [
      { categoryId: 'MATERNITY', description: 'Maternité non couverte par la formule Essentielle (souscription dédiée requise)' },
      { categoryId: 'DENTAL', description: 'Soins dentaires non couverts — frais à 100% charge de l\'assuré' },
      { categoryId: 'OPTICAL', description: 'Optique non couverte — frais à 100% charge de l\'assuré' },
      { categoryId: 'SPECIALIZED', description: 'Soins spécialisés non couverts par cette formule d\'entrée de gamme' },
    ],
  });

  // --- Formule 2 : Santé Confort (12 000 FCFA/mois) ---
  // Couverture intermédiaire avec maternité, spécialiste et dentaire.
  // Délai de carence maternité 10 mois strict.
  const prodConfort = await createProduct({
    code: 'CONF', name: 'Santé Confort', clientType: 'INDIVIDUAL', status: 'ACTIVE', sortOrder: 2,
    description: 'Équilibre entre couverture et rentabilité : consultations, spécialistes, maternité, dentaire et optique. Ticket modérateur 20%.',
    minAge: 0, maxAge: 65, waitingPeriodDays: 30,
    basePremiumAnnual: 144000, // 12 000 FCFA/mois
    pricePerAdditionalAdultAnnual: 108000, // 9 000 FCFA/mois par conjoint/adulte
    pricePerChildAnnual: 108000, // 9 000 FCFA/mois par enfant
    thirdPartyAuthThreshold: 200000,
    globalAnnualCap: 1200000, // Plafond annuel global par assuré
    ageLoadings: [
      { minAge: 0, maxAge: 30, factor: 1.0 },
      { minAge: 31, maxAge: 45, factor: 1.15 },
      { minAge: 46, maxAge: 55, factor: 1.35 },
      { minAge: 56, maxAge: 65, factor: 1.55 },
    ],
    insurerPartnerId: partnerA.id,
    beneficiaryRules: { spouse: true, childMaxAge: 25, otherAllowed: false, maxBeneficiaries: 8 },
    eligibilityConditions: JSON.stringify({
      waitingPeriodDays: { default: 30, hospitalization: 90, maternity: 300 }, // Maternité : 10 mois de carence
      copayRate: 20, // Ticket modérateur 20%
      perActCap: { CONSULTATION: 12000, SPECIALIST: 15000 },
      specialistConsultationsPerYear: 5, // Max 5 consultations spécialiste/an
      opticalEvery2Years: true, // Forfait optique tous les 2 ans
    }),
    guarantees: [
      // Hospitalisation médecine générale : 75%, plafond 500 000 FCFA/an, maxUnitPrice 45 000/jour
      { category: 'HOSPITALIZATION', limit: 500000, rate: 75, minRate: 75, maxRate: 75, minLimit: 500000, maxLimit: 500000, limitStep: 0, customizable: false, copayRate: 25, deductibleType: 'FIXED', deductibleValue: 10000, maxUnitPrice: 45000 },
      // Consultation généraliste : 80%, maxUnitPrice 12 000/acte
      { category: 'CONSULTATION', limit: 144000, rate: 80, minRate: 80, maxRate: 80, minLimit: 144000, maxLimit: 144000, limitStep: 0, customizable: false, copayRate: 20, maxUnitPrice: 12000 },
      // Pharmacie : 70%, maxUnitPrice 30 000/ordonnance
      { category: 'PHARMACY', limit: 360000, rate: 70, minRate: 70, maxRate: 70, minLimit: 360000, maxLimit: 360000, limitStep: 0, customizable: false, copayRate: 30, maxUnitPrice: 30000 },
      // Analyses & imagerie : 70%, maxUnitPrice 15 000/acte
      { category: 'LABORATORY', limit: 75000, rate: 70, minRate: 70, maxRate: 70, minLimit: 75000, maxLimit: 75000, limitStep: 0, customizable: false, copayRate: 30, maxUnitPrice: 15000 },
      // Soins spécialisés : 70%, maxUnitPrice 15 000/acte
      { category: 'SPECIALIZED', limit: 200000, rate: 70, minRate: 70, maxRate: 70, minLimit: 200000, maxLimit: 200000, limitStep: 0, customizable: false, copayRate: 30, maxUnitPrice: 15000 },
      // Maternité : forfait 200 000 FCFA
      { category: 'MATERNITY', limit: 200000, rate: 100, minRate: 100, maxRate: 100, minLimit: 200000, maxLimit: 200000, limitStep: 0, customizable: false, deductibleType: 'FIXED', deductibleValue: 10000, maxUnitPrice: 200000 },
      // Dentaire : 60%, maxUnitPrice 15 000/acte
      { category: 'DENTAL', limit: 40000, rate: 60, minRate: 60, maxRate: 60, minLimit: 40000, maxLimit: 40000, limitStep: 0, customizable: false, copayRate: 40, maxUnitPrice: 15000 },
      // Optique : forfait 30 000 FCFA tous les 2 ans
      { category: 'OPTICAL', limit: 30000, rate: 100, minRate: 100, maxRate: 100, minLimit: 30000, maxLimit: 30000, limitStep: 0, customizable: false, maxUnitPrice: 30000 },
    ],
  });

  // --- Formule 3 : Santé Excellence (25 000 FCFA/mois) ---
  // Haute gamme pour cadres. Ticket modérateur 10% maintenu.
  // Entente préalable obligatoire sauf urgences vitales.
  const prodPremium = await createProduct({
    code: 'EXC', name: 'Santé Excellence', clientType: 'INDIVIDUAL', status: 'ACTIVE', sortOrder: 3,
    description: 'Haute gamme : toutes cliniques, évacuation sanitaire, plafonds élevés. Entente préalable pour les gros actes. Ticket modérateur 10%.',
    minAge: 0, maxAge: 70, waitingPeriodDays: 30,
    basePremiumAnnual: 300000, // 25 000 FCFA/mois
    pricePerAdditionalAdultAnnual: 240000, // 20 000 FCFA/mois par conjoint/adulte
    pricePerChildAnnual: 240000, // 20 000 FCFA/mois par enfant
    thirdPartyAuthThreshold: 150000, // Entente préalable à partir de 150 000 FCFA
    globalAnnualCap: 3000000, // Plafond annuel global par assuré
    ageLoadings: [
      { minAge: 0, maxAge: 30, factor: 1.0 },
      { minAge: 31, maxAge: 45, factor: 1.15 },
      { minAge: 46, maxAge: 55, factor: 1.3 },
      { minAge: 56, maxAge: 65, factor: 1.5 },
      { minAge: 66, maxAge: 70, factor: 1.7 },
    ],
    insurerPartnerId: partnerA.id,
    beneficiaryRules: { spouse: true, childMaxAge: 26, otherAllowed: true, maxBeneficiaries: 10 },
    eligibilityConditions: JSON.stringify({
      waitingPeriodDays: { default: 30, hospitalization: 90, maternity: 300 },
      copayRate: 10, // Ticket modérateur 10% maintenu pour responsabiliser
      perActCap: { CONSULTATION: 25000, SPECIALIST: 25000 },
      priorAuthRequired: true, // Entente préalable obligatoire sauf urgences
      privateRoomCap: 20000, // Chambre particulière max 20 000 FCFA/jour
    }),
    guarantees: [
      // Hospitalisation (toutes cliniques) : 90%, plafond 1 500 000 FCFA/an, maxUnitPrice 45 000/jour
      { category: 'HOSPITALIZATION', limit: 1500000, rate: 90, minRate: 90, maxRate: 90, minLimit: 1500000, maxLimit: 1500000, limitStep: 0, customizable: false, copayRate: 10, deductibleType: 'FIXED', deductibleValue: 10000, maxUnitPrice: 45000 },
      // Consultations (généraliste + spécialiste) : 90%, maxUnitPrice 25 000/acte
      { category: 'CONSULTATION', limit: 300000, rate: 90, minRate: 90, maxRate: 90, minLimit: 300000, maxLimit: 300000, limitStep: 0, customizable: false, copayRate: 10, maxUnitPrice: 25000 },
      // Pharmacie : 90%, maxUnitPrice 40 000/ordonnance
      { category: 'PHARMACY', limit: 600000, rate: 90, minRate: 90, maxRate: 90, minLimit: 600000, maxLimit: 600000, limitStep: 0, customizable: false, copayRate: 10, maxUnitPrice: 40000 },
      // Analyses, labos, imagerie (IRM, scanner) : 90%, maxUnitPrice 25 000/acte
      { category: 'LABORATORY', limit: 250000, rate: 90, minRate: 90, maxRate: 90, minLimit: 250000, maxLimit: 250000, limitStep: 0, customizable: false, copayRate: 10, maxUnitPrice: 25000 },
      // Soins spécialisés : 90%, maxUnitPrice 25 000/acte
      { category: 'SPECIALIZED', limit: 500000, rate: 90, minRate: 90, maxRate: 90, minLimit: 500000, maxLimit: 500000, limitStep: 0, customizable: false, copayRate: 10, maxUnitPrice: 25000 },
      // Maternité : 80%, plafond 400 000 FCFA
      { category: 'MATERNITY', limit: 400000, rate: 80, minRate: 80, maxRate: 80, minLimit: 400000, maxLimit: 400000, limitStep: 0, customizable: false, copayRate: 20, maxUnitPrice: 400000 },
      // Dentaire : 80%, maxUnitPrice 15 000/acte
      { category: 'DENTAL', limit: 100000, rate: 80, minRate: 80, maxRate: 80, minLimit: 100000, maxLimit: 100000, limitStep: 0, customizable: false, copayRate: 20, maxUnitPrice: 15000 },
      // Optique : 70%, maxUnitPrice 80 000 FCFA tous les 2 ans
      { category: 'OPTICAL', limit: 80000, rate: 70, minRate: 70, maxRate: 70, minLimit: 80000, maxLimit: 80000, limitStep: 0, customizable: false, copayRate: 30, maxUnitPrice: 80000 },
    ],
  });

  // --- Formule Entreprise 1 : Entreprise Performance (10 000 FCFA/mois/salarié) ---
  // Employeur 5 000 + Salarié 5 000. Plafond global 500 000 FCFA/an/salarié.
  const prodEntreprisePerf = await createProduct({
    code: 'ENT-PERF', name: 'Entreprise Performance', clientType: 'COMPANY', status: 'ACTIVE', sortOrder: 1,
    description: 'Couverture collective à co-partage employeur/salarié. Plafond annuel strict de 500 000 FCFA/salarié pour maîtriser les coûts.',
    minAge: 18, maxAge: 63, waitingPeriodDays: 15,
    basePremiumAnnual: 120000, // 10 000 FCFA/mois (5 000 employeur + 5 000 salarié)
    pricePerAdditionalAdultAnnual: 0, // Inclus dans le tarif salarié
    pricePerChildAnnual: 48000, // 4 000 FCFA/mois par enfant
    thirdPartyAuthThreshold: 150000,
    globalAnnualCap: 500000, // Plafond annuel global par salarié
    insurerPartnerId: partnerA.id,
    beneficiaryRules: { spouse: true, childMaxAge: 23, otherAllowed: false, maxBeneficiaries: 6 },
    eligibilityConditions: JSON.stringify({
      waitingPeriodDays: { default: 15, hospitalization: 90, maternity: 300 },
      copayRate: 30, // Ticket modérateur 30%
      employerShare: 5000, // Part employeur 5 000 FCFA/mois
      employeeShare: 5000, // Part salarié 5 000 FCFA/mois
      globalAnnualCapPerEmployee: 500000, // Plafond de consommation globale par salarié
    }),
    guarantees: [
      // Hospitalisation : 70%, plafond 350 000 FCFA/an
      { category: 'HOSPITALIZATION', limit: 350000, rate: 70, minRate: 70, maxRate: 70, minLimit: 350000, maxLimit: 350000, limitStep: 0, customizable: false, copayRate: 30, deductibleType: 'FIXED', deductibleValue: 10000 },
      // Consultations : 70%, plafond 10 000 FCFA/acte
      { category: 'CONSULTATION', limit: 120000, rate: 70, minRate: 70, maxRate: 70, minLimit: 120000, maxLimit: 120000, limitStep: 0, customizable: false, copayRate: 30 },
      // Pharmacie : 70%, plafond 25 000 FCFA/mois (300 000/an)
      { category: 'PHARMACY', limit: 300000, rate: 70, minRate: 70, maxRate: 70, minLimit: 300000, maxLimit: 300000, limitStep: 0, customizable: false, copayRate: 30 },
      // Analyses : 70%, plafond 50 000 FCFA/an
      { category: 'LABORATORY', limit: 50000, rate: 70, minRate: 70, maxRate: 70, minLimit: 50000, maxLimit: 50000, limitStep: 0, customizable: false, copayRate: 30 },
      // Maternité : forfait 150 000 FCFA, carence 10 mois
      { category: 'MATERNITY', limit: 150000, rate: 100, minRate: 100, maxRate: 100, minLimit: 150000, maxLimit: 150000, limitStep: 0, customizable: false, deductibleType: 'FIXED', deductibleValue: 10000 },
    ],
    exclusions: [
      { categoryId: 'DENTAL', description: 'Soins dentaires non couverts par le contrat Entreprise Performance' },
      { categoryId: 'OPTICAL', description: 'Optique non couverte par le contrat Entreprise Performance' },
      { categoryId: 'SPECIALIZED', description: 'Soins spécialisés non couverts — formule Cadre requise' },
    ],
  });

  // --- Formule Entreprise 2 : Entreprise Cadre/VIP (20 000 FCFA/mois/salarié) ---
  // Employeur 10 000 + Salarié 10 000. Plafond global 1 200 000 FCFA/an.
  const prodEntrepriseCadre = await createProduct({
    code: 'ENT-VIP', name: 'Entreprise Cadre / VIP', clientType: 'COMPANY', status: 'ACTIVE', sortOrder: 2,
    description: 'Couverture premium pour cadres : entente préalable exigée pour hospitalisations, plafond annuel 1,2M FCFA/salarié.',
    minAge: 18, maxAge: 65, waitingPeriodDays: 15,
    basePremiumAnnual: 240000, // 20 000 FCFA/mois (10 000 employeur + 10 000 salarié)
    pricePerAdditionalAdultAnnual: 0,
    pricePerChildAnnual: 96000, // 8 000 FCFA/mois par enfant
    thirdPartyAuthThreshold: 100000, // Entente préalable plus stricte
    globalAnnualCap: 1200000, // Plafond annuel global par salarié
    insurerPartnerId: partnerA.id,
    beneficiaryRules: { spouse: true, childMaxAge: 25, otherAllowed: false, maxBeneficiaries: 8 },
    eligibilityConditions: JSON.stringify({
      waitingPeriodDays: { default: 15, hospitalization: 90, maternity: 300 },
      copayRate: 10, // Ticket modérateur réduit 10%
      employerShare: 10000,
      employeeShare: 10000,
      globalAnnualCapPerEmployee: 1200000,
      priorAuthRequired: true, // Entente préalable obligatoire pour hospitalisations
    }),
    guarantees: [
      // Hospitalisation (toutes cliniques) : 90%, plafond 1 000 000 FCFA/an, entente préalable
      { category: 'HOSPITALIZATION', limit: 1000000, rate: 90, minRate: 90, maxRate: 90, minLimit: 1000000, maxLimit: 1000000, limitStep: 0, customizable: false, copayRate: 10, deductibleType: 'FIXED', deductibleValue: 10000 },
      // Consultations : 90%, plafond 20 000 FCFA/acte
      { category: 'CONSULTATION', limit: 240000, rate: 90, minRate: 90, maxRate: 90, minLimit: 240000, maxLimit: 240000, limitStep: 0, customizable: false, copayRate: 10 },
      // Pharmacie : 85%, plafond 40 000 FCFA/mois (480 000/an)
      { category: 'PHARMACY', limit: 480000, rate: 85, minRate: 85, maxRate: 85, minLimit: 480000, maxLimit: 480000, limitStep: 0, customizable: false, copayRate: 15 },
      // Analyses & imagerie : 85%, plafond 150 000 FCFA/an
      { category: 'LABORATORY', limit: 150000, rate: 85, minRate: 85, maxRate: 85, minLimit: 150000, maxLimit: 150000, limitStep: 0, customizable: false, copayRate: 15 },
      // Soins spécialisés : 85%, plafond 400 000 FCFA/an
      { category: 'SPECIALIZED', limit: 400000, rate: 85, minRate: 85, maxRate: 85, minLimit: 400000, maxLimit: 400000, limitStep: 0, customizable: false, copayRate: 15 },
      // Maternité : 85%, plafond 300 000 FCFA, carence 10 mois
      { category: 'MATERNITY', limit: 300000, rate: 85, minRate: 85, maxRate: 85, minLimit: 300000, maxLimit: 300000, limitStep: 0, customizable: false, copayRate: 15 },
      // Dentaire : 70%, plafond 60 000 FCFA/an
      { category: 'DENTAL', limit: 60000, rate: 70, minRate: 70, maxRate: 70, minLimit: 60000, maxLimit: 60000, limitStep: 0, customizable: false, copayRate: 30 },
      // Optique : 60%, plafond 50 000 FCFA tous les 2 ans
      { category: 'OPTICAL', limit: 50000, rate: 60, minRate: 60, maxRate: 60, minLimit: 50000, maxLimit: 50000, limitStep: 0, customizable: false, copayRate: 40 },
    ],
  });
  console.log('Produits v2.0 crÃ©Ã©s : Essentielle, Confort, Excellence, Entreprise Performance, Entreprise Cadre/VIP');

  const providersData = [
    { name: 'CHU Hubert Koutoukou Maga', type: 'HOSPITAL', city: 'Cotonou', address: 'Avenue Jean-Paul II', phone: '+229 21 30 01 81', lat: 6.357, lng: 2.429, specialties: 'MÃ©decine gÃ©nÃ©rale, chirurgie, pÃ©diatrie', openingHours: '24h/24', services: 'Urgences, hospitalisation, imagerie', conventionLevel: 'PREMIUM', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=400&fit=crop' },
    { name: 'Clinique Mahouna', type: 'CLINIC', city: 'Cotonou', address: 'CarrÃ© 1100, FidjrossÃ¨', phone: '+229 21 24 10 10', lat: 6.365, lng: 2.395, specialties: 'GynÃ©cologie, mÃ©decine gÃ©nÃ©rale', openingHours: 'Lun-Sam 7h-20h', services: 'Consultations, Ã©chographie, petite chirurgie', conventionLevel: 'PLUS', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=400&fit=crop' },
    { name: 'Polyclinique Les Cocotiers', type: 'CLINIC', city: 'Cotonou', address: 'Rue 12.068, Haie Vive', phone: '+229 21 31 04 04', lat: 6.373, lng: 2.416, specialties: 'Cardiologie, diabÃ©tologie, ophtalmologie', openingHours: 'Lun-Ven 8h-19h', services: 'Consultations spÃ©cialisÃ©es, laboratoire', conventionLevel: 'PLUS', thirdPartyPayer: false, photoUrl: 'https://images.unsplash.com/photo-1586776802477-3680284edb9e?w=600&h=400&fit=crop' },
    { name: 'Pharmacie du Rond-Point', type: 'PHARMACY', city: 'Cotonou', address: 'Rond-point Dantokpa', phone: '+229 21 31 55 66', lat: 6.369, lng: 2.428, openingHours: 'Lun-Dim 8h-22h', services: 'MÃ©dicaments, parapharmacie', conventionLevel: 'BASIC', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=600&h=400&fit=crop' },
    { name: 'Laboratoire Bio Cotonou', type: 'LABORATORY', city: 'Cotonou', address: 'Avenue Steinmetz', phone: '+229 97 00 11 22', lat: 6.362, lng: 2.421, openingHours: 'Lun-Sam 7h-18h', services: 'Analyses mÃ©dicales gÃ©nÃ©rales, sÃ©rologie', conventionLevel: 'PLUS', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?w=600&h=400&fit=crop' },
    { name: 'Centre de SantÃ© dâ€™Abomey-Calavi', type: 'HEALTH_CENTER', city: 'Abomey-Calavi', address: 'Carrefour TankpÃ¨', phone: '+229 21 36 00 21', lat: 6.449, lng: 2.356, openingHours: '24h/24', services: 'Consultations, maternitÃ©, vaccination', conventionLevel: 'BASIC', thirdPartyPayer: false, photoUrl: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=600&h=400&fit=crop' },
    { name: 'Clinique Universitaire Godomey', type: 'CLINIC', city: 'Abomey-Calavi', address: 'Godomey Carrefour', phone: '+229 21 36 44 55', lat: 6.451, lng: 2.341, specialties: 'MÃ©decine gÃ©nÃ©rale, pÃ©diatrie', openingHours: 'Lun-Dim 7h-21h', services: 'Consultations, hospitalisation courte', conventionLevel: 'BASIC', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=400&fit=crop' },
    { name: 'CHU-MEL DÃ©partmental OuÃ©mÃ©', type: 'HOSPITAL', city: 'Porto-Novo', address: 'Quartier DjÃ¨gan-KpÃ¨vi', phone: '+229 20 22 50 40', lat: 6.497, lng: 2.605, specialties: 'Chirurgie, mÃ©decine interne', openingHours: '24h/24', services: 'Urgences, hospitalisation, scanner', conventionLevel: 'PLUS', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=400&fit=crop' },
    { name: 'Pharmacie Portovoise', type: 'PHARMACY', city: 'Porto-Novo', address: 'Avenue Bayol', phone: '+229 20 21 33 77', lat: 6.493, lng: 2.612, openingHours: 'Lun-Sam 8h-21h', services: 'MÃ©dicaments', conventionLevel: 'BASIC', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=600&h=400&fit=crop' },
    { name: 'CHU Borgou Alibori', type: 'HOSPITAL', city: 'Parakou', address: 'Boulevard de la RÃ©publique', phone: '+229 23 61 20 60', lat: 9.337, lng: 2.618, specialties: 'Chirurgie viscÃ©rale, traumatologie', openingHours: '24h/24', services: 'Urgences, hospitalisation', conventionLevel: 'PLUS', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=600&h=400&fit=crop' },
    { name: 'Cabinet Dentaire Sourire', type: 'MEDICAL_CABINET', city: 'Cotonou', address: 'FidjrossÃ¨ plage', phone: '+229 95 12 34 56', lat: 6.36, lng: 2.388, specialties: 'Odontostomatologie', openingHours: 'Lun-Ven 8h-17h', services: 'Soins dentaires, dÃ©tartrage', conventionLevel: 'BASIC', thirdPartyPayer: false, photoUrl: 'https://images.unsplash.com/photo-1607613009820-a29f7bb81dcc?w=600&h=400&fit=crop' },
    { name: 'Dr Sossah â€” Ophtalmologue', type: 'SPECIALIST', city: 'Cotonou', address: 'CadjÃ¨houn, rue des Ambassadeurs', phone: '+229 21 34 98 76', lat: 6.356, lng: 2.409, specialties: 'Ophtalmologie', openingHours: 'Sur rendez-vous', services: 'Consultation, chirurgie cataracte', conventionLevel: 'PLUS', thirdPartyPayer: false, photoUrl: 'https://images.unsplash.com/photo-1559757148-5c17d594a11?w=600&h=400&fit=crop' },
  ];
  for (const p of providersData) {
    await prisma.provider.create({ data: { ...p, partnerStatus: 'ACTIVE', active: true } as any });
  }
  console.log(`${providersData.length} prestataires crÃ©Ã©s`);

  async function createUser(data: any) {
    return prisma.user.create({ data: { ...data, passwordHash: password } });
  }

  const superAdmin = await createUser({ email: 'admin@santeplus.bj', role: 'SUPER_ADMIN', firstName: 'Alain', lastName: 'Dossou', memberNumber: 'MEM-ADMIN1' });
  const manager = await createUser({ email: 'gestionnaire@santeplus.bj', role: 'INSURANCE_MANAGER', firstName: 'Bernadette', lastName: 'Houngbo', memberNumber: 'MEM-GEST01' });
  const support = await createUser({ email: 'support@santeplus.bj', role: 'SUPPORT_AGENT', firstName: 'Carl', lastName: 'Adjovi', memberNumber: 'MEM-SUP01' });

  const company1 = await prisma.company.create({
    data: { name: 'SOTRABEN SARL', sector: 'Transport & logistique', taxId: 'RCCM/RB/COT/24B 1523', city: 'Cotonou', address: 'Zone industrielle, Akpakpa', phone: '+229 21 71 22 33', email: 'rh@sotraben.bj', contactName: 'Estelle Kponou', status: 'ACTIVE' },
  });
  const companyAdmin = await createUser({
    email: 'entreprise@santeplus.bj', role: 'COMPANY_ADMIN', firstName: 'Estelle', lastName: 'Kponou', companyId: company1.id, memberNumber: 'MEM-ENT01', birthDate: date(1985, 4, 12), gender: 'F',
  });

  const jean = await createUser({
    email: 'jean@demo.bj', role: 'MEMBER', firstName: 'Jean', lastName: 'Agbodjan', phone: '+229 96 11 22 33', birthDate: date(1988, 7, 14), gender: 'M',
    address: 'CarrÃ© 405, GbÃ©gamey', city: 'Cotonou', memberNumber: 'MEM-A00001',
    emergencyContact: 'Sylvie Agbodjan (+229 97 88 77 66)',
  });

  const fatou = await createUser({
    email: 'fatou@demo.bj', role: 'MEMBER', firstName: 'Fatou', lastName: 'Bio Tano', phone: '+229 95 44 55 66', birthDate: date(1994, 3, 2), gender: 'F',
    city: 'Abomey-Calavi', memberNumber: 'MEM-A00002',
  });

  const kossi = await createUser({
    email: 'kossi@demo.bj', role: 'MEMBER', firstName: 'Kossi', lastName: 'Amoussou', phone: '+229 94 77 88 99', birthDate: date(1979, 11, 25), gender: 'M',
    city: 'Porto-Novo', memberNumber: 'MEM-A00003',
  });

  const providerUser = await createUser({
    email: 'prestataire@santeplus.bj', role: 'PROVIDER', firstName: 'RÃ©ception', lastName: 'Clinique Mahouna', memberNumber: 'MEM-PREST1',
  });

  const actsData = [
    { code: 'CONS-001', name: 'Consultation medecine generale', category: 'CONSULTATION', price: 10000, requiresPrescription: false, requiresPriorAuth: false, authThreshold: null },
    { code: 'CONS-002', name: 'Consultation specialiste', category: 'CONSULTATION', price: 25000, requiresPrescription: false, requiresPriorAuth: false, authThreshold: 50000 },
    { code: 'HOSP-001', name: 'Hospitalisation - journee', category: 'HOSPITALIZATION', price: 45000, requiresPrescription: false, requiresPriorAuth: false, authThreshold: 100000 },
    { code: 'HOSP-002', name: 'Bloc operatoire (forfait)', category: 'HOSPITALIZATION', price: 350000, requiresPrescription: true, requiresPriorAuth: true, authThreshold: 50000 },
    { code: 'PHAR-001', name: 'Medicaments (ordonnance)', category: 'PHARMACY', price: 25000, requiresPrescription: true, requiresPriorAuth: false, authThreshold: null },
    { code: 'LABO-001', name: 'Bilan sanguin complet', category: 'LABORATORY', price: 20000, requiresPrescription: true, requiresPriorAuth: false, authThreshold: 80000 },
    { code: 'LABO-002', name: 'Test paludisme (TDR)', category: 'LABORATORY', price: 5000, requiresPrescription: false, requiresPriorAuth: false, authThreshold: null },
    { code: 'LABO-003', name: 'Echographie', category: 'LABORATORY', price: 15000, requiresPrescription: true, requiresPriorAuth: false, authThreshold: null },
    { code: 'SPEC-001', name: 'Seance de dialyse', category: 'SPECIALIZED', price: 90000, requiresPrescription: true, requiresPriorAuth: true, authThreshold: 50000 },
    { code: 'SPEC-002', name: 'Kinesitherapie (seance)', category: 'SPECIALIZED', price: 12000, requiresPrescription: true, requiresPriorAuth: false, authThreshold: null },
    { code: 'MAT-001', name: 'Accouchement simple', category: 'MATERNITY', price: 120000, requiresPrescription: false, requiresPriorAuth: false, authThreshold: 100000 },
    { code: 'MAT-002', name: 'Cesarienne', category: 'MATERNITY', price: 450000, requiresPrescription: true, requiresPriorAuth: true, authThreshold: 50000 },
    { code: 'DENT-001', name: 'Extraction dentaire', category: 'DENTAL', price: 15000, requiresPrescription: false, requiresPriorAuth: false, authThreshold: null },
    { code: 'OPT-001', name: 'Lunettes (paire)', category: 'OPTICAL', price: 60000, requiresPrescription: true, requiresPriorAuth: false, authThreshold: 80000 },
  ];
  for (const [i, a] of actsData.entries()) {
    await prisma.act.create({
      data: { code: a.code, name: a.name, categoryId: a.category, referencePrice: a.price, sortOrder: i + 1, requiresPrescription: a.requiresPrescription, requiresPriorAuth: a.requiresPriorAuth, authThreshold: (a as any).authThreshold },
    });
  }

  const medicationsData = [
    { code: 'MED-PARA', name: 'Paracetamol 500mg (boite 20)', dci: 'Paracetamol', dosage: '500 mg', form: 'Comprimes', price: 1500, rx: false },
    { code: 'MED-AMOX', name: 'Amoxicilline 500mg (boite 12)', dci: 'Amoxicilline', dosage: '500 mg', form: 'Gelules', price: 3500, rx: true },
    { code: 'MED-ARTE', name: 'Artemether-Lumefantrine', dci: 'Artemether/Lumefantrine', dosage: '20/120 mg', form: 'Comprimes', price: 2800, rx: true },
    { code: 'MED-IBUP', name: 'Ibuprofene 400mg (boite 20)', dci: 'Ibuprofene', dosage: '400 mg', form: 'Comprimes', price: 1800, rx: false },
    { code: 'MED-OMEP', name: 'Omeprazole 20mg (boite 14)', dci: 'Omeprazole', dosage: '20 mg', form: 'Gelules', price: 4200, rx: true },
    { code: 'MED-METF', name: 'Metformine 850mg (boite 30)', dci: 'Metformine', dosage: '850 mg', form: 'Comprimes', price: 3900, rx: true },
    { code: 'MED-AMLO', name: 'Amlodipine 5mg (boite 30)', dci: 'Amlodipine', dosage: '5 mg', form: 'Comprimes', price: 3200, rx: true },
    { code: 'MED-SRO', name: 'SRO (sachets)', dci: 'Sels de rehydratation orale', dosage: '-', form: 'Poudre', price: 600, rx: false },
  ];
  for (const m of medicationsData) {
    await prisma.medication.create({
      data: { code: m.code, name: m.name, dci: m.dci, dosage: m.dosage, form: m.form, price: m.price, requiresPrescription: m.rx },
    });
  }

  const mahounaProvider = await prisma.provider.findFirst({ where: { name: 'Clinique Mahouna' } });
  if (mahounaProvider) {
    await prisma.user.update({ where: { id: providerUser.id }, data: { providerId: mahounaProvider.id } });
    await createUser({
      email: 'caisse@santeplus.bj', role: 'PROVIDER', firstName: 'Caisse', lastName: 'Clinique Mahouna',
      memberNumber: 'MEM-PREST2', providerId: mahounaProvider.id,
    });
  }

  console.log('Utilisateurs crÃ©Ã©s');

  function quoteSnapshot(totalAnnual: number, frequency: string, periods: number) {
    const factorMap: Record<string, number> = { ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.06 };
    return JSON.stringify({ lines: [{ label: 'Cotisation', amount: totalAnnual }], subtotalAnnual: totalAnnual, frequency, factor: factorMap[frequency], totalAnnual, periods, periodicAmount: Math.ceil(totalAnnual / periods), currency: 'XOF' });
  }

  async function seedIndividualContract(opts: {
    user: any; product: any; status: string; startOffset: number | null; durationDays?: number;
    frequency?: string; beneficiaries?: any[]; contributionsPaid?: number; contributionCount?: number;
    cardTokenSeed: string;
  }) {
    const frequency = opts.frequency ?? 'MONTHLY';
    const periods = frequency === 'MONTHLY' ? 12 : frequency === 'QUARTERLY' ? 4 : 1;
    const adults = (opts.beneficiaries ?? []).filter(b => b.relation !== 'CHILD').length;
    const children = (opts.beneficiaries ?? []).filter(b => b.relation === 'CHILD').length;
    let premiumAnnual = opts.product.basePremiumAnnual
      + adults * opts.product.pricePerAdditionalAdultAnnual
      + children * opts.product.pricePerChildAnnual;
    premiumAnnual = Math.round(premiumAnnual / 5) * 5;

    const startDate = opts.startOffset == null ? null : daysFromNow(opts.startOffset);
    const endDate = startDate == null ? null : (() => { const e = new Date(startDate); e.setFullYear(e.getFullYear() + 1); e.setDate(e.getDate() - 1); return e; })();

    const contract = await prisma.contract.create({
      data: {
        number: `CTR-${new Date().getFullYear()}-${opts.cardTokenSeed}`,
        kind: 'INDIVIDUAL',
        status: opts.status,
        principalUserId: opts.user.id,
        productId: opts.product.id,
        insurerPartnerId: opts.product.insurerPartnerId,
        startDate,
        endDate,
        premiumAnnual,
        frequency,
        quote: quoteSnapshot(premiumAnnual, frequency, periods),
        cardToken: `tok_${opts.cardTokenSeed.toLowerCase()}_demo`,
      },
    });

    for (const b of opts.beneficiaries ?? []) {
      await prisma.beneficiary.create({
        data: {
          contractId: contract.id,
          firstName: b.firstName, lastName: b.lastName, birthDate: b.birthDate, gender: b.gender, relation: b.relation,
          memberNumber: b.memberNumber,
        },
      });
    }

    const count = opts.contributionCount ?? periods;
    const step = frequency === 'MONTHLY' ? 30 : frequency === 'QUARTERLY' ? 91 : 365;
    const perDue = Math.round(premiumAnnual / periods / 5) * 5;
    for (let i = 0; i < count; i++) {
      const dueDate = new Date((startDate ?? daysFromNow(-count * step)).getTime());
      dueDate.setDate(dueDate.getDate() + i * step);
      const paid = i < (opts.contributionsPaid ?? 0);
      await prisma.contribution.create({
        data: {
          contractId: contract.id, sequence: i + 1, dueDate, amount: perDue,
          status: paid ? 'PAID' : dueDate < new Date() ? 'OVERDUE' : 'PENDING',
          paidAt: paid ? new Date(dueDate.getTime() + 86400000) : null,
        },
      });
    }
    return contract;
  }

  const jeanContract = await seedIndividualContract({
    user: jean, product: prodConfort, status: 'ACTIVE', startOffset: -130, cardTokenSeed: 'JEAN01',
    beneficiaries: [
      { firstName: 'Sylvie', lastName: 'Agbodjan', birthDate: date(1990, 9, 21), gender: 'F', relation: 'SPOUSE', memberNumber: 'MEM-B00001' },
      { firstName: 'LÃ©o', lastName: 'Agbodjan', birthDate: date(2016, 2, 8), gender: 'M', relation: 'CHILD', memberNumber: 'MEM-B00002' },
      { firstName: 'Maya', lastName: 'Agbodjan', birthDate: date(2019, 6, 30), gender: 'F', relation: 'CHILD', memberNumber: 'MEM-B00003' },
    ],
    contributionsPaid: 4, contributionCount: 12,
  });

  const fatouContract = await seedIndividualContract({
    user: fatou, product: prodEssentielle, status: 'ACTIVE', startOffset: -350, cardTokenSeed: 'FATOU1',
    contributionsPaid: 12, contributionCount: 12,
  });

  const kossiContract = await seedIndividualContract({
    user: kossi, product: prodEssentielle, status: 'PENDING_PAYMENT', startOffset: null, cardTokenSeed: 'KOSSI1',
    contributionsPaid: 0, contributionCount: 12,
  });

  for (const [contract, method] of [[jeanContract, 'MOCK_MOMO'], [fatouContract, 'MOCK_MOMO']] as const) {
    for (let i = 0; i < 4 && i < 12; i++) {
      const contribution = await prisma.contribution.findFirst({ where: { contractId: contract.id, sequence: i + 1 } });
      if (!contribution || contribution.status !== 'PAID') continue;
      await prisma.payment.create({
        data: {
          reference: `PAY-2026-${String(i + 1).padStart(4, '0')}${contract.number.slice(-3)}`,
          contractId: contract.id, userId: contract.principalUserId, amount: contribution.amount,
          method, status: 'SUCCEEDED', externalRef: `MOCK-${contract.id.slice(0, 8)}-${i}`,
          initiatedAt: contribution.paidAt!, completedAt: contribution.paidAt!,
          meta: JSON.stringify({ contributionId: contribution.id }),
        },
      });
    }
  }

  const groupStart = daysFromNow(-90);
  const groupEnd = new Date(groupStart.getTime()); groupEnd.setFullYear(groupEnd.getFullYear() + 1); groupEnd.setDate(groupEnd.getDate() - 1);

  const employeesData = [
    { firstName: 'Rodrigue', lastName: 'Ahouandjinou', email: 'rodrigue.sotraben@demo.bj', phone: '+229 97 12 34 01', birthDate: date(1987, 5, 3), gender: 'M', position: 'Chauffeur senior', beneficiaries: [] },
    { firstName: 'NadÃ¨ge', lastName: 'Tossou', email: 'nadege.sotraben@demo.bj', phone: '+229 97 12 34 02', birthDate: date(1992, 8, 19), gender: 'F', position: 'Comptable', beneficiaries: [] },
    { firstName: 'Ibrahim', lastName: 'Soumanou', email: 'ibrahim.sotraben@demo.bj', phone: '+229 97 12 34 03', birthDate: date(1990, 1, 27), gender: 'M', position: 'Magasinier', beneficiaries: [] },
    { firstName: 'Chantal', lastName: 'Djidjoho', email: 'chantal.sotraben@demo.bj', phone: '+229 97 12 34 04', birthDate: date(1996, 12, 5), gender: 'F', position: 'Assistante RH', beneficiaries: [] },
    { firstName: 'Ã‰ric', lastName: 'Kpossou', email: 'eric.sotraben@demo.bj', phone: '+229 97 12 34 05', birthDate: date(1994, 4, 14), gender: 'M', position: 'Chauffeur', beneficiaries: [] },
    { firstName: 'Reine', lastName: 'Zinsou', email: 'reine.sotraben@demo.bj', phone: '+229 97 12 34 06', birthDate: date(1989, 10, 9), gender: 'F', position: 'Responsable commercial', beneficiaries: [] },
  ];

  let empIdx = 0;
  for (const e of employeesData) {
    const user = await createUser({
      email: e.email, role: 'MEMBER', firstName: e.firstName, lastName: e.lastName, phone: e.phone,
      birthDate: e.birthDate, gender: e.gender, companyId: company1.id, memberNumber: `MEM-E${String(++empIdx).padStart(5, '0')}`,
    });
    await prisma.contract.create({
      data: {
        number: `CTR-COLL-S${String(empIdx).padStart(3, '0')}`,
        kind: 'INDIVIDUAL', status: 'ACTIVE',
        principalUserId: user.id, productId: prodEntreprisePerf.id, companyId: company1.id,
        startDate: groupStart, endDate: groupEnd, premiumAnnual: 0, frequency: 'QUARTERLY',
        quote: JSON.stringify({ viaGroup: 'collectif' }), cardToken: `tok_emp${empIdx}_demo`,
      },
    });
  }

  const groupContract = await prisma.contract.create({
    data: {
      number: 'CTR-COLLECTIF-001',
      kind: 'GROUP', status: 'ACTIVE',
      principalUserId: companyAdmin.id, productId: prodEntreprisePerf.id, companyId: company1.id,
      startDate: groupStart, endDate: groupEnd,
      premiumAnnual: 330000, frequency: 'QUARTERLY',
      quote: JSON.stringify({ lines: [{ label: 'SalariÃ©s assurÃ©s (6)', amount: 330000 }], employeesCount: 6, periodicAmount: 84150 }),
      cardToken: 'tok_group_sotraben_demo',
    },
  });
  for (let i = 0; i < 4; i++) {
    const dueDate = new Date(groupStart.getTime()); dueDate.setDate(dueDate.getDate() + i * 91);
    const paid = i < 2;
    await prisma.contribution.create({
      data: { contractId: groupContract.id, sequence: i + 1, dueDate, amount: 82500, status: paid ? 'PAID' : 'PENDING', paidAt: paid ? new Date(dueDate.getTime() + 172800000) : null },
    });
  }
  console.log('Contrats crÃ©Ã©s (individuels + collectif)');

  const mahouna = await prisma.provider.findFirst({ where: { name: 'Clinique Mahouna' } });
  const bioLabo = await prisma.provider.findFirst({ where: { name: 'Laboratoire Bio Cotonou' } });
  const sylvie = await prisma.beneficiary.findFirst({ where: { memberNumber: 'MEM-B00001' } });
  const leo = await prisma.beneficiary.findFirst({ where: { memberNumber: 'MEM-B00002' } });

  async function makePdf(title: string): Promise<Buffer> {
    const content = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 60>>stream\nBT /F1 14 Tf 50 780 Td (${title}) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>`;
    return Buffer.from(content);
  }

  async function addDoc(claimId: string, docType: string, fileName: string, ownerId: string) {
    const buf = await makePdf(fileName);
    const crypto = await import('crypto');
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const storageName = `${Date.now()}-${fileName}`;
    const fs = await import('fs');
    const path = await import('path');
    const dir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, storageName), buf);
    const file = await prisma.fileObject.create({
      data: { storagePath: storageName, mime: 'application/pdf', size: buf.length, sha256: sha, ownerId },
    });
    await prisma.claimDocument.create({
      data: { claimId, fileId: file.id, docType, fileName, mime: 'application/pdf', size: buf.length, sha256: sha },
    });
  }

  const claim1 = await prisma.claim.create({
    data: {
      reference: 'SIN-2026-A00001', contractId: jeanContract.id, claimantUserId: jean.id, providerId: mahouna!.id,
      careDate: daysFromNow(-12), status: 'SUBMITTED', submittedAt: daysFromNow(-10), totalRequested: 85000,
      estimation: JSON.stringify({ ok: true, flags: [], totals: { requested: 85000, eligible: 85000, approved: 68750, outOfPocket: 16250 }, items: [] }),
      flags: '[]',
      items: {
        create: [
          { categoryLabel: 'CONSULTATION', amountRequested: 15000, amountEligible: 15000, rateApplied: 80, deductibleApplied: 0, amountApproved: 12000 },
          { categoryLabel: 'PHARMACY', amountRequested: 70000, amountEligible: 70000, rateApplied: 75, deductibleApplied: 0, amountApproved: 52500 },
        ],
      },
    },
  });
  await addDoc(claim1.id, 'INVOICE', 'facture-clinique-mahouna.pdf', jean.id);
  await addDoc(claim1.id, 'PRESCRIPTION', 'ordonnance-dr-kponou.pdf', jean.id);

  const claim2 = await prisma.claim.create({
    data: {
      reference: 'SIN-2026-A00002', contractId: fatouContract.id, claimantUserId: fatou.id, providerId: bioLabo!.id,
      careDate: daysFromNow(-45), status: 'PAID', submittedAt: daysFromNow(-42), decidedAt: daysFromNow(-38),
      totalRequested: 32000, totalApproved: 25600, paidAt: daysFromNow(-35), paidRef: 'VIREMENT-MTN-88213',
      decisionNote: 'Analyse conforme aux garanties du contrat.',
      items: { create: [{ categoryLabel: 'LABORATORY', amountRequested: 32000, amountEligible: 32000, rateApplied: 80, deductibleApplied: 0, amountApproved: 25600 }] },
    },
  });
  await addDoc(claim2.id, 'INVOICE', 'facture-labo-bio.pdf', fatou.id);

  const claim3 = await prisma.claim.create({
    data: {
      reference: 'SIN-2026-A00003', contractId: jeanContract.id, claimantUserId: jean.id, beneficiaryId: leo!.id, providerId: mahouna!.id,
      careDate: daysFromNow(-70), status: 'APPROVED', submittedAt: daysFromNow(-68), decidedAt: daysFromNow(-64),
      totalRequested: 24000, totalApproved: 19200,
      decisionNote: 'Consultation pÃ©diatrique validÃ©e.',
      items: { create: [{ categoryLabel: 'CONSULTATION', amountRequested: 24000, amountEligible: 24000, rateApplied: 80, deductibleApplied: 0, amountApproved: 19200 }] },
    },
  });
  await addDoc(claim3.id, 'INVOICE', 'facture-pediatrie.pdf', jean.id);

  await prisma.claim.create({
    data: {
      reference: 'SIN-2026-A00004', contractId: jeanContract.id, claimantUserId: jean.id, beneficiaryId: sylvie!.id,
      careDate: daysFromNow(-100), status: 'REJECTED', submittedAt: daysFromNow(-98), decidedAt: daysFromNow(-92),
      totalRequested: 120000, totalApproved: 0,
      decisionNote: "Prestation hors garanties du contrat (soins dentaires exclus par la formule Santé Confort v2.0).",
      items: { create: [{ categoryLabel: 'DENTAL', amountRequested: 120000 }] },
    },
  });

  await prisma.claim.create({
    data: {
      reference: 'SIN-2026-A00005', contractId: fatouContract.id, claimantUserId: fatou.id,
      careDate: daysFromNow(-5), status: 'INFO_REQUESTED', submittedAt: daysFromNow(-3),
      totalRequested: 45000,
      decisionNote: 'Merci de joindre lâ€™ordonnance originale correspondant Ã  cette facture de pharmacie.',
      items: { create: [{ categoryLabel: 'PHARMACY', amountRequested: 45000 }] },
    },
  });

  const dossierProvider = await prisma.provider.findFirst({ where: { name: 'Clinique Mahouna' } });
  const demoConsultation = await prisma.consultation.create({
    data: {
      reference: `CON-${new Date().getFullYear()}-DEMO01`,
      patientUserId: jean.id,
      providerId: dossierProvider!.id,
      practitionerName: 'Dr Kouassi',
      specialty: 'Medecine generale',
      motif: 'Fievre, toux et fatigue depuis 3 jours',
      diagnostic: 'Paludisme probable - bilan demande',
    },
  });
  const demoPrescription = await prisma.prescription.create({
    data: {
      number: `ORD-${new Date().getFullYear()}-DEMO01`,
      qrToken: 'demo_qr_dossier_001',
      patientUserId: jean.id,
      consultationId: demoConsultation.id,
      providerId: dossierProvider!.id,
      prescriberUserId: providerUser.id,
      prescriberName: 'Dr Kouassi',
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 30 * 86400000),
      lines: {
        create: [
          { code: 'MED-AMOX', name: 'Amoxicilline 500mg (boite 12)', categoryId: 'PHARMACY', quantity: 1, unitPrice: 3500 },
          { code: 'MED-ARTE', name: 'Artemether-Lumefantrine', categoryId: 'PHARMACY', quantity: 1, unitPrice: 2800 },
          { code: 'LABO-001', name: 'Bilan sanguin complet', categoryId: 'LABORATORY', quantity: 1, unitPrice: 20000 },
        ],
      },
    },
    include: { lines: true },
  });
  const demoDelivery = await prisma.delivery.create({
    data: {
      reference: `DEL-${new Date().getFullYear()}-DEMO01`,
      prescriptionId: demoPrescription.id,
      providerId: dossierProvider!.id,
      userId: providerUser.id,
      patientUserId: jean.id,
      totalAmount: 6300,
      coveredAmount: 4725,
      patientAmount: 1575,
      lines: {
        create: demoPrescription.lines.slice(0, 2).map(l => ({
          lineId: l.id, code: l.code, name: l.name, categoryId: l.categoryId,
          quantity: 1, unitPrice: l.unitPrice, amount: l.unitPrice,
        })),
      },
    },
    include: { lines: true },
  });
  await prisma.prescription.update({
    where: { id: demoPrescription.id },
    data: { status: 'PARTIALLY_EXECUTED' },
  });
  await prisma.prescriptionLine.updateMany({
    where: { id: { in: demoPrescription.lines.slice(0, 2).map(l => l.id) } },
    data: { deliveredQty: 1 },
  });
  const demoCareRecord = await prisma.careRecord.create({
    data: {
      reference: `DOS-${new Date().getFullYear()}-DEMO01`,
      patientUserId: jean.id,
      providerId: dossierProvider!.id,
      consultationId: demoConsultation.id,
      prescriptionId: demoPrescription.id,
      deliveryId: demoDelivery.id,
      status: 'OPEN',
    },
  });
  await prisma.careRecordEvent.createMany({
    data: [
      { careRecordId: demoCareRecord.id, type: 'CONSULTATION_CREATED', title: `Consultation ${demoConsultation.reference}`, detail: demoConsultation.motif, actorUserId: providerUser.id, actorRole: 'PROVIDER' },
      { careRecordId: demoCareRecord.id, type: 'PRESCRIPTION_CREATED', title: `Ordonnance ${demoPrescription.number}`, detail: '3 produits prescrits', actorUserId: providerUser.id, actorRole: 'PROVIDER' },
      { careRecordId: demoCareRecord.id, type: 'DELIVERY_CREATED', title: `Delivrance ${demoDelivery.reference} — 2 produit(s)`, detail: 'Couvert 4725 FCFA', actorUserId: providerUser.id, actorRole: 'PROVIDER' },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      { userId: superAdmin.id, action: 'SEED_INIT', entityType: 'system', status: 'OK' },
      { userId: manager.id, action: 'POST /api/admin/claims/' + claim2.id + '/approve', entityType: 'claim', entityId: claim2.id, status: 'OK' },
    ],
  });

  await prisma.notification.createMany({
    data: [
      { userId: jean.id, topic: 'CLAIM_STATUS', title: 'Votre demande SIN-2026-A00001 est en cours de traitement', body: 'Nous avons bien reÃ§u votre demande de remboursement.', channel: 'IN_APP' },
      { userId: jean.id, topic: 'PAYMENT_CONFIRMED', title: 'Paiement reÃ§u : 13250 FCFA', body: 'Votre cotisation mensuelle a Ã©tÃ© encaissÃ©e. Merci !', channel: 'IN_APP' },
      { userId: fatou.id, topic: 'EXPIRY_REMINDER', title: 'Votre contrat expire bientÃ´t', body: 'Renouvelez avant son expiration pour rester couvert.', channel: 'IN_APP' },
      { userId: companyAdmin.id, topic: 'DUE_REMINDER', title: 'Cotisation collective Ã  rÃ©gler', body: 'Prochaine Ã©chÃ©ance du contrat collectif SOTRABEN.', channel: 'IN_APP' },
    ],
  });

  console.log('Seed terminÃ©.');
  console.log('');
  console.log('Comptes de dÃ©monstration (mot de passe : Demo1234!) :');
  console.log('  admin@santeplus.bj         Super administrateur');
  console.log('  gestionnaire@santeplus.bj  Gestionnaire assurance');
  console.log('  support@santeplus.bj       Agent support');
  console.log('  entreprise@santeplus.bj    Admin entreprise SOTRABEN');
  console.log('  jean@demo.bj               AssurÃ© (SantÃ© Confort v2.0)');
  console.log('  fatou@demo.bj              AssurÃ©e (SantÃ© Essentielle v2.0)');
  console.log('  kossi@demo.bj              AssurÃ© (souscription Ã  payer)');
  console.log('  prestataire@santeplus.bj   Prestataire (vÃ©rification QR)');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

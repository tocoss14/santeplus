// Seed CATALOGUE — données de référence uniquement, sans aucun compte.
//
// Pourquoi un script séparé de prisma/seed.ts ?
//   - seed.ts est DESTRUCTEUR (deleteMany sur tout) et crée des comptes avec le mot de
//     passe connu `Demo1234!`. La garde de boot de main.ts (ligne ~208) REFUSE de démarrer
//     en production tant qu'un compte porte ce mot de passe : l'exécuter sur la base de prod
//     ferait tomber le prochain déploiement.
//   - Or le site n'est vide que parce qu'il manque le CATALOGUE : formules, prestataires,
//     garanties, référentiels. Les comptes de démo ne servent qu'à la navigation en démo.
//
// Ce script est donc :
//   • NON destructif      — aucun deleteMany, jamais
//   • IDEMPOTENT         — rejouable sans dupliquer (upsert / skipDuplicates)
//   • SANS compte         — aucun User créé, la garde de production reste satisfaite
//   • Utilisable en prod  — pas besoin de ALLOW_SEED_IN_PROD
//
// Usage : npm run db:seed:catalogue
// Vérification : npm run db:seed:catalogue:dry   (n'écrit rien)

import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_PERMISSIONS } from '../src/common/permissions';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Crée seulement si absent — garde le script rejouable. */
async function ensureOne<T>(model: any, where: any, data: any, label: string): Promise<T> {
  const existing = await model.findFirst({ where });
  if (existing) return existing as T;
  if (DRY) return { id: `dry-${label}` } as T;
  const created = await model.create({ data });
  console.log(`  + ${label}`);
  return created as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Configuration système (nom de l'app, règles de gestion)
// ─────────────────────────────────────────────────────────────────────────────

async function seedSystemConfig() {
  const data = [
    { key: 'graceDays', value: '15' },
    { key: 'suspendAfterOverdueDays', value: '45' },
    { key: 'expiryReminders', value: '[30,15,7]' },
    { key: 'thirdPartyAuthThreshold', value: '150000' },
    { key: 'renewalAlertThreshold', value: '4' },
    { key: 'adhesionFeePerPerson', value: '3000' },
    { key: 'adhesionFeeEnterpriseCap', value: '100000' },
    { key: 'solidarity.enabled', value: 'true' },
    { key: 'solidarity.surplusShare', value: '0.2' },
    { key: 'solidarity.dynamicShare', value: 'true' },
    { key: 'solidarity.shareLow', value: '0.15' },
    { key: 'solidarity.shareMid', value: '0.25' },
    { key: 'solidarity.shareHigh', value: '0.40' },
    { key: 'solidarity.replenishThreshold', value: '0.15' },
    { key: 'solidarity.replenishShare', value: '0.30' },
    { key: 'solidarity.individualFundCallCap', value: '100000' },
    { key: 'retention.enabled', value: 'true' },
    { key: 'retention.careRecordDays', value: '3650' },
    { key: 'retention.auditDays', value: '1095' },
    { key: 'retention.invoiceDays', value: '3650' },
    { key: 'appName', value: '"SantéPlus Bénin"' },
    {
      key: 'platformRole',
      value: '"Plateforme technologique — le risque est porté par un assureur/mutuelle partenaire agréé."',
    },
  ];
  if (DRY) {
    console.log(`[dry] systemConfig : ${data.length} entrées`);
    return;
  }
  await prisma.systemConfig.createMany({ data, skipDuplicates: true });
  console.log(`  ✓ systemConfig (${data.length} clés)`);
}

async function seedRolePermissions() {
  const data = Object.entries(DEFAULT_ROLE_PERMISSIONS)
    .filter(([role]) => role !== 'SUPER_ADMIN')
    .flatMap(([role, keys]) =>
      (keys as string[]).map((permissionKey) => ({ role, permissionKey })),
    );
  if (DRY) {
    console.log(`[dry] rolePermission : ${data.length} lignes`);
    return;
  }
  await prisma.rolePermission.createMany({ data, skipDuplicates: true });
  console.log(`  ✓ rolePermission (${data.length} lignes)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Référentiels
// ─────────────────────────────────────────────────────────────────────────────

async function seedBranches() {
  const data = [
    { code: 'MAL', name: 'Maladie', description: 'Assurance maladie / santé', sortOrder: 1 },
    { code: 'PREV', name: 'Prévoyance', description: 'Décès, invalidité', sortOrder: 2 },
    { code: 'MAT', name: 'Maternité', description: 'Maternité isolée', sortOrder: 3 },
  ];
  if (DRY) return console.log('[dry] branch : 3');
  await prisma.branch.createMany({ data, skipDuplicates: true });
  console.log('  ✓ branches');
}

async function seedDiseases() {
  const data = [
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
  ];
  if (DRY) return console.log('[dry] disease : 10');
  await prisma.disease.createMany({ data, skipDuplicates: true });
  console.log('  ✓ maladies (10 CIM-10)');
}

async function seedJournalsAndAccounts() {
  const journals = [
    { code: 'OD', name: 'Opérations diverses' },
    { code: 'BQ', name: 'Banque' },
  ];
  const accounts = [
    { code: '702100', name: 'Primes émises — Santé', type: 'REVENUE', sortOrder: 1 },
    { code: '603100', name: 'Sinistres payés — Santé', type: 'EXPENSE', sortOrder: 2 },
    { code: '395000', name: 'Provisions sinistres à payer', type: 'PROVISION', sortOrder: 3 },
    { code: '512000', name: 'Banque', type: 'ASSET', sortOrder: 4 },
    { code: '411100', name: 'Assurés — créances primes', type: 'ASSET', sortOrder: 5 },
    { code: '401100', name: 'Prestataires — dettes sinistres', type: 'LIABILITY', sortOrder: 6 },
    { code: '706100', name: 'Frais d’adhésion', type: 'REVENUE', sortOrder: 7 },
  ];
  if (DRY) return console.log('[dry] journal + account');
  await prisma.journal.createMany({ data: journals, skipDuplicates: true });
  await prisma.account.createMany({ data: accounts, skipDuplicates: true });
  console.log('  ✓ journaux + plan comptable OHADA');
}

async function seedActs() {
  const data = [
    { code: 'CONS-001', name: 'Consultation medecine generale', categoryId: 'CONSULTATION', referencePrice: 10000, sortOrder: 1, requiresPrescription: false, requiresPriorAuth: false, authThreshold: null },
    { code: 'CONS-002', name: 'Consultation specialiste', categoryId: 'CONSULTATION', referencePrice: 25000, sortOrder: 2, requiresPrescription: false, requiresPriorAuth: false, authThreshold: 50000 },
    { code: 'HOSP-001', name: 'Hospitalisation - journee', categoryId: 'HOSPITALIZATION', referencePrice: 45000, sortOrder: 3, requiresPrescription: false, requiresPriorAuth: false, authThreshold: 100000 },
    { code: 'HOSP-002', name: 'Bloc operatoire (forfait)', categoryId: 'HOSPITALIZATION', referencePrice: 350000, sortOrder: 4, requiresPrescription: true, requiresPriorAuth: true, authThreshold: 50000 },
    { code: 'PHAR-001', name: 'Medicaments (ordonnance)', categoryId: 'PHARMACY', referencePrice: 25000, sortOrder: 5, requiresPrescription: true, requiresPriorAuth: false, authThreshold: null },
    { code: 'LABO-001', name: 'Bilan sanguin complet', categoryId: 'LABORATORY', referencePrice: 20000, sortOrder: 6, requiresPrescription: true, requiresPriorAuth: false, authThreshold: 80000 },
    { code: 'LABO-002', name: 'Test paludisme (TDR)', categoryId: 'LABORATORY', referencePrice: 5000, sortOrder: 7, requiresPrescription: false, requiresPriorAuth: false, authThreshold: null },
    { code: 'LABO-003', name: 'Echographie', categoryId: 'LABORATORY', referencePrice: 15000, sortOrder: 8, requiresPrescription: true, requiresPriorAuth: false, authThreshold: null },
    { code: 'SPEC-001', name: 'Seance de dialyse', categoryId: 'SPECIALIZED', referencePrice: 90000, sortOrder: 9, requiresPrescription: true, requiresPriorAuth: true, authThreshold: 50000 },
    { code: 'SPEC-002', name: 'Kinesitherapie (seance)', categoryId: 'SPECIALIZED', referencePrice: 12000, sortOrder: 10, requiresPrescription: true, requiresPriorAuth: false, authThreshold: null },
    { code: 'MAT-001', name: 'Accouchement simple', categoryId: 'MATERNITY', referencePrice: 120000, sortOrder: 11, requiresPrescription: false, requiresPriorAuth: false, authThreshold: 100000 },
    { code: 'MAT-002', name: 'Cesarienne', categoryId: 'MATERNITY', referencePrice: 450000, sortOrder: 12, requiresPrescription: true, requiresPriorAuth: true, authThreshold: 50000 },
    { code: 'DENT-001', name: 'Extraction dentaire', categoryId: 'DENTAL', referencePrice: 15000, sortOrder: 13, requiresPrescription: false, requiresPriorAuth: false, authThreshold: null },
    { code: 'OPT-001', name: 'Lunettes (paire)', categoryId: 'OPTICAL', referencePrice: 60000, sortOrder: 14, requiresPrescription: true, requiresPriorAuth: false, authThreshold: 80000 },
  ];
  if (DRY) return console.log('[dry] act : 14');
  await prisma.act.createMany({ data: data as any, skipDuplicates: true });
  console.log('  ✓ actes (14)');
}

async function seedMedications() {
  const data = [
    { code: 'MED-PARA', name: 'Paracetamol 500mg (boite 20)', dci: 'Paracetamol', dosage: '500 mg', form: 'Comprimes', price: 1500, requiresPrescription: false },
    { code: 'MED-AMOX', name: 'Amoxicilline 500mg (boite 12)', dci: 'Amoxicilline', dosage: '500 mg', form: 'Gelules', price: 3500, requiresPrescription: true },
    { code: 'MED-ARTE', name: 'Artemether-Lumefantrine', dci: 'Artemether/Lumefantrine', dosage: '20/120 mg', form: 'Comprimes', price: 2800, requiresPrescription: true },
    { code: 'MED-IBUP', name: 'Ibuprofene 400mg (boite 20)', dci: 'Ibuprofene', dosage: '400 mg', form: 'Comprimes', price: 1800, requiresPrescription: false },
    { code: 'MED-OMEP', name: 'Omeprazole 20mg (boite 14)', dci: 'Omeprazole', dosage: '20 mg', form: 'Gelules', price: 4200, requiresPrescription: true },
    { code: 'MED-METF', name: 'Metformine 850mg (boite 30)', dci: 'Metformine', dosage: '850 mg', form: 'Comprimes', price: 3900, requiresPrescription: true },
    { code: 'MED-AMLO', name: 'Amlodipine 5mg (boite 30)', dci: 'Amlodipine', dosage: '5 mg', form: 'Comprimes', price: 3200, requiresPrescription: true },
    { code: 'MED-SRO', name: 'SRO (sachets)', dci: 'Sels de rehydratation orale', dosage: '-', form: 'Poudre', price: 600, requiresPrescription: false },
  ];
  if (DRY) return console.log('[dry] medication : 8');
  await prisma.medication.createMany({ data, skipDuplicates: true });
  console.log('  ✓ médicaments (8)');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Garanties, partenaires, formules, prestataires
// ─────────────────────────────────────────────────────────────────────────────

const GUARANTEES = [
  { code: 'HOSP', name: 'Hospitalisation', category: 'HOSPITALIZATION', sortOrder: 1, basePrice: 25000 },
  { code: 'CONS', name: 'Consultations', category: 'CONSULTATION', sortOrder: 2, basePrice: 8000 },
  { code: 'PHAR', name: 'Pharmacie', category: 'PHARMACY', sortOrder: 3, basePrice: 12000 },
  { code: 'LABO', name: 'Analyses & imagerie', category: 'LABORATORY', sortOrder: 4, basePrice: 10000 },
  { code: 'SPEC', name: 'Soins spécialisés', category: 'SPECIALIZED', sortOrder: 5, basePrice: 15000 },
  { code: 'MAT', name: 'Maternité', category: 'MATERNITY', sortOrder: 6, basePrice: 18000 },
  { code: 'DENT', name: 'Soins dentaires', category: 'DENTAL', sortOrder: 7, basePrice: 6000 },
  { code: 'OPT', name: 'Optique', category: 'OPTICAL', sortOrder: 8, basePrice: 5000 },
];

const PRODUCTS = [
  {
    code: 'ESS', name: 'Santé Essentielle', clientType: 'INDIVIDUAL', status: 'ACTIVE', sortOrder: 1, partner: 'B',
    description: "Gestion du risque de base : consultations, pharmacie, analyses et hospitalisation courte. Ticket modérateur de 30% pour responsabiliser l’assuré.",
    minAge: 0, maxAge: 65, waitingPeriodDays: 30,
    basePremiumAnnual: 72000, pricePerAdditionalAdultAnnual: 48000, pricePerChildAnnual: 48000,
    thirdPartyAuthThreshold: 120000, globalAnnualCap: 500000, oopAnnualCap: 200000,
    ageLoadings: [{ minAge: 0, maxAge: 30, factor: 1.0 }, { minAge: 31, maxAge: 45, factor: 1.1 }, { minAge: 46, maxAge: 55, factor: 1.25 }, { minAge: 56, maxAge: 65, factor: 1.4 }],
    beneficiaryRules: { spouse: true, childMaxAge: 21, otherAllowed: false, maxBeneficiaries: 6 },
    eligibilityConditions: { waitingPeriodDays: { default: 30, hospitalization: 90, maternity: null }, copayRate: 30, perActCap: { CONSULTATION: 10000, SPECIALIST: 12000 }, specialistConsultationsPerYear: 3 },
    guarantees: [
      { category: 'HOSPITALIZATION', limit: 150000, rate: 60, copayRate: 40, maxUnitPrice: 45000 },
      { category: 'CONSULTATION', limit: 100000, rate: 70, copayRate: 30, maxUnitPrice: 10000 },
      { category: 'PHARMACY', limit: 180000, rate: 60, copayRate: 40, maxUnitPrice: 15000 },
      { category: 'LABORATORY', limit: 30000, rate: 50, copayRate: 50, maxUnitPrice: 10000 },
    ],
    exclusions: [
      { categoryId: 'MATERNITY', description: 'Maternité non couverte par la formule Essentielle (souscription dédiée requise)' },
      { categoryId: 'DENTAL', description: "Soins dentaires non couverts — frais à 100% charge de l'assuré" },
      { categoryId: 'OPTICAL', description: "Optique non couverte — frais à 100% charge de l'assuré" },
      { categoryId: 'SPECIALIZED', description: "Soins spécialisés non couverts par cette formule d'entrée de gamme" },
    ],
  },
  {
    code: 'CONF', name: 'Santé Confort', clientType: 'INDIVIDUAL', status: 'ACTIVE', sortOrder: 2, partner: 'A',
    description: 'Équilibre entre couverture et rentabilité : consultations, spécialistes, maternité, dentaire et optique. Ticket modérateur 20%.',
    minAge: 0, maxAge: 65, waitingPeriodDays: 30,
    basePremiumAnnual: 144000, pricePerAdditionalAdultAnnual: 108000, pricePerChildAnnual: 108000,
    thirdPartyAuthThreshold: 200000, globalAnnualCap: 1200000, oopAnnualCap: 150000,
    ageLoadings: [{ minAge: 0, maxAge: 30, factor: 1.0 }, { minAge: 31, maxAge: 45, factor: 1.15 }, { minAge: 46, maxAge: 55, factor: 1.35 }, { minAge: 56, maxAge: 65, factor: 1.55 }],
    beneficiaryRules: { spouse: true, childMaxAge: 25, otherAllowed: false, maxBeneficiaries: 8 },
    eligibilityConditions: { waitingPeriodDays: { default: 30, hospitalization: 90, maternity: 300 }, copayRate: 20, perActCap: { CONSULTATION: 12000, SPECIALIST: 15000 }, specialistConsultationsPerYear: 5, opticalEvery2Years: true },
    guarantees: [
      { category: 'HOSPITALIZATION', limit: 500000, rate: 75, copayRate: 25, maxUnitPrice: 45000 },
      { category: 'CONSULTATION', limit: 144000, rate: 80, copayRate: 20, maxUnitPrice: 12000 },
      { category: 'PHARMACY', limit: 360000, rate: 70, copayRate: 30, maxUnitPrice: 30000 },
      { category: 'LABORATORY', limit: 75000, rate: 70, copayRate: 30, maxUnitPrice: 15000 },
      { category: 'SPECIALIZED', limit: 200000, rate: 70, copayRate: 30, maxUnitPrice: 15000 },
      { category: 'MATERNITY', limit: 200000, rate: 100, copayRate: 0, maxUnitPrice: 200000 },
      { category: 'DENTAL', limit: 40000, rate: 60, copayRate: 40, maxUnitPrice: 15000 },
      { category: 'OPTICAL', limit: 30000, rate: 100, copayRate: 0, maxUnitPrice: 30000 },
    ],
    exclusions: [],
  },
  {
    code: 'EXC', name: 'Santé Excellence', clientType: 'INDIVIDUAL', status: 'ACTIVE', sortOrder: 3, partner: 'A',
    description: 'Haute gamme : toutes cliniques, évacuation sanitaire, plafonds élevés. Entente préalable pour les gros actes. Ticket modérateur 10%.',
    minAge: 0, maxAge: 75, waitingPeriodDays: 30,
    basePremiumAnnual: 300000, pricePerAdditionalAdultAnnual: 240000, pricePerChildAnnual: 240000,
    thirdPartyAuthThreshold: 150000, globalAnnualCap: 3000000, oopAnnualCap: 100000,
    ageLoadings: [{ minAge: 0, maxAge: 30, factor: 1.0 }, { minAge: 31, maxAge: 45, factor: 1.15 }, { minAge: 46, maxAge: 55, factor: 1.3 }, { minAge: 56, maxAge: 65, factor: 1.5 }, { minAge: 66, maxAge: 75, factor: 1.7 }],
    beneficiaryRules: { spouse: true, childMaxAge: 26, otherAllowed: true, maxBeneficiaries: 10 },
    eligibilityConditions: { waitingPeriodDays: { default: 30, hospitalization: 90, maternity: 300 }, copayRate: 10, perActCap: { CONSULTATION: 25000, SPECIALIST: 25000 }, priorAuthRequired: true, privateRoomCap: 20000 },
    guarantees: [
      { category: 'HOSPITALIZATION', limit: 1500000, rate: 90, copayRate: 10, maxUnitPrice: 45000 },
      { category: 'CONSULTATION', limit: 300000, rate: 90, copayRate: 10, maxUnitPrice: 25000 },
      { category: 'PHARMACY', limit: 600000, rate: 90, copayRate: 10, maxUnitPrice: 40000 },
      { category: 'LABORATORY', limit: 250000, rate: 90, copayRate: 10, maxUnitPrice: 25000 },
      { category: 'SPECIALIZED', limit: 500000, rate: 90, copayRate: 10, maxUnitPrice: 25000 },
      { category: 'MATERNITY', limit: 400000, rate: 80, copayRate: 20, maxUnitPrice: 400000 },
      { category: 'DENTAL', limit: 100000, rate: 80, copayRate: 20, maxUnitPrice: 15000 },
      { category: 'OPTICAL', limit: 80000, rate: 70, copayRate: 30, maxUnitPrice: 80000 },
    ],
    exclusions: [],
  },
  {
    code: 'ENT-PERF', name: 'Entreprise Performance', clientType: 'COMPANY', status: 'ACTIVE', sortOrder: 1, partner: 'A',
    description: 'Couverture collective à co-partage employeur/salarié. Plafond annuel strict de 500 000 FCFA/salarié pour maîtriser les coûts.',
    minAge: 18, maxAge: 63, waitingPeriodDays: 15,
    basePremiumAnnual: 120000, pricePerAdditionalAdultAnnual: 0, pricePerChildAnnual: 48000,
    thirdPartyAuthThreshold: 150000, globalAnnualCap: 500000, oopAnnualCap: 150000,
    ageLoadings: [],
    beneficiaryRules: { spouse: true, childMaxAge: 23, otherAllowed: false, maxBeneficiaries: 6 },
    eligibilityConditions: { waitingPeriodDays: { default: 15, hospitalization: 90, maternity: 300 }, copayRate: 30, employerShare: 5000, employeeShare: 5000, globalAnnualCapPerEmployee: 500000 },
    guarantees: [
      { category: 'HOSPITALIZATION', limit: 350000, rate: 70, copayRate: 30 },
      { category: 'CONSULTATION', limit: 120000, rate: 70, copayRate: 30 },
      { category: 'PHARMACY', limit: 300000, rate: 70, copayRate: 30 },
      { category: 'LABORATORY', limit: 50000, rate: 70, copayRate: 30 },
      { category: 'MATERNITY', limit: 150000, rate: 100, copayRate: 0 },
    ],
    exclusions: [
      { categoryId: 'DENTAL', description: 'Soins dentaires non couverts par le contrat Entreprise Performance' },
      { categoryId: 'OPTICAL', description: 'Optique non couverte par le contrat Entreprise Performance' },
      { categoryId: 'SPECIALIZED', description: 'Soins spécialisés non couverts — formule Cadre requise' },
    ],
  },
  {
    code: 'ENT-VIP', name: 'Entreprise Cadre / VIP', clientType: 'COMPANY', status: 'ACTIVE', sortOrder: 2, partner: 'A',
    description: 'Couverture premium pour cadres : entente préalable exigée pour hospitalisations, plafond annuel 1,2M FCFA/salarié.',
    minAge: 18, maxAge: 65, waitingPeriodDays: 15,
    basePremiumAnnual: 240000, pricePerAdditionalAdultAnnual: 0, pricePerChildAnnual: 96000,
    thirdPartyAuthThreshold: 100000, globalAnnualCap: 1200000, oopAnnualCap: 100000,
    ageLoadings: [],
    beneficiaryRules: { spouse: true, childMaxAge: 25, otherAllowed: false, maxBeneficiaries: 8 },
    eligibilityConditions: { waitingPeriodDays: { default: 15, hospitalization: 90, maternity: 300 }, copayRate: 10, employerShare: 10000, employeeShare: 10000, globalAnnualCapPerEmployee: 1200000, priorAuthRequired: true },
    guarantees: [
      { category: 'HOSPITALIZATION', limit: 1000000, rate: 90, copayRate: 10 },
      { category: 'CONSULTATION', limit: 240000, rate: 90, copayRate: 10 },
      { category: 'PHARMACY', limit: 480000, rate: 85, copayRate: 15 },
      { category: 'LABORATORY', limit: 150000, rate: 85, copayRate: 15 },
      { category: 'SPECIALIZED', limit: 400000, rate: 85, copayRate: 15 },
      { category: 'MATERNITY', limit: 300000, rate: 85, copayRate: 15 },
      { category: 'DENTAL', limit: 60000, rate: 70, copayRate: 30 },
      { category: 'OPTICAL', limit: 50000, rate: 60, copayRate: 40 },
    ],
    exclusions: [],
  },
];

const PROVIDERS = [
  { name: 'CHU Hubert Koutoukou Maga', type: 'HOSPITAL', city: 'Cotonou', address: 'Avenue Jean-Paul II', phone: '+229 21 30 01 81', lat: 6.357, lng: 2.429, specialties: 'Médecine générale, chirurgie, pédiatrie', openingHours: '24h/24', services: 'Urgences, hospitalisation, imagerie', conventionLevel: 'PREMIUM', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=400&fit=crop' },
  { name: 'Clinique Mahouna', type: 'CLINIC', city: 'Cotonou', address: 'Carré 1100, Fidjrossè', phone: '+229 21 24 10 10', lat: 6.365, lng: 2.395, specialties: 'Gynécologie, médecine générale', openingHours: 'Lun-Sam 7h-20h', services: 'Consultations, échographie, petite chirurgie', conventionLevel: 'PLUS', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=400&fit=crop' },
  { name: 'Polyclinique Les Cocotiers', type: 'CLINIC', city: 'Cotonou', address: 'Rue 12.068, Haie Vive', phone: '+229 21 31 04 04', lat: 6.373, lng: 2.416, specialties: 'Cardiologie, diabétologie, ophtalmologie', openingHours: 'Lun-Ven 8h-19h', services: 'Consultations spécialisées, laboratoire', conventionLevel: 'PLUS', thirdPartyPayer: false, photoUrl: 'https://images.unsplash.com/photo-1586776802477-3680284edb9e?w=600&h=400&fit=crop' },
  { name: 'Pharmacie du Rond-Point', type: 'PHARMACY', city: 'Cotonou', address: 'Rond-point Dantokpa', phone: '+229 21 31 55 66', lat: 6.369, lng: 2.428, openingHours: 'Lun-Dim 8h-22h', services: 'Médicaments, parapharmacie', conventionLevel: 'BASIC', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=600&h=400&fit=crop' },
  { name: 'Laboratoire Bio Cotonou', type: 'LABORATORY', city: 'Cotonou', address: 'Avenue Steinmetz', phone: '+229 97 00 11 22', lat: 6.362, lng: 2.421, openingHours: 'Lun-Sam 7h-18h', services: 'Analyses médicales générales, sérologie', conventionLevel: 'PLUS', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?w=600&h=400&fit=crop' },
  { name: 'Centre de Santé d’Abomey-Calavi', type: 'HEALTH_CENTER', city: 'Abomey-Calavi', address: 'Carrefour Tankpè', phone: '+229 21 36 00 21', lat: 6.449, lng: 2.356, openingHours: '24h/24', services: 'Consultations, maternité, vaccination', conventionLevel: 'BASIC', thirdPartyPayer: false, photoUrl: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=600&h=400&fit=crop' },
  { name: 'Clinique Universitaire Godomey', type: 'CLINIC', city: 'Abomey-Calavi', address: 'Godomey Carrefour', phone: '+229 21 36 44 55', lat: 6.451, lng: 2.341, specialties: 'Médecine générale, pédiatrie', openingHours: 'Lun-Dim 7h-21h', services: 'Consultations, hospitalisation courte', conventionLevel: 'BASIC', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=400&fit=crop' },
  { name: 'CHU-MEL Départamental Ouémé', type: 'HOSPITAL', city: 'Porto-Novo', address: 'Quartier Djègan-Kpèvi', phone: '+229 20 22 50 40', lat: 6.497, lng: 2.605, specialties: 'Chirurgie, médecine interne', openingHours: '24h/24', services: 'Urgences, hospitalisation, scanner', conventionLevel: 'PLUS', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&h=400&fit=crop' },
  { name: 'Pharmacie Portovoise', type: 'PHARMACY', city: 'Porto-Novo', address: 'Avenue Bayol', phone: '+229 20 21 33 77', lat: 6.493, lng: 2.612, openingHours: 'Lun-Sam 8h-21h', services: 'Médicaments', conventionLevel: 'BASIC', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1585435557343-3b092031a831?w=600&h=400&fit=crop' },
  { name: 'CHU Borgou Alibori', type: 'HOSPITAL', city: 'Parakou', address: 'Boulevard de la République', phone: '+229 23 61 20 60', lat: 9.337, lng: 2.618, specialties: 'Chirurgie viscérale, traumatologie', openingHours: '24h/24', services: 'Urgences, hospitalisation', conventionLevel: 'PLUS', thirdPartyPayer: true, photoUrl: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=600&h=400&fit=crop' },
  { name: 'Cabinet Dentaire Sourire', type: 'MEDICAL_CABINET', city: 'Cotonou', address: 'Fidjrossè plage', phone: '+229 95 12 34 56', lat: 6.36, lng: 2.388, specialties: 'Odontostomatologie', openingHours: 'Lun-Ven 8h-17h', services: 'Soins dentaires, détartrage', conventionLevel: 'BASIC', thirdPartyPayer: false, photoUrl: 'https://images.unsplash.com/photo-1607613009820-a29f7bb81dcc?w=600&h=400&fit=crop' },
  { name: 'Dr Sossah — Ophtalmologue', type: 'SPECIALIST', city: 'Cotonou', address: 'Cadjèhoun, rue des Ambassadeurs', phone: '+229 21 34 98 76', lat: 6.356, lng: 2.409, specialties: 'Ophtalmologie', openingHours: 'Sur rendez-vous', services: 'Consultation, chirurgie cataracte', conventionLevel: 'PLUS', thirdPartyPayer: false, photoUrl: 'https://images.unsplash.com/photo-1559757148-5c17d594a11?w=600&h=400&fit=crop' },
];

async function seedCatalogue() {
  // Garanties — la catégorie sert de clef pour rattacher les garanties aux formules.
  const guarantees: Record<string, string> = {};
  for (const g of GUARANTEES) {
    const found = await prisma.guarantee.findFirst({ where: { code: g.code } });
    guarantees[g.category] = found?.id ?? (await ensureOne(prisma.guarantee, { code: g.code }, g, `garantie ${g.code}`)).id;
  }
  console.log(`  ✓ garanties (${GUARANTEES.length})`);

  const partners: Record<string, string> = {};
  const partnerDefs = [
    { key: 'A', name: 'Assurance Partenaire SA', kind: 'INSURER', agreementNumber: 'CONV-2026-001', contactEmail: 'partenaire@assurance-bj.example', phone: '+229 21 30 00 01' },
    { key: 'B', name: 'Mutuelle Santé Zémidjan', kind: 'MUTUAL', agreementNumber: 'CONV-2026-002', contactEmail: 'contact@mutuelle-zem.example', phone: '+229 21 30 00 02' },
  ];
  for (const p of partnerDefs) {
    const found = await prisma.insurerPartner.findFirst({ where: { agreementNumber: p.agreementNumber } });
    const { key, ...rest } = p;
    partners[key] = found?.id ?? (await ensureOne(prisma.insurerPartner, { agreementNumber: p.agreementNumber }, rest, `partenaire ${p.name}`)).id;
  }
  console.log('  ✓ partenaires assureurs (2)');

  // Le contrôle de la branche vient APRÈS le court-circuit dry-run : en mode
  // dry les branches ne sont pas créées, la vérifier ici ferait échouer le dry-run.
  if (DRY) {
    console.log(`[dry] product : ${PRODUCTS.length} · provider : ${PROVIDERS.length}`);
    return;
  }

  const branch = await prisma.branch.findFirst({ where: { code: 'MAL' } });
  if (!branch) throw new Error('branche MAL introuvable — seedBranches() doit passer avant');

  for (const p of PRODUCTS) {
    const { guarantees: gs, exclusions, partner, ...rest } = p;
    const existing = await prisma.product.findFirst({ where: { code: rest.code } });
    if (existing) {
      console.log(`  = formule ${rest.code} déjà présente`);
      continue;
    }
    await prisma.product.create({
      data: {
        ...rest,
        branchId: branch.id,
        insurerPartnerId: partners[partner],
        beneficiaryRules: JSON.stringify(rest.beneficiaryRules),
        ageLoadings: JSON.stringify(rest.ageLoadings ?? []),
        eligibilityConditions: JSON.stringify(rest.eligibilityConditions ?? null),
        frequencyFactors: JSON.stringify({ ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.06 }),
        guarantees: {
          create: gs.map((g: any) => ({
            guaranteeId: guarantees[g.category],
            annualLimit: g.limit ?? null,
            rate: g.rate,
            minRate: g.minRate ?? g.rate,
            maxRate: g.maxRate ?? g.rate,
            minLimit: g.minLimit ?? g.limit ?? 0,
            maxLimit: g.maxLimit ?? (g.limit ? g.limit * 2 : 10000000),
            limitStep: g.limitStep ?? 0,
            pricePerLimitStep: 0,
            copayRate: g.copayRate ?? 15,
            mandatory: true,
            customizable: false,
          })),
        },
        exclusions: {
          create: (exclusions ?? []).map((e: any) => ({
            categoryId: e.categoryId ? guarantees[e.categoryId] : null,
            description: e.description,
          })),
        },
      } as any,
    });
    console.log(`  + formule ${rest.code} — ${rest.name}`);
  }

  for (const p of PROVIDERS) {
    const existing = await prisma.provider.findFirst({ where: { name: p.name } });
    if (existing) continue;
    await prisma.provider.create({ data: { ...p, partnerStatus: 'ACTIVE', active: true } as any });
    console.log(`  + ${p.name}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Vérification finale
// ─────────────────────────────────────────────────────────────────────────────

async function report() {
  const [products, providers, guarantees, users] = await Promise.all([
    prisma.product.count({ where: { status: 'ACTIVE' } }),
    prisma.provider.count(),
    prisma.guarantee.count(),
    prisma.user.count(),
  ]);
  console.log('\n── Catalogue en base ──────────────────────────');
  console.log(`  formules actives  : ${products}`);
  console.log(`  prestataires       : ${providers}`);
  console.log(`  garanties          : ${guarantees}`);
  console.log(`  comptes            : ${users}  (0 attendu — la garde de prod reste satisfaite)`);
  if (users > 0) {
    const risky = await prisma.user.findMany({
      where: { email: { endsWith: '@demo.bj' } },
      select: { email: true },
    });
    if (risky.length) {
      console.warn(
        `\n⚠️  ${risky.length} compte(s) @demo.bj présents : la garde de boot PRODUCTION refusera de démarrer`,
      );
      console.warn(`    ${risky.map((u) => u.email).join(', ')}`);
      console.warn('    Supprime-les ou change leurs mots de passe avant de redéployer.');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  if (DRY) console.log('MODE DRY-RUN — aucune écriture\n');
  else console.log('Seed catalogue (non destructif, idempotent)\n');
  await seedSystemConfig();
  await seedRolePermissions();
  await seedBranches();
  await seedDiseases();
  await seedJournalsAndAccounts();
  await seedActs();
  await seedMedications();
  await seedCatalogue();
  if (!DRY) {
    console.log('\nCatalogue terminé.');
    await report();
  } else {
    console.log('\nDRY-RUN terminé — rien n’a été écrit.');
  }
}

main()
  .catch((e) => {
    console.error('ECHEC du seed catalogue :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
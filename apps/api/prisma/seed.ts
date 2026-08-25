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
  PROVIDER: ['provider.verify', 'provider.thirdparty', 'provider.staff'],
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
    prisma.payment.deleteMany(),
    prisma.contribution.deleteMany(),
    prisma.fileObject.deleteMany(),
    prisma.beneficiary.deleteMany(),
    prisma.contract.updateMany({ data: { groupContractId: null } }),
    prisma.contract.deleteMany(),
    prisma.productExclusion.deleteMany(),
    prisma.productGuarantee.deleteMany(),
    prisma.product.deleteMany(),
    prisma.guarantee.deleteMany(),
    prisma.insurerPartner.deleteMany(),
    prisma.provider.deleteMany(),
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
      { key: 'appName', value: '"SantÃ©Plus BÃ©nin"' },
      { key: 'platformRole', value: '"Plateforme technologique â€” le risque est portÃ© par un assureur/mutuelle partenaire agrÃ©Ã©."' },
    ],
  });

  for (const [role, keys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    if (role === 'SUPER_ADMIN') continue;
    await prisma.rolePermission.createMany({ data: keys.map(permissionKey => ({ role, permissionKey })) });
  }
  console.log('RÃ´les et configuration OK');

  const guaranteesData = [
    { code: 'HOSP', name: 'Hospitalisation', category: 'HOSPITALIZATION', sortOrder: 1 },
    { code: 'CONS', name: 'Consultations', category: 'CONSULTATION', sortOrder: 2 },
    { code: 'PHAR', name: 'Pharmacie', category: 'PHARMACY', sortOrder: 3 },
    { code: 'LABO', name: 'Analyses & imagerie', category: 'LABORATORY', sortOrder: 4 },
    { code: 'SPEC', name: 'Soins spÃ©cialisÃ©s', category: 'SPECIALIZED', sortOrder: 5 },
    { code: 'MAT', name: 'MaternitÃ©', category: 'MATERNITY', sortOrder: 6 },
    { code: 'DENT', name: 'Soins dentaires', category: 'DENTAL', sortOrder: 7 },
    { code: 'OPT', name: 'Optique', category: 'OPTICAL', sortOrder: 8 },
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
    return prisma.product.create({
      data: {
        ...rest,
        beneficiaryRules: JSON.stringify(rest.beneficiaryRules),
        frequencyFactors: JSON.stringify(rest.frequencyFactors ?? { ANNUAL: 1, QUARTERLY: 1.03, MONTHLY: 1.06 }),
        guarantees: {
          create: gs.map((g: any) => ({
            guaranteeId: guarantees[g.category],
            annualLimit: g.limit ?? null,
            rate: g.rate,
            deductibleType: g.deductibleType ?? 'NONE',
            deductibleValue: g.deductibleValue ?? 0,
          })),
        },
        exclusions: { create: (exclusions ?? []).map((e: any) => ({ categoryId: e.categoryId ? guarantees[e.categoryId] : null, description: e.description })) },
      },
    });
  }

  const prodEssentielle = await createProduct({
    code: 'ESS', name: 'Formule Essentielle', clientType: 'INDIVIDUAL', status: 'ACTIVE', sortOrder: 1,
    description: "L'essentiel pour se soigner sereinement : hospitalisation, consultations, pharmacie et analyses.",
    minAge: 0, maxAge: 65, waitingPeriodDays: 30,
    basePremiumAnnual: 45000, pricePerAdditionalAdultAnnual: 30000, pricePerChildAnnual: 20000,
    insurerPartnerId: partnerB.id,
    beneficiaryRules: { spouse: true, childMaxAge: 21, otherAllowed: false, maxBeneficiaries: 6 },
    guarantees: [
      { category: 'HOSPITALIZATION', limit: 3000000, rate: 80 },
      { category: 'CONSULTATION', limit: 100000, rate: 70 },
      { category: 'PHARMACY', limit: 250000, rate: 70 },
      { category: 'LABORATORY', limit: 150000, rate: 80 },
    ],
    exclusions: [{ categoryId: 'DENTAL', description: 'Soins dentaires non couverts par la formule Essentielle' }],
  });

  const prodConfort = await createProduct({
    code: 'CONF', name: 'Formule Confort', clientType: 'INDIVIDUAL', status: 'ACTIVE', sortOrder: 2,
    description: 'Garanties renforcÃ©es : maternitÃ©, soins spÃ©cialisÃ©s et plafonds plus Ã©levÃ©s.',
    minAge: 0, maxAge: 65, waitingPeriodDays: 30,
    basePremiumAnnual: 75000, pricePerAdditionalAdultAnnual: 45000, pricePerChildAnnual: 28000,
    insurerPartnerId: partnerA.id,
    beneficiaryRules: { spouse: true, childMaxAge: 25, otherAllowed: false, maxBeneficiaries: 8 },
    guarantees: [
      { category: 'HOSPITALIZATION', limit: 5000000, rate: 85 },
      { category: 'CONSULTATION', limit: 150000, rate: 80 },
      { category: 'PHARMACY', limit: 400000, rate: 75 },
      { category: 'LABORATORY', limit: 250000, rate: 85 },
      { category: 'SPECIALIZED', limit: 500000, rate: 70 },
      { category: 'MATERNITY', limit: 400000, rate: 60, deductibleType: 'FIXED', deductibleValue: 10000 },
    ],
  });

  const prodPremium = await createProduct({
    code: 'PREM', name: 'Formule Premium', clientType: 'INDIVIDUAL', status: 'ACTIVE', sortOrder: 3,
    description: 'La protection la plus complÃ¨te : plafonds Ã©levÃ©s, optique et dentaire inclus.',
    minAge: 0, maxAge: 70, waitingPeriodDays: 0,
    basePremiumAnnual: 120000, pricePerAdditionalAdultAnnual: 70000, pricePerChildAnnual: 42000,
    insurerPartnerId: partnerA.id,
    beneficiaryRules: { spouse: true, childMaxAge: 26, otherAllowed: true, maxBeneficiaries: 10 },
    eligibilityConditions: "Aucun dÃ©lai de carence. Questionnaire de santÃ© simplifiÃ©.",
    guarantees: [
      { category: 'HOSPITALIZATION', limit: 10000000, rate: 90 },
      { category: 'CONSULTATION', limit: 250000, rate: 85 },
      { category: 'PHARMACY', limit: 600000, rate: 80 },
      { category: 'LABORATORY', limit: 400000, rate: 90 },
      { category: 'SPECIALIZED', limit: 1000000, rate: 80 },
      { category: 'MATERNITY', limit: 700000, rate: 70 },
      { category: 'DENTAL', limit: 200000, rate: 70 },
      { category: 'OPTICAL', limit: 100000, rate: 60, deductibleType: 'PERCENT', deductibleValue: 10 },
    ],
  });

  const prodEntreprise = await createProduct({
    code: 'ENT-COLL', name: 'Collective Entreprise', clientType: 'COMPANY', status: 'ACTIVE', sortOrder: 1,
    description: 'Couverture collective pour vos salariÃ©s et leurs ayants droit.',
    minAge: 18, maxAge: 63, waitingPeriodDays: 15,
    basePremiumAnnual: 0, pricePerAdditionalAdultAnnual: 55000, pricePerChildAnnual: 35000,
    insurerPartnerId: partnerA.id,
    beneficiaryRules: { spouse: true, childMaxAge: 23, otherAllowed: false, maxBeneficiaries: 6 },
    guarantees: [
      { category: 'HOSPITALIZATION', limit: 6000000, rate: 85 },
      { category: 'CONSULTATION', limit: 180000, rate: 80 },
      { category: 'PHARMACY', limit: 450000, rate: 75 },
      { category: 'LABORATORY', limit: 300000, rate: 85 },
      { category: 'SPECIALIZED', limit: 600000, rate: 70 },
      { category: 'MATERNITY', limit: 450000, rate: 65 },
    ],
  });
  console.log('Produits crÃ©Ã©s');

  const providersData = [
    { name: 'CHU Hubert Koutoukou Maga', type: 'HOSPITAL', city: 'Cotonou', address: 'Avenue Jean-Paul II', phone: '+229 21 30 01 81', lat: 6.357, lng: 2.429, specialties: 'MÃ©decine gÃ©nÃ©rale, chirurgie, pÃ©diatrie', openingHours: '24h/24', services: 'Urgences, hospitalisation, imagerie', conventionLevel: 'PREMIUM', thirdPartyPayer: true },
    { name: 'Clinique Mahouna', type: 'CLINIC', city: 'Cotonou', address: 'CarrÃ© 1100, FidjrossÃ¨', phone: '+229 21 24 10 10', lat: 6.365, lng: 2.395, specialties: 'GynÃ©cologie, mÃ©decine gÃ©nÃ©rale', openingHours: 'Lun-Sam 7h-20h', services: 'Consultations, Ã©chographie, petite chirurgie', conventionLevel: 'PLUS', thirdPartyPayer: true },
    { name: 'Polyclinique Les Cocotiers', type: 'CLINIC', city: 'Cotonou', address: 'Rue 12.068, Haie Vive', phone: '+229 21 31 04 04', lat: 6.373, lng: 2.416, specialties: 'Cardiologie, diabÃ©tologie, ophtalmologie', openingHours: 'Lun-Ven 8h-19h', services: 'Consultations spÃ©cialisÃ©es, laboratoire', conventionLevel: 'PLUS', thirdPartyPayer: false },
    { name: 'Pharmacie du Rond-Point', type: 'PHARMACY', city: 'Cotonou', address: 'Rond-point Dantokpa', phone: '+229 21 31 55 66', lat: 6.369, lng: 2.428, openingHours: 'Lun-Dim 8h-22h', services: 'MÃ©dicaments, parapharmacie', conventionLevel: 'BASIC', thirdPartyPayer: true },
    { name: 'Laboratoire Bio Cotonou', type: 'LABORATORY', city: 'Cotonou', address: 'Avenue Steinmetz', phone: '+229 97 00 11 22', lat: 6.362, lng: 2.421, openingHours: 'Lun-Sam 7h-18h', services: 'Analyses mÃ©dicales gÃ©nÃ©rales, sÃ©rologie', conventionLevel: 'PLUS', thirdPartyPayer: true },
    { name: 'Centre de SantÃ© dâ€™Abomey-Calavi', type: 'HEALTH_CENTER', city: 'Abomey-Calavi', address: 'Carrefour TankpÃ¨', phone: '+229 21 36 00 21', lat: 6.449, lng: 2.356, openingHours: '24h/24', services: 'Consultations, maternitÃ©, vaccination', conventionLevel: 'BASIC', thirdPartyPayer: false },
    { name: 'Clinique Universitaire Godomey', type: 'CLINIC', city: 'Abomey-Calavi', address: 'Godomey Carrefour', phone: '+229 21 36 44 55', lat: 6.451, lng: 2.341, specialties: 'MÃ©decine gÃ©nÃ©rale, pÃ©diatrie', openingHours: 'Lun-Dim 7h-21h', services: 'Consultations, hospitalisation courte', conventionLevel: 'BASIC', thirdPartyPayer: true },
    { name: 'CHU-MEL DÃ©partmental OuÃ©mÃ©', type: 'HOSPITAL', city: 'Porto-Novo', address: 'Quartier DjÃ¨gan-KpÃ¨vi', phone: '+229 20 22 50 40', lat: 6.497, lng: 2.605, specialties: 'Chirurgie, mÃ©decine interne', openingHours: '24h/24', services: 'Urgences, hospitalisation, scanner', conventionLevel: 'PLUS', thirdPartyPayer: true },
    { name: 'Pharmacie Portovoise', type: 'PHARMACY', city: 'Porto-Novo', address: 'Avenue Bayol', phone: '+229 20 21 33 77', lat: 6.493, lng: 2.612, openingHours: 'Lun-Sam 8h-21h', services: 'MÃ©dicaments', conventionLevel: 'BASIC', thirdPartyPayer: true },
    { name: 'CHU Borgou Alibori', type: 'HOSPITAL', city: 'Parakou', address: 'Boulevard de la RÃ©publique', phone: '+229 23 61 20 60', lat: 9.337, lng: 2.618, specialties: 'Chirurgie viscÃ©rale, traumatologie', openingHours: '24h/24', services: 'Urgences, hospitalisation', conventionLevel: 'PLUS', thirdPartyPayer: true },
    { name: 'Cabinet Dentaire Sourire', type: 'MEDICAL_CABINET', city: 'Cotonou', address: 'FidjrossÃ¨ plage', phone: '+229 95 12 34 56', lat: 6.36, lng: 2.388, specialties: 'Odontostomatologie', openingHours: 'Lun-Ven 8h-17h', services: 'Soins dentaires, dÃ©tartrage', conventionLevel: 'BASIC', thirdPartyPayer: false },
    { name: 'Dr Sossah â€” Ophtalmologue', type: 'SPECIALIST', city: 'Cotonou', address: 'CadjÃ¨houn, rue des Ambassadeurs', phone: '+229 21 34 98 76', lat: 6.356, lng: 2.409, specialties: 'Ophtalmologie', openingHours: 'Sur rendez-vous', services: 'Consultation, chirurgie cataracte', conventionLevel: 'PLUS', thirdPartyPayer: false },
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
    { code: 'CONS-001', name: 'Consultation mÃ©decine gÃ©nÃ©rale', category: 'CONSULTATION', price: 10000 },
    { code: 'CONS-002', name: 'Consultation spÃ©cialiste', category: 'CONSULTATION', price: 25000 },
    { code: 'HOSP-001', name: 'Hospitalisation â€” journÃ©e', category: 'HOSPITALIZATION', price: 45000 },
    { code: 'HOSP-002', name: 'Bloc opÃ©ratoire (forfait)', category: 'HOSPITALIZATION', price: 350000 },
    { code: 'PHAR-001', name: 'MÃ©dicaments (ordonnance)', category: 'PHARMACY', price: 25000 },
    { code: 'LABO-001', name: 'Bilan sanguin complet', category: 'LABORATORY', price: 20000 },
    { code: 'LABO-002', name: 'Test paludisme (TDR)', category: 'LABORATORY', price: 5000 },
    { code: 'LABO-003', name: 'Ã‰chographie', category: 'LABORATORY', price: 15000 },
    { code: 'SPEC-001', name: 'SÃ©ance de dialyse', category: 'SPECIALIZED', price: 90000 },
    { code: 'SPEC-002', name: 'KinÃ©sithÃ©rapie (sÃ©ance)', category: 'SPECIALIZED', price: 12000 },
    { code: 'MAT-001', name: 'Accouchement simple', category: 'MATERNITY', price: 120000 },
    { code: 'MAT-002', name: 'CÃ©sarienne', category: 'MATERNITY', price: 450000 },
    { code: 'DENT-001', name: 'Extraction dentaire', category: 'DENTAL', price: 15000 },
    { code: 'OPT-001', name: 'Lunettes (paire)', category: 'OPTICAL', price: 60000 },
  ];
  for (const [i, a] of actsData.entries()) {
    await prisma.act.create({
      data: { code: a.code, name: a.name, categoryId: a.category, referencePrice: a.price, sortOrder: i + 1 },
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
        principalUserId: user.id, productId: prodEntreprise.id, companyId: company1.id,
        startDate: groupStart, endDate: groupEnd, premiumAnnual: 0, frequency: 'QUARTERLY',
        quote: JSON.stringify({ viaGroup: 'collectif' }), cardToken: `tok_emp${empIdx}_demo`,
      },
    });
  }

  const groupContract = await prisma.contract.create({
    data: {
      number: 'CTR-COLLECTIF-001',
      kind: 'GROUP', status: 'ACTIVE',
      principalUserId: companyAdmin.id, productId: prodEntreprise.id, companyId: company1.id,
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
      decisionNote: 'Prestation hors garanties du contrat (soins dentaires exclus par la formule Confort).',
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
  console.log('  jean@demo.bj               AssurÃ© (formule Confort)');
  console.log('  fatou@demo.bj              AssurÃ©e (formule Essentielle)');
  console.log('  kossi@demo.bj              AssurÃ© (souscription Ã  payer)');
  console.log('  prestataire@santeplus.bj   Prestataire (vÃ©rification QR)');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

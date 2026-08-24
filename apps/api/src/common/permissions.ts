export const ROLES = ['SUPER_ADMIN', 'INSURANCE_MANAGER', 'SUPPORT_AGENT', 'COMPANY_ADMIN', 'MEMBER', 'PROVIDER'] as const;
export type Role = typeof ROLES[number];

export const PERMISSION_LABELS: Record<string, string> = {
  'members.read': 'Consulter les assurés',
  'members.manage': 'Gérer les assurés',
  'companies.read': 'Consulter les entreprises',
  'companies.manage': 'Gérer les entreprises',
  'products.manage': 'Gérer les produits et garanties',
  'partners.manage': 'Gérer les partenaires assureurs',
  'providers.read': 'Consulter le réseau de soins',
  'providers.manage': 'Gérer le réseau de soins',
  'contracts.viewAll': 'Voir tous les contrats',
  'contracts.manage': 'Gérer les contrats',
  'claims.viewAll': 'Voir toutes les demandes de remboursement',
  'claims.decide': 'Décider des remboursements',
  'payments.viewAll': 'Voir tous les paiements',
  'payments.manage': 'Gérer les paiements',
  'stats.admin': 'Statistiques globales',
  'audit.view': "Journal d'audit",
  'roles.manage': 'Gérer les rôles et permissions',
  'config.manage': 'Paramètres système',
  'company.dashboard': 'Tableau de bord entreprise',
  'company.employees.manage': 'Gérer les salariés',
  'company.claims.view': 'Suivre la sinistralité salariés',
  'company.contracts.manage': 'Gérer le contrat collectif',
  'provider.verify': 'Vérifier une carte assuré (QR)',
  'provider.thirdparty': 'Tiers payant — prise en charge au cabinet',
};

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: Object.keys(PERMISSION_LABELS),
  INSURANCE_MANAGER: [
    'members.read', 'members.manage', 'companies.read', 'providers.read', 'providers.manage',
    'contracts.viewAll', 'contracts.manage', 'claims.viewAll', 'claims.decide',
    'payments.viewAll', 'payments.manage', 'stats.admin',
  ],
  SUPPORT_AGENT: ['members.read', 'providers.read', 'claims.viewAll', 'contracts.viewAll'],
  COMPANY_ADMIN: ['company.dashboard', 'company.employees.manage', 'company.claims.view', 'company.contracts.manage'],
  MEMBER: [],
  PROVIDER: ['provider.verify', 'provider.thirdparty'],
};

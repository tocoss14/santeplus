export const ROLES = ['SUPER_ADMIN', 'INSURANCE_MANAGER', 'SUPPORT_AGENT', 'COMPANY_ADMIN', 'MEMBER', 'PROVIDER'] as const;
export type Role = typeof ROLES[number];

export const PERMISSION_LABELS: Record<string, string> = {
  'members.read': 'Consulter les assurÃ©s',
  'members.manage': 'GÃ©rer les assurÃ©s',
  'companies.read': 'Consulter les entreprises',
  'companies.manage': 'GÃ©rer les entreprises',
  'products.manage': 'GÃ©rer les produits et garanties',
  'partners.manage': 'GÃ©rer les partenaires assureurs',
  'providers.read': 'Consulter le rÃ©seau de soins',
  'providers.manage': 'GÃ©rer le rÃ©seau de soins',
  'contracts.viewAll': 'Voir tous les contrats',
  'contracts.manage': 'GÃ©rer les contrats',
  'claims.viewAll': 'Voir toutes les demandes de remboursement',
  'claims.decide': 'DÃ©cider des remboursements',
  'payments.viewAll': 'Voir tous les paiements',
  'payments.manage': 'GÃ©rer les paiements',
  'stats.admin': 'Statistiques globales',
  'audit.view': "Journal d'audit",
  'roles.manage': 'GÃ©rer les rÃ´les et permissions',
  'config.manage': 'ParamÃ¨tres systÃ¨me',
  'accounting.view': 'Comptabilité technique',
  'referential.manage': 'Gérer branches et maladies',
  'company.dashboard': 'Tableau de bord entreprise',
  'company.employees.manage': 'GÃ©rer les salariÃ©s',
  'company.claims.view': 'Suivre la sinistralitÃ© salariÃ©s',
  'company.contracts.manage': 'GÃ©rer le contrat collectif',
  'provider.verify': 'VÃ©rifier une carte assurÃ© (QR)',
  'provider.thirdparty': 'Tiers payant â€” prise en charge au cabinet',
  'provider.prescribe': 'Prescrire (médecin / prescripteur habilité)',
  'provider.staff': "GÃ©rer le personnel de l'Ã©tablissement",
  'provider.emergencyOverride': 'Forcer une délivrance urgente sans autorisation préalable (avec justification)',
};

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: Object.keys(PERMISSION_LABELS),
  INSURANCE_MANAGER: [
    'members.read', 'members.manage', 'companies.read', 'providers.read', 'providers.manage',
    'contracts.viewAll', 'contracts.manage', 'claims.viewAll', 'claims.decide',
    'payments.viewAll', 'payments.manage', 'stats.admin', 'accounting.view', 'referential.manage',
  ],
  SUPPORT_AGENT: ['members.read', 'providers.read', 'claims.viewAll', 'contracts.viewAll'],
  COMPANY_ADMIN: ['company.dashboard', 'company.employees.manage', 'company.claims.view', 'company.contracts.manage'],
  MEMBER: [],
  PROVIDER: ['provider.verify', 'provider.thirdparty', 'provider.staff', 'provider.prescribe', 'provider.emergencyOverride'],
};

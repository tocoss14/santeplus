export const fcfa = (n: number | null | undefined): string =>
  n == null ? '—' : `${new Intl.NumberFormat('fr-FR').format(n)} FCFA`;

export const fmtDate = (d: string | Date | null | undefined): string =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (d: string | Date | null | undefined): string =>
  d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumise',
  UNDER_REVIEW: 'En contrôle',
  INFO_REQUESTED: 'Infos requises',
  APPROVED: 'Validée',
  PARTIALLY_APPROVED: 'Partiellement validée',
  REJECTED: 'Rejetée',
  PAID: 'Payée',
  ENGAGED: 'Engagée',
  ACTIVE: 'Actif',
  PENDING_PAYMENT: 'Paiement en attente',
  EXPIRED: 'Expiré',
  SUSPENDED: 'Suspendu',
  TERMINATED: 'Résilié',
  PENDING: 'En attente',
  OVERDUE: 'En retard',
  SUCCEEDED: 'Réussi',
  FAILED: 'Échoué',
  COVERED: 'Couvert',
  REMOVED: 'Retiré',
  PENDING_CONFIRMATION: 'À confirmer (cabinet)',
  AUTH_REQUIRED: 'Autorisation préalable requise',
  AUTHORIZED: 'Autorisé — à confirmer',
  AUTHORIZED_EMERGENCY: 'Autorisée (urgence)',
  CONFIRMED: 'Confirmé',
  CANCELLED: 'Annulée',
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  SUCCEEDED: 'bg-emerald-100 text-emerald-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  COVERED: 'bg-emerald-100 text-emerald-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  AUTHORIZED: 'bg-teal-100 text-teal-800',
  PENDING_CONFIRMATION: 'bg-amber-100 text-amber-800',
  AUTH_REQUIRED: 'bg-orange-100 text-orange-800',
  CANCELLED: 'bg-slate-200 text-slate-500',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  UNDER_REVIEW: 'bg-indigo-100 text-indigo-800',
  PENDING_PAYMENT: 'bg-amber-100 text-amber-800',
  PENDING: 'bg-amber-100 text-amber-800',
  INFO_REQUESTED: 'bg-orange-100 text-orange-800',
  PARTIALLY_APPROVED: 'bg-teal-100 text-teal-800',
  AUTHORIZED_EMERGENCY: 'bg-teal-100 text-teal-800',
  ENGAGED: 'bg-violet-100 text-violet-800',
  SUSPENDED: 'bg-red-100 text-red-700',
  REJECTED: 'bg-red-100 text-red-700',
  FAILED: 'bg-red-100 text-red-700',
  TERMINATED: 'bg-slate-200 text-slate-600',
  EXPIRED: 'bg-slate-200 text-slate-600',
  REMOVED: 'bg-slate-200 text-slate-500',
  DRAFT: 'bg-slate-100 text-slate-600',
};

export const statusLabel = (s: string): string => STATUS_LABELS[s] ?? s;
export const statusStyle = (s: string): string => STATUS_STYLES[s] ?? 'bg-slate-100 text-slate-600';

/** Charge utile QR canonique comprise par `/provider/verify` (`{ t: jeton }`). */
export const cardQrPayload = (cardToken: string): string => JSON.stringify({ t: cardToken });

/**
 * Statuts d'ordonnance, libellés §5 (techniques inchangés côté API).
 * Note : CRÉÉE n'a pas d'état technique distinct — l'émission par un
 * prescripteur habilité vaut création + validation (visible en timeline).
 */
export const PRESCRIPTION_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Créée',
  ACTIVE: 'Validée',
  PARTIALLY_EXECUTED: 'Partiellement utilisée',
  EXECUTED: 'Utilisée',
  EXPIRED: 'Expirée',
  CANCELLED: 'Annulée',
};

export const prescriptionStatusLabel = (s: string): string =>
  PRESCRIPTION_STATUS_LABELS[s] ?? statusLabel(s);

export const CATEGORY_LABELS: Record<string, string> = {
  HOSPITALIZATION: 'Hospitalisation',
  CONSULTATION: 'Consultations',
  PHARMACY: 'Pharmacie',
  LABORATORY: 'Analyses & imagerie',
  SPECIALIZED: 'Soins spécialisés',
  MATERNITY: 'Maternité',
  DENTAL: 'Soins dentaires',
  OPTICAL: 'Optique',
};

export const PROVIDER_TYPES: Record<string, string> = {
  HOSPITAL: 'Hôpital',
  CLINIC: 'Clinique',
  HEALTH_CENTER: 'Centre de santé',
  PHARMACY: 'Pharmacie',
  LABORATORY: 'Laboratoire',
  MEDICAL_CABINET: 'Cabinet médical',
  SPECIALIST: 'Spécialiste',
};

export const RELATION_LABELS: Record<string, string> = {
  SPOUSE: 'Conjoint(e)',
  CHILD: 'Enfant',
  OTHER: 'Autre',
};

export const FREQUENCY_LABELS: Record<string, string> = {
  ANNUAL: 'Annuel',
  QUARTERLY: 'Trimestriel',
  MONTHLY: 'Mensuel',
};

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super administrateur',
  INSURANCE_MANAGER: 'Gestionnaire assurance',
  SUPPORT_AGENT: 'Agent support',
  COMPANY_ADMIN: 'Admin entreprise',
  MEMBER: 'Assuré',
  PROVIDER: 'Prestataire',
};

export const DISTRIBUTOR_LEVELS: Record<string, string> = {
  AMBASSADOR: 'Ambassadeur',
  COMMERCIAL: 'Commercial',
  DISTRIBUTOR: 'Sous-distributeur',
  INSTITUTIONAL: 'Institutionnel',
};

export const COMMISSION_TYPES: Record<string, string> = {
  NEW_BUSINESS: 'Nouvelle souscription',
  RENEWAL: 'Renouvellement',
  OVERRIDE: 'Override équipe',
  BONUS: 'Bonus performance',
};

/** Bandes CTS (§14) — affichage seul, calcul côté API. */
export const CTS_BAND_LABELS: Record<string, string> = {
  NORMAL: 'Sain',
  SURVEILLANCE: 'Surveillance',
  ALERTE: 'Alerte',
  CRITIQUE: 'Critique',
  EPUISE: 'Épuisé',
};

const CTS_BAND_STYLES: Record<string, string> = {
  NORMAL: 'bg-emerald-100 text-emerald-800',
  SURVEILLANCE: 'bg-amber-100 text-amber-800',
  ALERTE: 'bg-orange-100 text-orange-800',
  CRITIQUE: 'bg-red-100 text-red-700',
  EPUISE: 'bg-slate-800 text-white',
};

export const ctsBandLabel = (b: string): string => CTS_BAND_LABELS[b] ?? b;
export const ctsBandStyle = (b: string): string => CTS_BAND_STYLES[b] ?? 'bg-slate-100 text-slate-600';

export const ratioPct = (r: number | null | undefined): string =>
  r == null ? '—' : `${Math.round(r * 100)} %`;

function clampPercent(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Taux net estimé avant barème et plafonds : taux brut × (100 − copay) / 100.
 * Exemple : 70 % brut avec 30 % de copay → 49 % net estimé.
 */
export const netCoverageRate = (rate: number | null | undefined, copayRate: number | null | undefined): number => {
  const net = (clampPercent(rate) * (100 - clampPercent(copayRate))) / 100;
  return Math.round(net * 10) / 10;
};

export const netCoverageLabel = (rate: number | null | undefined, copayRate: number | null | undefined): string => {
  const net = netCoverageRate(rate, copayRate);
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(net)} %`;
};

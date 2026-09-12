// Machine à états des demandes de prise en charge / remboursement (§27, §40.5).
// Source unique de vérité des transitions autorisées — les contrôleurs
// (claims, portail prestataire) doivent s'y conformer au lieu de listes ad hoc.
// Règle absolue : CANCEL sans contre-écriture uniquement depuis des états qui
// ne consomment pas les plafonds (hors CLAIM_STATUSES_CONSUMING_CAPS) ; toute
// sortie d'un état consommant exige une contre-écriture (phase CTS 10/11).

/** Actions métier (claims.controller ; portail : adoption phase 10/11). */
export type ClaimAction =
  | 'SUBMIT'
  | 'REQUEST_INFO'
  | 'UNDER_REVIEW'
  | 'APPROVE'
  | 'REJECT'
  | 'AUTHORIZE'
  | 'CONFIRM'
  | 'EMERGENCY_CONFIRM'
  | 'REALIZE'
  | 'INVOICE'
  | 'MARK_PAID'
  | 'CANCEL';

/** États sources autorisés par action (reflète les guards actuels). */
export const CLAIM_TRANSITIONS: Record<ClaimAction, readonly string[]> = {
  SUBMIT: ['DRAFT', 'INFO_REQUESTED'],
  REQUEST_INFO: ['SUBMITTED', 'UNDER_REVIEW'],
  UNDER_REVIEW: ['SUBMITTED', 'INFO_REQUESTED'],
  APPROVE: ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED'],
  REJECT: ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED'],
  AUTHORIZE: ['AUTH_REQUIRED'],
  CONFIRM: ['PENDING_CONFIRMATION', 'AUTHORIZED', 'AUTHORIZED_EMERGENCY'],
  EMERGENCY_CONFIRM: ['AUTH_REQUIRED'],
  REALIZE: ['CONFIRMED'],
  INVOICE: ['CONFIRMED'],
  MARK_PAID: ['APPROVED', 'PARTIALLY_APPROVED'],
  CANCEL: ['DRAFT', 'SUBMITTED', 'INFO_REQUESTED', 'UNDER_REVIEW', 'AUTH_REQUIRED', 'PENDING_CONFIRMATION'],
};

export function allowedFrom(action: ClaimAction): readonly string[] {
  return CLAIM_TRANSITIONS[action] ?? [];
}

export function canTransition(from: string, action: ClaimAction): boolean {
  return allowedFrom(action).includes(from);
}

/** Lève une Error si la transition est interdite (le contrôleur la mappe en 400). */
export function assertClaimTransition(from: string, action: ClaimAction): void {
  if (!canTransition(from, action)) {
    throw new Error(`Action ${action} impossible depuis le statut ${from}`);
  }
}

/** Seuil maximal de sécurité pour l'approbation automatique (FCFA). */
export const AUTO_APPROVE_MAX_THRESHOLD = 100000;

export interface AutoApprovalClaim {
  id: string;
  kind: string;
  totalRequested: number;
}

export interface AutoApprovalEstimation {
  ok: boolean;
  flags: string[];
  totals: { approved: number };
}

/** Normalise le seuil configuré : entier positif, plafonné pour limiter le risque. */
export function resolveAutoApproveThreshold(raw: unknown, max = AUTO_APPROVE_MAX_THRESHOLD): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 0;
  const value = Math.floor(n);
  if (value <= 0) return 0;
  return Math.min(value, max);
}

/** Normalise le pourcentage d'audit a posteriori (0-100). */
export function resolveAutoApproveAuditPercent(raw: unknown, fallback = 10): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Éligibilité à l'approbation automatique : remboursement propre, sans aucun
 * drapeau, sous le seuil configuré, avec un montant approuvé strictement positif.
 */
export function isAutoApprovableClaim(
  claim: AutoApprovalClaim,
  estimation: AutoApprovalEstimation,
  threshold: number,
): boolean {
  return (
    threshold > 0 &&
    claim.kind === 'REIMBURSEMENT' &&
    estimation.ok &&
    estimation.flags.length === 0 &&
    claim.totalRequested <= threshold &&
    estimation.totals.approved > 0
  );
}

/** Échantillonnage déterministe pour l'audit a posteriori des approbations auto. */
export function autoApprovalAuditSample(claimId: string, percent: number): boolean {
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  let hash = 0;
  for (let i = 0; i < claimId.length; i++) {
    hash = (hash * 31 + claimId.charCodeAt(i)) >>> 0;
  }
  return hash % 100 < percent;
}

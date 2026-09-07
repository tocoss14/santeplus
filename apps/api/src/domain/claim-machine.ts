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

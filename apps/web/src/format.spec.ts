import { describe, expect, it } from 'vitest';
import { prescriptionStatusLabel, statusLabel } from './format';

// P6/7 : libellés FR §5 (ordonnances) et §27 (factures).
// Les statuts techniques API sont inchangés — seul l'affichage est mappé.

describe('statusLabel — statuts facture §27', () => {
  it.each([
    ['DRAFT', 'Brouillon'],
    ['SUBMITTED', 'Soumise'],
    ['UNDER_REVIEW', 'En contrôle'],
    ['APPROVED', 'Validée'],
    ['PARTIALLY_APPROVED', 'Partiellement validée'],
    ['REJECTED', 'Rejetée'],
    ['PAID', 'Payée'],
    ['CANCELLED', 'Annulée'],
    ['ENGAGED', 'Engagée'],
  ] as const)('%s → %s', (status, label) => {
    expect(statusLabel(status)).toBe(label);
  });

  it('tout statut du cycle de vie a un libellé (pas de brut technique)', () => {
    const lifecycle = [
      'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED',
      'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID',
      'CONFIRMED', 'AUTHORIZED', 'AUTHORIZED_EMERGENCY',
      'AUTH_REQUIRED', 'PENDING_CONFIRMATION', 'CANCELLED', 'ENGAGED',
    ];
    for (const s of lifecycle) expect(statusLabel(s)).not.toBe(s);
  });

  it('statut inconnu : repli sur la valeur brute', () => {
    expect(statusLabel('NOUVEAU_STATUT_XYZ')).toBe('NOUVEAU_STATUT_XYZ');
  });
});

describe('prescriptionStatusLabel — statuts ordonnance §5', () => {
  it.each([
    ['CREATED', 'Créée'],
    ['ACTIVE', 'Validée'],
    ['PARTIALLY_EXECUTED', 'Partiellement utilisée'],
    ['EXECUTED', 'Utilisée'],
    ['EXPIRED', 'Expirée'],
    ['CANCELLED', 'Annulée'],
  ] as const)('%s → %s', (status, label) => {
    expect(prescriptionStatusLabel(status)).toBe(label);
  });
});

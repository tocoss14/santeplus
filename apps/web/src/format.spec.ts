import { describe, expect, it } from 'vitest';
import { cardQrPayload, netCoverageLabel, netCoverageRate, prescriptionStatusLabel, statusLabel } from './format';

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

describe('cardQrPayload — charge utile canonique de vérification', () => {
  it('utilise la clé t attendue par /provider/verify', () => {
    expect(cardQrPayload('tok_1234567890')).toBe('{"t":"tok_1234567890"}');
  });
});

describe('netCoverageRate — taux net estimé avant barème/plafonds', () => {
  it.each([
    [70, 30, 49],
    [60, 40, 36],
    [80, 20, 64],
    [90, 10, 81],
    [100, 0, 100],
  ])('%i %% brut avec %i %% de copay → %i %% net', (rate, copay, net) => {
    expect(netCoverageRate(rate, copay)).toBe(net);
  });

  it('formate le net en français', () => {
    expect(netCoverageLabel(70, 30)).toBe('49 %');
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

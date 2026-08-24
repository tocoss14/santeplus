import { describe, expect, it } from 'vitest';
import {
  buildCinetpayCheckPayload,
  buildCinetpayPaymentPayload,
  buildFedapayTransactionPayload,
  extractCinetpayReference,
  extractFedapayStatus,
  extractFedapayTransactionId,
  mapCinetpayStatus,
  mapFedapayStatus,
} from '../src/domain/payment-mapping';

describe('mapFedapayStatus', () => {
  it('mappe les statuts de succès', () => {
    expect(mapFedapayStatus('APPROVED')).toBe('SUCCESS');
    expect(mapFedapayStatus('transferred')).toBe('SUCCESS');
  });
  it('mappe les échecs', () => {
    expect(mapFedapayStatus('DECLINED')).toBe('FAILED');
    expect(mapFedapayStatus('canceled')).toBe('FAILED');
    expect(mapFedapayStatus('REFUNDED')).toBe('FAILED');
  });
  it('reste en attente sinon (fail-safe)', () => {
    expect(mapFedapayStatus('PENDING')).toBe('PENDING');
    expect(mapFedapayStatus(undefined)).toBe('PENDING');
    expect(mapFedapayStatus('INCONNU')).toBe('PENDING');
  });
});

describe('mapCinetpayStatus', () => {
  it('ACCEPTED = succès, REFUSED/EXPIRED = échec, autre = attente', () => {
    expect(mapCinetpayStatus('Accepted')).toBe('SUCCESS');
    expect(mapCinetpayStatus('REFUSED')).toBe('FAILED');
    expect(mapCinetpayStatus('EXPIRED')).toBe('FAILED');
    expect(mapCinetpayStatus('WAITING')).toBe('PENDING');
    expect(mapCinetpayStatus(null)).toBe('PENDING');
  });
});

describe('buildFedapayTransactionPayload', () => {
  it('construit la transaction XOF avec référence et callback', () => {
    const p = buildFedapayTransactionPayload({
      reference: 'PAY-2026-ABC123',
      amount: 3750,
      description: 'Cotisation contrat CTR-1',
      callbackUrl: 'https://x.bj/api/payments/webhook/fedapay',
    });
    expect(p.currency.iso).toBe('XOF');
    expect(p.amount).toBe(3750);
    expect(p.custom_metadata.reference).toBe('PAY-2026-ABC123');
    expect(p.merchant_reference).toBe('PAY-2026-ABC123');
    expect(p.callback_url).toContain('/webhook/fedapay');
  });
});

describe('extractFedapayTransactionId / Status', () => {
  it('extrait depuis webhook event imbriqué', () => {
    const webhook = { event: 'transaction.approved', entity: { transaction: { id: 987654, status: 'APPROVED' } } };
    expect(extractFedapayTransactionId(webhook)).toBe('987654');
    expect(extractFedapayStatus(webhook)).toBe('APPROVED');
  });
  it('extrait depuis réponse API directe', () => {
    const api = { transaction: { id: 111222, status: 'TRANSFERRED' } };
    expect(extractFedapayTransactionId(api)).toBe('111222');
    expect(extractFedapayStatus(api)).toBe('TRANSFERRED');
  });
  it('retourne null sur corps invalide', () => {
    expect(extractFedapayTransactionId({ foo: 1 })).toBeNull();
    expect(extractFedapayStatus(null)).toBeNull();
  });
});

describe('CinetPay payloads & extraction', () => {
  it('payload initiation complet', () => {
    const p = buildCinetpayPaymentPayload({
      apiKey: 'k', siteId: 's', reference: 'PAY-2026-X9', amount: 82500,
      description: 'Échéance collective', returnUrl: 'https://a/app', notifyUrl: 'https://a/api/payments/webhook/cinetpay',
    });
    expect(p.transaction_id).toBe('PAY-2026-X9');
    expect(p.currency).toBe('XOF');
    expect(p.channels).toBe('MOBILE_MONEY');
    expect(p.notify_url).toContain('/webhook/cinetpay');
  });

  it('payload check minimal', () => {
    const c = buildCinetpayCheckPayload('k', 's', 'REF1');
    expect(c).toEqual({ apikey: 'k', site_id: 's', transaction_id: 'REF1' });
  });

  it('extrait la référence du notify (json ou data)', () => {
    expect(extractCinetpayReference({ cpm_trans_id: 'R1' })).toBe('R1');
    expect(extractCinetpayReference({ data: { transaction_id: 'R2' } })).toBe('R2');
    expect(extractCinetpayReference({})).toBeNull();
  });
});

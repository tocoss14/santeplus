import { config } from '../../config';
import {
  buildCinetpayCheckPayload,
  buildCinetpayPaymentPayload,
  buildFedapayTransactionPayload,
  extractCinetpayAmount,
  extractFedapayAmount,
  extractFedapayStatus,
  mapCinetpayStatus,
  mapFedapayStatus,
  ProviderOutcome,
} from '../../domain/payment-mapping';

export interface PaymentInitiation {
  provider: string;
  instructions: Record<string, any>;
}

export interface ProviderPaymentInfo {
  reference: string;
  amount: number;
  externalRef?: string | null;
}

/** Résultat d'une vérification PSP : l'outcome ET le montant encaissé rapporté
 *  par le PSP quand il l'expose (null sinon). Le service compare ce montant au
 *  montant attendu avant toute confirmation — le webhook ne peut pas décider
 *  seul d'un succès (P0 ③, addendum 17/09 de l'audit). */
export interface ProviderStatusCheck {
  outcome: ProviderOutcome;
  reportedAmount: number | null;
}

export interface PaymentProvider {
  code: string;
  label: string;
  kind: 'MOBILE_MONEY' | 'CARD' | 'BANK' | 'CASH' | 'TEST';
  available: boolean;
  initiate(payment: { reference: string; amount: number; method: string; customerPhone?: string }): Promise<PaymentInitiation>;
  checkStatus(payment: ProviderPaymentInfo): Promise<ProviderOutcome> | Promise<ProviderStatusCheck>;
}

async function httpJson(method: 'GET' | 'POST', url: string, body?: any, headers?: Record<string, string>): Promise<any> {
  const fetchFn = (globalThis as any).fetch as (u: string, o?: any) => Promise<any>;
  if (!fetchFn) throw new Error('fetch indisponible sur ce runtime Node');
  const res = await fetchFn(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...(headers ?? {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const message = data?.message ?? `Erreur ${res.status}`;
    throw new Error(`${message}`);
  }
  return data;
}

class MockMobileMoneyProvider implements PaymentProvider {
  code = 'MOCK_MOMO';
  label = 'Mobile Money (simulation)';
  kind = 'TEST' as const;
  available = true;

  async initiate(payment: { reference: string; amount: number }) {
    return {
      provider: this.code,
      instructions: {
        mode: 'SIMULATION',
        message: `Un débit simulé de ${payment.amount} FCFA sera confirmé. Référence ${payment.reference}.`,
        ussd: '*880#',
      },
    };
  }

  async checkStatus(): Promise<ProviderStatusCheck> {
    return { outcome: 'PENDING', reportedAmount: null };
  }
}

class FedaPayAdapter implements PaymentProvider {
  code = 'FEDAPAY';
  label = 'FedaPay — Mobile Money & carte';
  kind = 'CARD' as const;

  get available() {
    return Boolean(config.fedapaySecretKey);
  }

  private baseUrl() {
    return config.fedapayMode === 'live'
      ? 'https://api.fedapay.com/v1'
      : 'https://sandbox-api.fedapay.com/v1';
  }

  private headers() {
    return { Authorization: `Bearer ${config.fedapaySecretKey}` };
  }

  async initiate(payment: { reference: string; amount: number }) {
    if (!this.available) throw new Error('FedaPay non configuré. Renseignez FEDAPAY_SECRET_KEY.');
    const callbackUrl = `${config.appUrl.replace(/\/$/, '')}/api/payments/webhook/fedapay`;
    const tx = await httpJson(
      'POST',
      `${this.baseUrl()}/transactions`,
      buildFedapayTransactionPayload({
        reference: payment.reference,
        amount: payment.amount,
        description: `Cotisation santé ${payment.reference}`,
        callbackUrl,
      }),
      this.headers(),
    );
    const transactionId = String(tx?.transaction?.id ?? '');
    if (!transactionId) throw new Error('Réponse FedaPay inattendue (id manquant)');
    const tokenRes = await httpJson('POST', `${this.baseUrl()}/transactions/${transactionId}/token`, {}, this.headers());
    const redirectUrl = tokenRes?.url ?? tokenRes?.token ?? null;
    if (!redirectUrl) throw new Error('Lien de paiement FedaPay introuvable');
    return {
      provider: this.code,
      instructions: {
        mode: 'REDIRECT',
        redirectUrl: String(redirectUrl).startsWith('http') ? String(redirectUrl) : `https://pay.fedapay.co/${redirectUrl}`,
        providerTransactionId: transactionId,
      },
    };
  }

  async checkStatus(payment: ProviderPaymentInfo): Promise<ProviderStatusCheck> {
    if (!payment.externalRef) return { outcome: 'PENDING', reportedAmount: null };
    const res = await httpJson(
      'GET',
      `${this.baseUrl()}/transactions/${payment.externalRef}`,
      undefined,
      this.headers(),
    );
    return {
      outcome: mapFedapayStatus(extractFedapayStatus(res)),
      reportedAmount: extractFedapayAmount(res),
    };
  }
}

class CinetPayAdapter implements PaymentProvider {
  code = 'CINETPAY';
  label = 'CinetPay — MTN MoMo / Moov Money';
  kind = 'MOBILE_MONEY' as const;

  get available() {
    return Boolean(config.cinetpayApiKey && config.cinetpaySiteId);
  }

  async initiate(payment: { reference: string; amount: number }) {
    if (!this.available) throw new Error('CinetPay non configuré. Renseignez CINETPAY_API_KEY et CINETPAY_SITE_ID.');
    const base = config.appUrl.replace(/\/$/, '');
    const res = await httpJson(
      'POST',
      'https://api-checkout.cinetpay.com/v2/payment',
      buildCinetpayPaymentPayload({
        apiKey: config.cinetpayApiKey,
        siteId: config.cinetpaySiteId,
        reference: payment.reference,
        amount: payment.amount,
        description: `Cotisation santé ${payment.reference}`,
        returnUrl: `${base}/app/contrat?paiement=retour`,
        notifyUrl: `${base}/api/payments/webhook/cinetpay`,
      }),
    );
    if (res?.code !== '00' || !res?.data?.payment_url) {
      throw new Error(`CinetPay: ${res?.message ?? 'initiation refusée'}`);
    }
    return {
      provider: this.code,
      instructions: {
        mode: 'REDIRECT',
        redirectUrl: res.data.payment_url,
        providerToken: res.data.payment_token ?? undefined,
      },
    };
  }

  async checkStatus(payment: ProviderPaymentInfo): Promise<ProviderStatusCheck> {
    const res = await httpJson(
      'POST',
      'https://api-checkout.cinetpay.com/v2/payment/check',
      buildCinetpayCheckPayload(config.cinetpayApiKey, config.cinetpaySiteId, payment.reference),
    );
    if (res?.code !== '00') return { outcome: 'PENDING', reportedAmount: null };
    return {
      outcome: mapCinetpayStatus(res?.data?.status),
      reportedAmount: extractCinetpayAmount(res),
    };
  }
}

const REGISTRY: Record<string, PaymentProvider> = {
  MOCK_MOMO: new MockMobileMoneyProvider(),
  FEDAPAY: new FedaPayAdapter(),
  CINETPAY: new CinetPayAdapter(),
};

export interface PublicPaymentMethod {
  code: string;
  label: string;
  kind: PaymentProvider['kind'];
  available: boolean;
}

export function getProviders(enabledCodes: string[]): PublicPaymentMethod[] {
  return Object.values(REGISTRY)
    .filter(p => enabledCodes.includes(p.code))
    .map(p => ({ code: p.code, label: p.label, kind: p.kind, available: p.available }));
}

export function getProvider(code: string): PaymentProvider | null {
  return REGISTRY[code] ?? null;
}

export type ProviderOutcome = 'SUCCESS' | 'FAILED' | 'PENDING';

export function mapFedapayStatus(status: string | undefined | null): ProviderOutcome {
  const s = (status ?? '').toUpperCase();
  if (s === 'APPROVED' || s === 'TRANSFERRED') return 'SUCCESS';
  if (s === 'DECLINED' || s === 'CANCELED' || s === 'CANCELLED' || s === 'REFUNDED') return 'FAILED';
  return 'PENDING';
}

export function mapCinetpayStatus(status: string | undefined | null): ProviderOutcome {
  const s = (status ?? '').toUpperCase();
  if (s === 'ACCEPTED') return 'SUCCESS';
  if (s === 'REFUSED' || s === 'CANCELLED' || s === 'CANCELED' || s === 'EXPIRED') return 'FAILED';
  return 'PENDING';
}

export interface FedapayTxInput {
  reference: string;
  amount: number;
  description: string;
  callbackUrl: string;
}

export function buildFedapayTransactionPayload(input: FedapayTxInput) {
  return {
    description: input.description,
    amount: input.amount,
    currency: { iso: 'XOF' },
    callback_url: input.callbackUrl,
    custom_metadata: { reference: input.reference },
    merchant_reference: input.reference,
  };
}

export function extractFedapayTransactionId(body: any): string | null {
  if (!body) return null;
  const direct = body.transaction?.id ?? body.id;
  if (direct != null) return String(direct);
  const nested = body.entity?.transaction?.id ?? body.entity?.id;
  if (nested != null) return String(nested);
  return null;
}

export function extractFedapayStatus(body: any): string | null {
  if (!body) return null;
  return body.transaction?.status ?? body.entity?.transaction?.status ?? body.status ?? null;
}

export interface CinetpayInitInput {
  apiKey: string;
  siteId: string;
  reference: string;
  amount: number;
  description: string;
  returnUrl: string;
  notifyUrl: string;
}

export function buildCinetpayPaymentPayload(input: CinetpayInitInput) {
  return {
    apikey: input.apiKey,
    site_id: input.siteId,
    transaction_id: input.reference,
    amount: input.amount,
    currency: 'XOF',
    description: input.description.slice(0, 250),
    channels: 'MOBILE_MONEY',
    return_url: input.returnUrl,
    notify_url: input.notifyUrl,
  };
}

export function buildCinetpayCheckPayload(apiKey: string, siteId: string, reference: string) {
  return { apikey: apiKey, site_id: siteId, transaction_id: reference };
}

export function extractCinetpayReference(body: any): string | null {
  if (!body) return null;
  const ref = body.cpm_trans_id ?? body.transaction_id ?? body.data?.transaction_id;
  return ref ? String(ref) : null;
}

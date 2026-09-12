import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate } from '../../format';
import { ErrorBanner, Field, Spinner, StatusBadge } from '../../components/ui';

const STATUSES = ['DRAFT', 'SUBMITTED', 'VALIDATED', 'PAID', 'PARTIAL', 'CANCELLED'] as const;

function qs(obj: Record<string, any>) {
  return new URLSearchParams(
    Object.entries(obj).filter(([, value]) => value !== '' && value != null) as Array<[string, string]>,
  ).toString();
}

export default function AdminBilling() {
  const [q, setQ] = useState('');
  const [providers, setProviders] = useState<any[]>([]);
  const [providerId, setProviderId] = useState('');
  const [status, setStatus] = useState('');
  const [invoices, setInvoices] = useState<any[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [paymentRef, setPaymentRef] = useState('');
  const [rejections, setRejections] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = q ? `?q=${encodeURIComponent(q)}` : '';
    api.get(`/admin/providers${params}`).then(response => {
      const items = response?.items ?? response ?? [];
      setProviders(Array.isArray(items) ? items : []);
      if (!providerId && items.length) setProviderId(items[0].id);
    }).catch(() => setProviders([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const loadInvoices = async (id = providerId, invoiceStatus = status) => {
    if (!id) return;
    setError(null);
    try {
      const response = await api.get(`/billing/batch-invoices?${qs({ providerId: id, status: invoiceStatus || undefined })}`);
      setInvoices(Array.isArray(response) ? response : response.items ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Chargement impossible');
    }
  };

  useEffect(() => {
    if (providerId) void loadInvoices(providerId, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, status]);

  const open = async (id: string) => {
    setSelectedId(id);
    setError(null);
    try {
      const [detail, invoiceRejections] = await Promise.all([
        api.get(`/billing/batch-invoices/${id}`),
        api.get(`/billing/rejections?${qs({ batchInvoiceId: id })}`),
      ]);
      setInvoice(detail);
      setRejections(Array.isArray(invoiceRejections) ? invoiceRejections : invoiceRejections.items ?? []);
      setAmounts(Object.fromEntries((detail.items ?? []).map((item: any) => [item.id, String(item.amountApproved ?? 0)])));
      setReasons(Object.fromEntries((detail.items ?? []).map((item: any) => [item.id, item.rejectionReason ?? ''])));
    } catch (err: any) {
      setError(err?.message ?? 'Facture introuvable');
    }
  };

  const validate = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/billing/batch-invoices/validate', {
        batchInvoiceId: selectedId,
        items: (invoice.items ?? []).map((item: any) => ({
          batchInvoiceItemId: item.id,
          amountApproved: Number(amounts[item.id] ?? 0),
          rejectionReason: reasons[item.id]?.trim() || undefined,
        })),
      });
      await loadInvoices();
      await open(selectedId);
    } catch (err: any) {
      setError(err?.message ?? 'Validation impossible');
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!selectedId || !paymentRef.trim()) {
      setError('Référence de paiement requise.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/billing/batch-invoices/pay', { batchInvoiceId: selectedId, paymentRef: paymentRef.trim() });
      await loadInvoices();
      await open(selectedId);
      setPaymentRef('');
    } catch (err: any) {
      setError(err?.message ?? 'Paiement impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Facturation prestataires</h1>
      <ErrorBanner message={error} />

      <div className="card-p flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Field label="Prestataire">
            <select className="input" value={providerId} onChange={e => setProviderId(e.target.value)}>
              <option value="">Sélectionner…</option>
              {providers.map(provider => (
                <option key={provider.id} value={provider.id}>{provider.name} · {provider.city}</option>
              ))}
            </select>
          </Field>
        </div>
        <div>
          <Field label="Statut">
            <select className="input" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Tous</option>
              {STATUSES.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </Field>
        </div>
        <button className="btn-primary btn-sm" disabled={!providerId || busy} onClick={() => loadInvoices()}>Charger</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1 card-p space-y-2 max-h-[70vh] overflow-auto">
          {!invoices ? (
            <p className="py-8 text-center text-sm text-slate-500">Sélectionnez un prestataire.</p>
          ) : invoices.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Aucune facture pour ces critères.</p>
          ) : (
            invoices.map(item => (
              <button
                key={item.id}
                onClick={() => open(item.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  selectedId === item.id ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold">{item.number}</span>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {fmtDate(item.periodStart)} → {fmtDate(item.periodEnd)} · {fcfa(item.totalApproved)}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {!selectedId || !invoice ? (
            <div className="card-p text-sm text-slate-500">Sélectionnez une facture pour la valider ou la payer.</div>
          ) : (
            <div className="card-p space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold font-mono">{invoice.number}</h2>
                <StatusBadge status={invoice.status} />
                <span className="ml-auto text-sm font-semibold">{fcfa(invoice.totalApproved)}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead><tr><th className="th text-left">Sinistre</th><th className="th text-right">Demandé</th><th className="th text-right">Approuvé</th><th className="th text-left">Motif de rejet</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(invoice.items ?? []).map((item: any) => (
                      <tr key={item.id}>
                        <td className="td font-mono text-xs">{item.claim?.reference ?? '—'}</td>
                        <td className="td text-right">{fcfa(item.amountRequested)}</td>
                        <td className="td text-right">
                          <input
                            type="number"
                            min={0}
                            max={item.amountRequested}
                            className="input py-1 text-right"
                            value={amounts[item.id] ?? ''}
                            onChange={e => setAmounts(values => ({ ...values, [item.id]: e.target.value }))}
                            disabled={busy || invoice.status !== 'SUBMITTED'}
                          />
                        </td>
                        <td className="td">
                          <input
                            className="input py-1"
                            value={reasons[item.id] ?? ''}
                            onChange={e => setReasons(values => ({ ...values, [item.id]: e.target.value }))}
                            disabled={busy || invoice.status !== 'SUBMITTED'}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                <button className="btn-primary btn-sm" disabled={busy || invoice.status !== 'SUBMITTED'} onClick={validate}>
                  Valider les montants
                </button>
                <div className="flex items-end gap-2">
                  <Field label="Référence de paiement">
                    <input className="input" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} />
                  </Field>
                  <button className="btn-outline btn-sm" disabled={busy || invoice.status !== 'VALIDATED'} onClick={pay}>
                    Marquer payée
                  </button>
                </div>
              </div>

              {rejections.length > 0 && (
                <div>
                  <h3 className="font-semibold">Rejets ({rejections.length})</h3>
                  <ul className="mt-1 space-y-1 text-sm text-slate-600">
                    {rejections.map(rejection => (
                      <li key={rejection.id}>• {rejection.reason} — {fcfa(rejection.amount)} ({rejection.status})</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

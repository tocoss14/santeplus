import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../api';
import { fcfa, fmtDate } from '../../../format';
import { ErrorBanner, Spinner, StatusBadge } from '../../../components/ui';

export default function MobileFactureDetailPage() {
  const { id = '' } = useParams();
  const [invoice, setInvoice] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setInvoice(await api.get(`/provider/batch-invoices/${id}`));
    } catch (err: any) {
      setError(err?.message ?? 'Facture introuvable');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/provider/batch-invoices/submit', { batchInvoiceId: id });
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Soumission impossible');
    } finally {
      setBusy(false);
    }
  };

  if (!invoice && !error) return <Spinner />;
  if (!invoice) {
    return (
      <div className="px-4 space-y-3">
        <Link to="/prestataire/mobile/factures" className="text-sm font-semibold text-brand-700">← Factures</Link>
        <ErrorBanner message={error} />
      </div>
    );
  }

  return (
    <div className="px-4 space-y-4">
      <Link to="/prestataire/mobile/factures" className="text-sm font-semibold text-brand-700">← Factures</Link>
      <ErrorBanner message={error} />

      <div className="card-p space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-bold font-mono">{invoice.number}</h1>
          <StatusBadge status={invoice.status} />
        </div>
        <p className="text-xs text-slate-500">
          {fmtDate(invoice.periodStart)} → {fmtDate(invoice.periodEnd)}
        </p>
        <div className="grid grid-cols-3 gap-2 pt-2 text-sm">
          <div><p className="text-xs text-slate-400">Demandé</p><p className="font-semibold">{fcfa(invoice.totalAmount)}</p></div>
          <div><p className="text-xs text-slate-400">Approuvé</p><p className="font-semibold">{fcfa(invoice.totalApproved)}</p></div>
          <div><p className="text-xs text-slate-400">Rejeté</p><p className="font-semibold">{fcfa(invoice.totalRejected)}</p></div>
        </div>
        {invoice.status === 'DRAFT' && (
          <button className="btn-primary w-full" disabled={busy} onClick={submit}>
            {busy ? 'Soumission…' : 'Soumettre la facture'}
          </button>
        )}
      </div>

      <div className="card-p">
        <h2 className="font-semibold">Lignes ({invoice.items?.length ?? 0})</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {(invoice.items ?? []).map((item: any) => (
            <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{item.claim?.reference ?? 'Sinistre'}</p>
                <p className="text-xs text-slate-500">{item.claim?.contract?.number ?? ''}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{fcfa(item.amountApproved)}</p>
                <StatusBadge status={item.status} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../../api';
import { fcfa, fmtDate } from '../../../format';
import { EmptyState, ErrorBanner, Spinner, StatusBadge } from '../../../components/ui';

function qs(obj: Record<string, any>) {
  return new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v != null)).toString();
}

export default function MobileRejetsPage() {
  const [rejections, setRejections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (nextStatus = status) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/provider/rejections?${qs({ status: nextStatus || undefined })}`);
      setRejections(Array.isArray(res) ? res : res.items ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Chargement impossible');
      setRejections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const startDispute = (id: string) => {
    setSelectedId(id);
    setReason('');
    setNotice(null);
    setError(null);
  };

  const dispute = async () => {
    if (!selectedId || reason.trim().length < 5) {
      setError('Expliquez la contestation en au moins cinq caractères.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/provider/rejections/dispute', { rejectionId: selectedId, resolutionNote: reason.trim() });
      setNotice('Contestation envoyée.');
      setSelectedId(null);
      setReason('');
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Contestation impossible');
    } finally {
      setBusy(false);
    }
  };

  const acknowledge = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/provider/rejections/acknowledge', { rejectionId: id });
      setNotice('Accusé de réception enregistré.');
      await load();
    } catch (err: any) {
      setError(err?.message ?? 'Accusé impossible');
    } finally {
      setBusy(false);
    }
  };

  const statusFilters = [
    { value: '', label: 'Tous' },
    { value: 'OPEN', label: 'Ouverts' },
    { value: 'ACKNOWLEDGED', label: 'Accusés' },
    { value: 'DISPUTED', label: 'Contestés' },
    { value: 'RESOLVED', label: 'Résolus' },
  ];

  if (loading && rejections.length === 0 && !error) return <Spinner />;

  return (
    <div className="px-4 space-y-4">
      <h1 className="font-bold text-lg">Rejets</h1>
      <ErrorBanner message={error} />
      {notice && <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      <div className="flex gap-2 overflow-x-auto pb-2">
        {statusFilters.map(filter => (
          <button
            key={filter.value}
            onClick={() => setStatus(filter.value)}
            className={`btn-sm px-3 py-1.5 rounded-full whitespace-nowrap transition ${
              status === filter.value ? 'btn-primary' : 'btn-outline'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {rejections.length === 0 ? (
        <EmptyState icon="⚠️" title="Aucun rejet" hint="Les rejets apparaîtront ici après validation des factures" />
      ) : (
        <div className="space-y-2">
          {rejections.map(rejection => (
            <div key={rejection.id} className="card-p p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold font-mono text-sm">{rejection.code}</p>
                    <StatusBadge status={rejection.status} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {rejection.type} · {fcfa(rejection.amount)} · {rejection.batchInvoiceItem?.claim?.reference ?? 'Sinistre'}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">{rejection.reason}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-red-600">{fcfa(rejection.amount)}</p>
                  <p className="text-xs text-slate-500">{fmtDate(rejection.createdAt)}</p>
                </div>
              </div>
              {rejection.status === 'OPEN' && (
                <div className="mt-2 space-y-2 border-t pt-2">
                  <div className="flex gap-2">
                    <button className="btn-outline btn-sm flex-1" disabled={busy} onClick={() => startDispute(rejection.id)}>Contester</button>
                    <button className="btn-primary btn-sm flex-1" disabled={busy} onClick={() => acknowledge(rejection.id)}>Accuser réception</button>
                  </div>
                  {selectedId === rejection.id && (
                    <div className="space-y-2">
                      <label className="label" htmlFor={`dispute-${rejection.id}`}>Motif de la contestation</label>
                      <textarea
                        id={`dispute-${rejection.id}`}
                        className="input min-h-[72px]"
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="Montant, acte, date, pièce justificative…"
                      />
                      <button className="btn-primary btn-sm w-full" disabled={busy} onClick={dispute}>Envoyer la contestation</button>
                    </div>
                  )}
                </div>
              )}
              {rejection.status === 'DISPUTED' && (
                <p className="mt-2 text-xs text-brand-600">Contestation envoyée — en attente de réponse admin.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

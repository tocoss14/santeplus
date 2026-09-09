import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import { fcfa, fmtDate, statusLabel } from '../../../format';
import { StatusBadge, Spinner, EmptyState } from '../../../components/ui';

function qs(obj: Record<string, any>) {
  return new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v != null)).toString();
}

export default function MobileRejetsPage() {
  const [rejections, setRejections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    load();
  }, [status]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/billing/rejections?${qs({ status: status || undefined, limit: 50 })}`);
      setRejections(res.items ?? res);
    } catch (e) {
      setRejections([]);
    } finally {
      setLoading(false);
    }
  };

  const statusFilters = [
    { value: '', label: 'Tous' },
    { value: 'OPEN', label: 'Ouverts' },
    { value: 'ACKNOWLEDGED', label: 'Accusés' },
    { value: 'DISPUTED', label: 'Contestés' },
    { value: 'RESOLVED', label: 'Résolus' },
  ];

  if (loading) return <Spinner />;

  return (
    <div className="px-4 space-y-4">
      <h1 className="font-bold text-lg">Rejets</h1>

      {/* Filtres */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {statusFilters.map(f => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`btn-sm px-3 py-1.5 rounded-full whitespace-nowrap transition ${
              status === f.value ? 'btn-primary' : 'btn-outline'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rejections.length === 0 ? (
        <EmptyState icon="⚠️" title="Aucun rejet" hint="Les rejets apparaîtront ici après validation des factures" />
      ) : (
        <div className="space-y-2">
          {rejections.map(r => (
            <div key={r.id} className="card-p p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold font-mono text-sm">{r.code}</p>
                    <StatusBadge status={r.status} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {r.type} · {fcfa(r.amount)} · {r.batchInvoiceItem?.claim?.reference ?? 'Sinistre'}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">{r.reason}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-red-600">{fcfa(r.amount)}</p>
                  <p className="text-xs text-slate-500">{fmtDate(r.createdAt)}</p>
                </div>
              </div>
              {r.status === 'OPEN' && (
                <div className="mt-2 flex gap-2 pt-2 border-t">
                  <button className="btn-outline btn-sm flex-1" onClick={() => dispute(r.id)}>Contester</button>
                  <button className="btn-primary btn-sm flex-1" onClick={() => acknowledge(r.id)}>Accuser réception</button>
                </div>
              )}
              {r.status === 'DISPUTED' && (
                <div className="mt-2 text-xs text-brand-600">Contestation envoyée — en attente de réponse admin</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

async function dispute(id: string) {
  const reason = prompt('Motif de la contestation :');
  if (!reason) return;
  try {
    await api.post('/billing/rejections/dispute', { rejectionId: id, resolutionNote: reason });
    alert('Contestation envoyée');
    window.location.reload();
  } catch (e: any) {
    alert(e.message ?? 'Erreur');
  }
}

async function acknowledge(id: string) {
  try {
    await api.post('/billing/rejections/resolve', { rejectionId: id, resolutionNote: 'Accusé réception par prestataire' });
    alert('Accusé réception enregistré');
    window.location.reload();
  } catch (e: any) {
    alert(e.message ?? 'Erreur');
  }
}
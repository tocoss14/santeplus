import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../api';
import { fcfa, fmtDate, statusLabel } from '../../../format';
import { StatusBadge, Spinner, EmptyState } from '../../../components/ui';

function qs(obj: Record<string, any>) {
  return new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v != null)).toString();
}

export default function MobileFacturesPage() {
  const [factures, setFactures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, [status]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/provider/me/batch-invoices?${qs({ status: status || undefined })}`);
      setFactures(res.items ?? res);
    } catch (e) {
      setFactures([]);
    } finally {
      setLoading(false);
    }
  };

  const statusFilters = [
    { value: '', label: 'Tous' },
    { value: 'DRAFT', label: 'Brouillon' },
    { value: 'SUBMITTED', label: 'Soumise' },
    { value: 'VALIDATED', label: 'Validée' },
    { value: 'PAID', label: 'Payée' },
    { value: 'PARTIAL', label: 'Partielle' },
    { value: 'REJECTED', label: 'Rejetée' },
  ];

  if (loading) return <Spinner />;

  return (
    <div className="px-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-lg">Factures groupées</h1>
        <Link to="/prestataire/mobile/factures/new" className="btn-primary btn-sm">+ Nouvelle</Link>
      </div>

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

      {factures.length === 0 ? (
        <EmptyState icon="📄" title="Aucune facture" hint="Créez votre première facture groupée" />
      ) : (
        <div className="space-y-2">
          {factures.map(f => (
            <Link key={f.id} to={`/prestataire/mobile/factures/${f.id}`} className="card-p p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold font-mono text-sm">{f.number}</p>
                    <StatusBadge status={f.status} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {fmtDate(f.periodStart)} → {fmtDate(f.periodEnd)} · {f.items?.length ?? 0} lignes
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-brand-700">{fcfa(f.totalApproved)}</p>
                  <p className="text-xs text-slate-500">{statusLabel(f.status)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
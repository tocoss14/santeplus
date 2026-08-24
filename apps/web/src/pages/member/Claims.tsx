import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { fcfa, fmtDate, fmtDateTime, statusLabel, statusStyle } from '../../format';
import { EmptyState, Spinner } from '../../components/ui';

export default function Claims() {
  const [claims, setClaims] = useState<any[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get<any[]>('/claims/mine').then(setClaims).catch(() => setClaims([]));
  }, []);

  if (!claims) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mes remboursements</h1>
        <button className="btn-primary btn-sm" onClick={() => navigate('/app/remboursements/nouveau')}>＋ Déclarer une dépense</button>
      </div>

      {claims.length === 0 ? (
        <EmptyState icon="🧾" title="Aucune demande de remboursement" hint="Photographiez votre facture après une consultation pour lancer un remboursement." />
      ) : (
        <ul className="space-y-2.5">
          {claims.map(c => (
            <li key={c.id}>
              <Link to={`/app/remboursements/${c.id}`} className="card-p flex items-center gap-3 hover:border-brand-300 transition">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-lg">🧾</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {c.reference}
                    {c.kind === 'THIRDPARTY' && <span className="ml-2 badge bg-brand-100 text-brand-700">Tiers payant</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    Soins du {fmtDate(c.careDate)} · soumise {fmtDateTime(c.submittedAt)}
                    {c.beneficiary ? ` · ${c.beneficiary.firstName} ${c.beneficiary.lastName}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{fcfa(c.totalApproved ?? c.totalRequested)}</p>
                  <span className={`badge ${statusStyle(c.status)}`}>{statusLabel(c.status)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { fmtDate, fmtDateTime, statusLabel, statusStyle } from '../../format';
import { Spinner, StatusBadge } from '../../components/ui';

export default function CareRecordList() {
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    api.get('/care-records/mine').then(setItems).catch(() => setItems([]));
  }, []);

  if (!items) return <Spinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Mes soins — dossiers de prise en charge</h1>
      <p className="text-sm text-slate-500">
        Chaque dossier regroupe consultation, prescription, délivrance et facturation d’un même épisode de soins.
      </p>
      {items.length === 0 ? (
        <div className="card-p text-center text-sm text-slate-500">
          Aucun dossier de soins. Vos consultations et prescriptions apparaîtront ici.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map(d => (
            <li key={d.id}>
              <Link to={`/app/soins/${d.id}`} className="card-p flex flex-col gap-1 hover:border-brand-300 transition">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{d.reference}</span>
                  <StatusBadge status={d.status} />
                  <span className="ml-auto text-xs text-slate-400">{fmtDateTime(d.createdAt)}</span>
                </div>
                <p className="text-sm">
                  {d.consultation ? `${d.consultation.motif}` : d.prescription ? `Ordonnance ${d.prescription.number}` : d.type}
                  {d.prescription ? ` — ${d.prescription.lines.length} produit(s)` : ''}
                </p>
                <p className="text-xs text-slate-400">
                  {d.delivery ? `Délivrance ${d.delivery.reference} — couvert ${d.claim ? d.claim.totalApproved : ''} FCFA` : 'En attente de délivrance'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate } from '../../format';
import { Field, Spinner, StatusBadge } from '../../components/ui';

export default function MemberConsultations() {
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    api.get('/consultations/mine').then(setItems).catch(() => setItems([]));
  }, []);

  if (!items) return <Spinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Mes consultations</h1>
      {items.length === 0 ? (
        <div className="card-p text-center text-sm text-slate-500">Aucune consultation enregistrée.</div>
      ) : (
        <ul className="space-y-3">
          {items.map(c => (
            <li key={c.id} className="card-p">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{c.reference}</span>
                <span className="text-xs text-slate-400">{fmtDate(c.careDate)}</span>
                <span className="ml-auto text-xs text-slate-500">{c.provider?.name ?? ''}</span>
              </div>
              <p className="mt-1 text-sm"><b>Motif :</b> {c.motif}</p>
              {c.diagnostic && <p className="text-sm"><b>Diagnostic :</b> {c.diagnostic}</p>}
              <p className="text-xs text-slate-400">Praticien : {c.practitionerName}{c.specialty ? ` — ${c.specialty}` : ''}</p>
              {c.prescriptions.length > 0 && (
                <p className="text-xs text-brand-700">Ordonnance : {c.prescriptions[0].number} ({c.prescriptions[0].status})</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

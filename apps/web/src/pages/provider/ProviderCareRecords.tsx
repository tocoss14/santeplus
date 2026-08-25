import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { fmtDateTime, statusLabel, statusStyle } from '../../format';
import { Spinner, StatusBadge } from '../../components/ui';

export default function ProviderCareRecords() {
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    api.get('/care-records/provider/care-records').then(setItems).catch(() => setItems([]));
  }, []);

  if (!items) return <Spinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Dossiers de soins — mon établissement</h1>
      {items.length === 0 ? (
        <div className="card-p text-center text-sm text-slate-500">Aucun dossier — les consultations et prescriptions apparaîtront ici.</div>
      ) : (
        <ul className="space-y-3">
          {items.map(d => (
            <li key={d.id}>
              <Link to={`/care-records/${d.id}`} className="card-p flex flex-col gap-1 hover:border-brand-300 transition">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{d.reference}</span>
                  <StatusBadge status={d.status} />
                  <span className="ml-auto text-xs text-slate-400">{fmtDateTime(d.createdAt)}</span>
                </div>
                <p className="text-sm">
                  {d.patientUser.firstName} {d.patientUser.lastName}
                  {d.beneficiary ? ` — ${d.beneficiary.firstName} ${d.beneficiary.lastName}` : ''} · {d.consultation?.motif ?? d.prescription?.number ?? d.type}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

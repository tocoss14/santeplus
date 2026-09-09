import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate, statusLabel, ctsBandLabel } from '../../format';
import { Spinner, StatusBadge } from '../../components/ui';
import { BandBadge } from '../../components/CtsCards';

function qs(obj: Record<string, any>) {
  return new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v != null)).toString();
}

export default function AdminFraud() {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState({ status: '', q: '', page: 1 });

  useEffect(() => {
    const q = qs(filter);
    api.get(`/admin/fraud?${q}`).then(setData).catch(() => setData({ error: true }));
  }, [filter]);

  if (!data) return <Spinner />;
  if (data.error) return <div className="card-p text-sm text-red-700">Indisponible.</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-xl font-bold">Cas de fraude ({data.total})</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-64" placeholder="Recherche (membre, contrat, motif…)" value={filter.q} onChange={e => setFilter(f => ({ ...f, q: e.target.value }))} />
          <select className="input w-40" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
            <option value="">Tous statuts</option>
            <option value="OPEN">Ouvert</option>
            <option value="INVESTIGATING">En investigation</option>
            <option value="CLOSED_NO_FRAUD">Clos — pas de fraude</option>
            <option value="CLOSED_FRAUD_CONFIRMED">Clos — fraude confirmée</option>
            <option value="CLOSED_RECOVERED">Clos — récupéré</option>
          </select>
        </div>
      </div>

      <div className="card-p">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th text-left">#</th>
                <th className="th text-left">Membre</th>
                <th className="th text-left">Contrat</th>
                <th className="th text-left">Type</th>
                <th className="th text-left">Statut</th>
                <th className="th text-right">Montant</th>
                <th className="th text-left">Détecté</th>
                <th className="th text-left">Assigné</th>
                <th className="th text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((c: any) => (
                <tr key={c.id}>
                  <td className="td font-mono text-xs">{c.caseNumber}</td>
                  <td className="td">{c.member?.firstName} {c.member?.lastName} <br/><span className="text-xs text-slate-400">{c.member?.memberNumber}</span></td>
                  <td className="td font-mono text-xs">{c.contract?.number ?? '—'}</td>
                  <td className="td">{c.fraudType}</td>
                  <td className="td"><StatusBadge status={c.status} /></td>
                  <td className="td text-right font-semibold">{fcfa(c.amount)}</td>
                  <td className="td text-xs text-slate-500">{fmtDate(c.detectedAt)}</td>
                  <td className="td text-xs">{c.assignee?.name ?? '—'}</td>
                  <td className="td">
                    <button className="btn-outline btn-sm" onClick={() => openCase(c.id)}>Ouvrir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.pageCount > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
            <span>Page {data.page} / {data.pageCount}</span>
            <div className="flex gap-2">
              <button className="btn-outline btn-sm" disabled={data.page === 1} onClick={() => setFilter(f => ({ ...f, page: f.page - 1 }))}>Précédent</button>
              <button className="btn-outline btn-sm" disabled={data.page === data.pageCount} onClick={() => setFilter(f => ({ ...f, page: f.page + 1 }))}>Suivant</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function openCase(id: string) {
  window.open(`/admin/fraud/${id}`, '_blank');
}
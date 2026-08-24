import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDateTime, statusLabel, statusStyle } from '../../format';
import { Spinner } from '../../components/ui';

export default function AdminPayments() {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.get(`/admin/payments${status ? `?status=${status}` : ''}`).then(setData).catch(() => setData({ items: [] }));
  }, [status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Paiements</h1>
        <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tous</option>
          <option value="SUCCEEDED">Réussis</option>
          <option value="PENDING">En attente</option>
          <option value="FAILED">Échoués</option>
        </select>
      </div>
      {!data ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead><tr><th className="th">Référence</th><th className="th">Payeur</th><th className="th">Contrat</th><th className="th">Montant</th><th className="th">Moyen</th><th className="th">Date</th><th className="th">Statut</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((p: any) => (
                <tr key={p.id}>
                  <td className="td font-mono text-xs">{p.reference}</td>
                  <td className="td text-sm">{p.user ? `${p.user.firstName} ${p.user.lastName}` : '—'}</td>
                  <td className="td text-xs">{p.contract?.number ?? '—'}</td>
                  <td className="td font-medium">{fcfa(p.amount)}</td>
                  <td className="td text-xs">{p.method}</td>
                  <td className="td text-xs whitespace-nowrap">{fmtDateTime(p.completedAt ?? p.initiatedAt)}</td>
                  <td className="td"><span className={`badge ${statusStyle(p.status)}`}>{statusLabel(p.status)}</span></td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={7} className="td py-8 text-center text-slate-400">Aucun paiement</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

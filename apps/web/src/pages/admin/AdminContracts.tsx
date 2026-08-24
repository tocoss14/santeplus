import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate, statusLabel, statusStyle } from '../../format';
import { Spinner, StatusBadge } from '../../components/ui';

export default function AdminContracts() {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  const load = () => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    api.get(`/admin/contracts?${params}`).then(setData).catch(() => setData({ items: [] }));
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [status, q]);

  async function act(id: string, action: string) {
    if (!confirm(`Confirmer l’action « ${action} » sur ce contrat ?`)) return;
    await api.post(`/admin/contracts/${id}/${action}`, {});
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Contrats ({data?.total ?? '…'})</h1>
        <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="ACTIVE">Actifs</option>
          <option value="PENDING_PAYMENT">Paiement en attente</option>
          <option value="SUSPENDED">Suspendus</option>
          <option value="EXPIRED">Expirés</option>
          <option value="TERMINATED">Résiliés</option>
        </select>
        <input className="input w-52" placeholder="N° contrat, assuré…" value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead><tr><th className="th">Contrat</th><th className="th">Assuré / Entreprise</th><th className="th">Produit</th><th className="th">Validité</th><th className="th">Cotisation</th><th className="th">Statut</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((c: any) => (
                <tr key={c.id}>
                  <td className="td font-medium">{c.number}</td>
                  <td className="td text-sm">
                    {c.principalUser ? `${c.principalUser.firstName} ${c.principalUser.lastName}` : ''}
                    {c.company && <span className="block text-xs text-slate-400">{c.company.name}</span>}
                  </td>
                  <td className="td text-xs">{c.product.name}</td>
                  <td className="td text-xs whitespace-nowrap">{fmtDate(c.startDate)} → {fmtDate(c.endDate)}</td>
                  <td className="td text-xs">{fcfa(c.premiumAnnual)}</td>
                  <td className="td"><StatusBadge status={c.status} /></td>
                  <td className="td text-right space-x-2 whitespace-nowrap">
                    {c.status === 'ACTIVE' && (
                      <>
                        <button onClick={() => act(c.id, 'suspend')} className="text-xs text-red-600 hover:underline">Suspendre</button>
                        <button onClick={() => act(c.id, 'terminate')} className="text-xs text-slate-500 hover:underline">Résilier</button>
                      </>
                    )}
                    {c.status === 'SUSPENDED' && <button onClick={() => act(c.id, 'activate')} className="text-xs text-emerald-600 hover:underline">Réactiver</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Aucun contrat</p>}
        </div>
      )}
    </div>
  );
}

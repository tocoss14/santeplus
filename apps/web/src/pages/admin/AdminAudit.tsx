import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fmtDate } from '../../format';
import { Spinner } from '../../components/ui';

function qs(obj: Record<string, any>) {
  return new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v != null)).toString();
}

export default function AdminAudit() {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState({ entity: '', action: '', userId: '', from: '', to: '', page: 1 });

  useEffect(() => {
    const q = qs(filter);
    api.get(`/admin/audit?${q}`).then(setData).catch(() => setData({ error: true }));
  }, [filter]);

  if (!data) return <Spinner />;
  if (data.error) return <div className="card-p text-sm text-red-700">Indisponible.</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-xl font-bold">Journal d'audit ({data.total})</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-48" type="date" value={filter.from} onChange={e => setFilter(f => ({ ...f, from: e.target.value }))} />
          <input className="input w-48" type="date" value={filter.to} onChange={e => setFilter(f => ({ ...f, to: e.target.value }))} />
          <input className="input w-56" placeholder="Entité (ex: Contract, Claim)" value={filter.entity} onChange={e => setFilter(f => ({ ...f, entity: e.target.value }))} />
          <input className="input w-40" placeholder="Action" value={filter.action} onChange={e => setFilter(f => ({ ...f, action: e.target.value }))} />
          <input className="input w-40" placeholder="User ID" value={filter.userId} onChange={e => setFilter(f => ({ ...f, userId: e.target.value }))} />
        </div>
      </div>

      <div className="card-p">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th text-left">Date</th>
                <th className="th text-left">Utilisateur</th>
                <th className="th text-left">Entité</th>
                <th className="th text-left">Action</th>
                <th className="th text-left">ID entité</th>
                <th className="th text-left">IP</th>
                <th className="th text-left">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((a: any) => (
                <tr key={a.id}>
                  <td className="td text-xs">{fmtDate(a.createdAt)}</td>
                  <td className="td">{a.user?.name ?? a.userId ?? 'système'}</td>
                  <td className="td font-medium">{a.entity}</td>
                  <td className="td"><span className="badge bg-slate-100 text-slate-700">{a.action}</span></td>
                  <td className="td font-mono text-xs">{a.entityId}</td>
                  <td className="td text-xs text-slate-400">{a.ip ?? '—'}</td>
                  <td className="td max-w-xs">
                    <pre className="text-[11px] text-slate-500 overflow-hidden whitespace-nowrap text-ellipsis">{JSON.stringify(a.details)}</pre>
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
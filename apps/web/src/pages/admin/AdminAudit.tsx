import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fmtDateTime } from '../../format';
import { Spinner } from '../../components/ui';

export default function AdminAudit() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get(`/admin/audit?page=${page}&q=${encodeURIComponent(q)}`).then(setData).catch(() => setData({ items: [] }));
  }, [page, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Journal d’audit</h1>
        <input className="input w-56" placeholder="Filtrer par action…" value={q} onChange={e => { setPage(1); setQ(e.target.value); }} />
      </div>
      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr><th className="th">Date</th><th className="th">Utilisateur</th><th className="th">Action</th><th className="th">Entité</th><th className="th">Résultat</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((l: any) => (
                  <tr key={l.id}>
                    <td className="td text-xs whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                    <td className="td text-xs">{l.user ? `${l.user.firstName} ${l.user.lastName}` : '—'}</td>
                    <td className="td font-mono text-xs">{l.action}</td>
                    <td className="td text-xs text-slate-400">{l.entityType}{l.entityId ? ` · ${l.entityId.slice(0, 8)}…` : ''}</td>
                    <td className="td">
                      <span className={`badge ${l.status === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{l.status === 'OK' ? 'OK' : 'Échec'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.items.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Aucune entrée</p>}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Page {data.page} / {Math.max(1, data.pages)} — {data.total} entrées</span>
            <div className="gap-2 flex">
              <button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</button>
              <button className="btn-outline btn-sm" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Suivant</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

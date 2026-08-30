import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fmtDateTime } from '../../format';
import { Spinner } from '../../components/ui';
import { printReport, exportCsv } from '../../printReport';
import DateRangeFilter from '../../components/DateRangeFilter';

export default function AdminAudit() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (q) params.set('q', q);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    api.get(`/admin/audit?${params}`).then(setData).catch(() => setData({ items: [] }));
  }, [page, q, from, to]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Journal d’audit</h1>
        <input className="input w-56" placeholder="Filtrer par action…" value={q} onChange={e => { setPage(1); setQ(e.target.value); }} />
        <DateRangeFilter from={from} to={to} onChange={(f, t) => { setPage(1); setFrom(f); setTo(t); }} />
        <button className="btn-outline btn-sm" onClick={() => {
          if (!data?.items) return;
          const period = [from && `Du ${new Date(from).toLocaleDateString('fr-FR')}`, to && `au ${new Date(to).toLocaleDateString('fr-FR')}`].filter(Boolean).join(' ');
          const filters = [q ? `Filtre : "${q}"` : '', period || 'Toutes périodes'].filter(Boolean).join(' · ');
          printReport({
            title: "Journal d'audit",
            subtitle: `${data.total} entrée(s)`,
            filters,
            columns: [
              { label: 'Date', key: 'createdAt', format: (v: string) => fmtDateTime(v) },
              { label: 'Utilisateur', key: 'user', format: (v: any) => v ? `${v.firstName} ${v.lastName}` : '—' },
              { label: 'Action', key: 'action' },
              { label: 'Entité', key: 'entityType', format: (v: string, r: any) => `${v}${r.entityId ? ` · ${r.entityId.slice(0, 8)}…` : ''}` },
              { label: 'Résultat', key: 'status', format: (v: string) => v === 'OK' ? 'OK' : 'Échec' },
            ],
            rows: data.items,
            summary: [
              { label: 'Total', value: `${data.total} entrée(s)`, accent: true },
              { label: 'Échecs', value: `${data.items.filter((l: any) => l.status !== 'OK').length}` },
            ],
          });
        }}>🖨️ Imprimer</button>
        <button className="btn-outline btn-sm" onClick={() => {
          if (!data?.items) return;
          exportCsv('etats-audit.csv', [
            { label: 'Date', key: 'createdAt', format: (v: string) => fmtDateTime(v) },
            { label: 'Utilisateur', key: 'user', format: (v: any) => v ? `${v.firstName} ${v.lastName}` : '—' },
            { label: 'Action', key: 'action' },
            { label: 'Entité', key: 'entityType', format: (v: string, r: any) => `${v}${r.entityId ? ` · ${r.entityId}` : ''}` },
            { label: 'Résultat', key: 'status', format: (v: string) => v === 'OK' ? 'OK' : 'Échec' },
          ], data.items);
        }}>📊 CSV</button>
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

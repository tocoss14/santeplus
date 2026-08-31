import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fmtDate } from '../../format';
import { Spinner } from '../../components/ui';
import Pagination from '../../components/Pagination';

export default function AdminDocuments() {
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [q, type]);
  useEffect(() => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (type) qs.set('documentType', type);
    qs.set('page', String(page));
    api.get(`/admin/documents?${qs.toString()}`).then(setData).catch(() => setData({ items: [] }));
  }, [q, type, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">GED — Documents</h1>
        <input className="input w-64" placeholder="Rechercher fichier/tags…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="input w-auto" value={type} onChange={e => setType(e.target.value)}>
          <option value="">Tous types</option>
          <option value="INVOICE">Facture</option>
          <option value="PRESCRIPTION">Ordonnance</option>
          <option value="CONTRACT">Contrat</option>
          <option value="IDENTITY">Pièce identité</option>
        </select>
      </div>
      {!data ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead><tr><th className="th">Fichier</th><th className="th">Type</th><th className="th">Version</th><th className="th">Taille</th><th className="th">Propriétaire</th><th className="th">Date</th><th className="th">Tags</th></tr></thead>
            <tbody className="divide-y">
              {data.items.map((f: any) => (
                <tr key={f.id}>
                  <td className="td font-mono text-xs">{f.storagePath.slice(0, 24)}…</td>
                  <td className="td text-xs"><span className="badge bg-slate-100">{f.documentType ?? '—'}</span></td>
                  <td className="td text-xs">v{f.version}</td>
                  <td className="td text-xs">{(f.size / 1024).toFixed(1)} Ko</td>
                  <td className="td text-xs">{f.owner?.email ?? f.ownerId.slice(0, 8)}</td>
                  <td className="td text-xs">{fmtDate(f.createdAt)}</td>
                  <td className="td text-xs">{(() => { try { const t = JSON.parse(f.tags ?? '[]'); return t.join(', ') || '—'; } catch { return f.tags ?? '—'; }})()}</td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={7} className="td text-center py-8 text-slate-400">Aucun document</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
      <div className="card-p bg-slate-50 text-xs text-slate-500">
        GED versionnée : chaque upload conserve `sha256`, `version` incrémentée si même `documentType` + propriétaire, `previousVersionId` chaîné. Tags JSON pour classification. Rétention 10 ans (SystemConfig `retention.*`).
      </div>
    </div>
  );
}

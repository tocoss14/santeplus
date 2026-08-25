import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { fcfa, fmtDateTime, statusLabel, statusStyle } from '../../format';
import { Spinner } from '../../components/ui';

const STATUSES = [
  ['PENDING_CONFIRMATION', 'À confirmer'],
  ['AUTH_REQUIRED', 'Autorisation requise'],
  ['AUTHORIZED', 'Autorisée'],
  ['CONFIRMED', 'Soins réalisés'],
  ['PAID', 'Payées'],
  ['REJECTED', 'Refusées'],
  ['CANCELLED', 'Annulées'],
];

export default function TpList() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (status) p.set('status', status);
      if (q) p.set('q', q);
      p.set('page', String(page));
      api.get(`/provider/thirdparty?${p}`).then(setData).catch(() => setData({ items: [] }));
    }, 250);
    return () => clearTimeout(t);
  }, [status, q, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Prises en charge</h1>
        <input className="input w-52" placeholder="Réf, patient, n° assuré…" value={q} onChange={e => { setPage(1); setQ(e.target.value); }} />
        <select className="input w-auto" value={status} onChange={e => { setPage(1); setParams(e.target.value ? { status: e.target.value } : {}); }}>
          <option value="">Tous les statuts</option>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <Link to="/prestataire/nouvelle" className="btn-primary btn-sm">＋ Nouvelle</Link>
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr>
                  <th className="th">Référence</th><th className="th">Patient</th><th className="th">Acte</th>
                  <th className="th">Montant</th><th className="th">Couvert</th><th className="th">Facture</th>
                  <th className="th">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((c: any) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-slate-50">
                    <td className="td">
                      <Link to={`/prestataire/prises/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.reference}</Link>
                      <p className="text-[11px] text-slate-400">{fmtDateTime(c.createdAt)}</p>
                    </td>
                    <td className="td text-sm">
                      {c.patient}
                      <p className="text-[11px] text-slate-400">{c.memberNumber}</p>
                    </td>
                    <td className="td text-xs">{c.actLabel}</td>
                    <td className="td text-sm">{fcfa(c.totalRequested)}</td>
                    <td className="td text-sm font-medium">{fcfa(c.totalApproved ?? 0)}</td>
                    <td className="td text-xs">
                      {c.paidAt ? <span className="badge bg-emerald-100 text-emerald-700">Payée {c.paidRef ? `· ${c.paidRef}` : ''}</span>
                        : c.invoiceNumber ? <span className="badge bg-blue-100 text-blue-700">{c.invoiceNumber}</span>
                        : '—'}
                    </td>
                    <td className="td"><span className={`badge ${statusStyle(c.status)}`}>{statusLabel(c.status)}</span></td>
                  </tr>
                ))}
                {data.items.length === 0 && <tr><td colSpan={7} className="td py-8 text-center text-slate-400">Aucun dossier</td></tr>}
              </tbody>
            </table>
          </div>
          {data.pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Page {data.page} / {data.pages}</span>
              <div className="flex gap-2">
                <button className="btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</button>
                <button className="btn-outline btn-sm" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Suivant</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDateTime, statusLabel, statusStyle } from '../../format';
import { Spinner } from '../../components/ui';
import Pagination from '../../components/Pagination';
import { printReport, exportCsv } from '../../printReport';
import DateRangeFilter from '../../components/DateRangeFilter';

export default function AdminPayments() {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [status, from, to]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('page', String(page));
    const qs = params.toString();
    api.get(`/admin/payments${qs ? `?${qs}` : ''}`).then(setData).catch(() => setData({ items: [] }));
  }, [status, from, to, page]);

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
        <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <button className="btn-outline btn-sm" onClick={() => {
          if (!data?.items) return;
          const stLabels: Record<string, string> = { SUCCEEDED: 'Réussi', PENDING: 'En attente', FAILED: 'Échoué' };
          const period = [from && `Du ${new Date(from).toLocaleDateString('fr-FR')}`, to && `au ${new Date(to).toLocaleDateString('fr-FR')}`].filter(Boolean).join(' ');
          const filters = [status ? `Statut : ${stLabels[status] ?? status}` : '', period || 'Toutes périodes'].filter(Boolean).join(' · ');
          const total = data.items.reduce((s: number, p: any) => s + (p.amount ?? 0), 0);
          printReport({
            title: 'État des paiements',
            subtitle: `${data.items.length} paiement(s)`,
            filters,
            columns: [
              { label: 'Référence', key: 'reference' },
              { label: 'Payeur', key: 'user', format: (v: any) => v ? `${v.firstName} ${v.lastName}` : '—' },
              { label: 'Contrat', key: 'contract', format: (v: any) => v?.number ?? '—' },
              { label: 'Montant', key: 'amount', align: 'right', format: (v: number) => fcfa(v) },
              { label: 'Moyen', key: 'method' },
              { label: 'Date', key: 'completedAt', format: (v: any) => fmtDateTime(v) },
              { label: 'Statut', key: 'status', format: (v: string) => statusLabel(v) },
            ],
            rows: data.items,
            summary: [
              { label: 'Total encaissé', value: fcfa(total), accent: true },
              { label: 'Réussis', value: `${data.items.filter((p: any) => p.status === 'SUCCEEDED').length}` },
              { label: 'Échoués', value: `${data.items.filter((p: any) => p.status === 'FAILED').length}` },
            ],
          });
        }}>🖨️ Imprimer</button>
        <button className="btn-outline btn-sm" onClick={() => {
          if (!data?.items) return;
          exportCsv('etats-paiements.csv', [
            { label: 'Référence', key: 'reference' },
            { label: 'Payeur', key: 'user', format: (v: any) => v ? `${v.firstName} ${v.lastName}` : '—' },
            { label: 'Contrat', key: 'contract', format: (v: any) => v?.number ?? '—' },
            { label: 'Montant', key: 'amount' },
            { label: 'Moyen', key: 'method' },
            { label: 'Date', key: 'completedAt', format: (v: any) => fmtDateTime(v) },
            { label: 'Statut', key: 'status', format: (v: string) => statusLabel(v) },
          ], data.items);
        }}>📊 CSV</button>
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

      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api, API_BASE, getToken } from '../../api';
import { fcfa, fmtDate } from '../../format';
import { Spinner } from '../../components/ui';
import Pagination from '../../components/Pagination';
import DateRangeFilter from '../../components/DateRangeFilter';

export default function AdminAccounting() {
  const [entries, setEntries] = useState<any>(null);
  const [summary, setSummary] = useState<any[]>([]);
  const [chart, setChart] = useState<any[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [journalCode, setJournalCode] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [from, to, accountCode, journalCode]);
  useEffect(() => { api.get('/admin/accounting/chart').then(setChart).catch(() => {}); }, []);
  useEffect(() => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (accountCode) qs.set('accountCode', accountCode);
    if (journalCode) qs.set('journalCode', journalCode);
    qs.set('page', String(page));
    api.get(`/admin/accounting/entries?${qs.toString()}`).then(setEntries).catch(() => setEntries({ items: [] }));
  }, [from, to, accountCode, journalCode, page]);
  useEffect(() => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    api.get(`/admin/accounting/summary?${qs.toString()}`).then(setSummary).catch(() => {});
  }, [from, to]);

  const exportCsv = () => {
    const token = getToken();
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    qs.set('format', 'csv');
    const url = `${API_BASE}/api/admin/accounting/export?${qs.toString()}&token=${token ?? ''}`;
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Comptabilité technique</h1>
        <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <select className="input w-auto" value={journalCode} onChange={e => setJournalCode(e.target.value)}>
          <option value="">Tous journaux</option>
          <option value="BQ">BQ — Banque</option>
          <option value="OD">OD — Opérations diverses</option>
        </select>
        <select className="input w-auto" value={accountCode} onChange={e => setAccountCode(e.target.value)}>
          <option value="">Tous comptes</option>
          {chart.map((a: any) => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
        </select>
        <button className="btn-outline btn-sm" onClick={exportCsv}>📊 Export CSV</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {summary.map((s: any) => (
          <div key={s.account.code} className="card-p">
            <p className="text-xs font-mono text-slate-400">{s.account.code}</p>
            <p className="font-semibold text-sm">{s.account.name}</p>
            <p className="mt-2 text-sm">Débit {fcfa(s.debit)} · Crédit {fcfa(s.credit)}</p>
            <p className={`text-sm font-bold ${s.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Solde {fcfa(s.balance)}</p>
          </div>
        ))}
        {summary.length === 0 && <p className="text-sm text-slate-400">Aucune écriture sur la période</p>}
      </div>

      {!entries ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead><tr><th className="th">Date</th><th className="th">Journal</th><th className="th">Compte</th><th className="th">Libellé</th><th className="th">Débit</th><th className="th">Crédit</th><th className="th">Période</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {entries.items.map((e: any) => (
                <tr key={e.id}>
                  <td className="td text-xs">{fmtDate(e.date)}</td>
                  <td className="td text-xs font-mono">{e.journal.code}</td>
                  <td className="td text-xs"><span className="font-mono">{e.account.code}</span> <span className="text-slate-500">{e.account.name}</span></td>
                  <td className="td text-sm">{e.label}</td>
                  <td className="td font-medium">{e.debit ? fcfa(e.debit) : '—'}</td>
                  <td className="td font-medium">{e.credit ? fcfa(e.credit) : '—'}</td>
                  <td className="td text-xs">{e.period}</td>
                </tr>
              ))}
              {entries.items.length === 0 && <tr><td colSpan={7} className="td py-8 text-center text-slate-400">Aucune écriture</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {entries && <Pagination page={entries.page} pages={entries.pages} total={entries.total} onChange={setPage} />}

      <div className="card-p bg-slate-50 text-xs text-slate-500">
        Plan OHADA assurance : 702 primes, 603 sinistres, 395 provisions, 512 banque, 411 créances, 401 dettes, 706 adhésion. Période = YYYY-MM. Export FEC disponible via ?format=fec.
      </div>
    </div>
  );
}

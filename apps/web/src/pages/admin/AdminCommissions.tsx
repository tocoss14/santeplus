import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate, statusLabel, statusStyle } from '../../format';
import { Badge, ErrorBanner, Field, Modal, Spinner, StatCard } from '../../components/ui';
import Pagination from '../../components/Pagination';
import { printReport, exportCsv } from '../../printReport';

const TYPE_LABELS: Record<string, string> = {
  NEW_BUSINESS: 'Nouvelle souscription',
  RENEWAL: 'Renouvellement',
  OVERRIDE: 'Override équipe',
  BONUS: 'Bonus performance',
};

export default function AdminCommissions() {
  const [data, setData] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'list' | 'stats'>('list');
  const [payModal, setPayModal] = useState<any>(null);
  const [rejectModal, setRejectModal] = useState<any>(null);
  const [paymentRef, setPaymentRef] = useState('');
  const [rejectNote, setRejectNote] = useState('');

  const items = data?.items ?? null;

  const load = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    if (q) params.set('q', q);
    params.set('page', String(page));
    api.get(`/admin/commissions?${params}`).then(setData).catch(() => setData({ items: [], total: 0 }));
    api.get('/admin/commissions/stats').then(setStats).catch(() => setStats(null));
  };

  useEffect(() => { setPage(1); }, [statusFilter, typeFilter, q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [statusFilter, typeFilter, q, page]);

  const approve = async (id: string) => {
    try {
      await api.post(`/admin/commissions/${id}/approve`, {});
      load();
    } catch (err: any) { setError(err?.message); }
  };

  const reject = async (id: string) => {
    if (!rejectNote.trim()) return;
    try {
      await api.post(`/admin/commissions/${id}/reject`, { note: rejectNote });
      setRejectModal(null);
      setRejectNote('');
      load();
    } catch (err: any) { setError(err?.message); }
  };

  const markPaid = async (id: string) => {
    if (!paymentRef.trim()) return;
    try {
      await api.post(`/admin/commissions/${id}/pay`, { paymentRef });
      setPayModal(null);
      setPaymentRef('');
      load();
    } catch (err: any) { setError(err?.message); }
  };



  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Commissions ({data?.total ?? '…'})</h1>
        <input className="input w-48" placeholder="Rechercher…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="PENDING">En attente</option>
          <option value="APPROVED">Approuvées</option>
          <option value="PAID">Payées</option>
          <option value="REJECTED">Rejetées</option>
        </select>
        <select className="input w-auto" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">Tous les types</option>
          <option value="NEW_BUSINESS">Nouvelle souscription</option>
          <option value="RENEWAL">Renouvellement</option>
          <option value="OVERRIDE">Override équipe</option>
          <option value="BONUS">Bonus performance</option>
        </select>
        <button className="btn-outline btn-sm" onClick={() => {
          if (!items) return;
          printReport({
            title: 'État des commissions',
            subtitle: `${items.length} commission(s)`,
            columns: [
              { label: 'Distributeur', key: 'distributor', format: (v: any) => `${v?.user?.firstName} ${v?.user?.lastName}` },
              { label: 'Code', key: 'distributor', format: (v: any) => v?.referralCode },
              { label: 'Type', key: 'type', format: (v: string) => TYPE_LABELS[v] ?? v },
              { label: 'Contrat', key: 'contract', format: (v: any) => v?.number ?? '—' },
              { label: 'Base', key: 'baseAmount', format: (v: number) => fcfa(v) },
              { label: 'Taux', key: 'rate', format: (v: number) => `${v}%` },
              { label: 'Commission', key: 'amount', format: (v: number) => fcfa(v) },
              { label: 'Statut', key: 'status' },
              { label: 'Date', key: 'createdAt', format: (v: string) => fmtDate(v) },
            ],
            rows: items ?? [],
            summary: stats ? [
              { label: 'Total', value: fcfa(stats.total?.amount), accent: true },
              { label: 'En attente', value: fcfa(stats.pending?.amount) },
              { label: 'Approuvées', value: fcfa(stats.approved?.amount) },
              { label: 'Payées', value: fcfa(stats.paid?.amount) },
            ] : [],
          });
        }}>🖨️ Imprimer</button>
        <button className="btn-outline btn-sm" onClick={() => {
          if (!items) return;
          exportCsv('commissions.csv', [
            { label: 'Distributeur', key: 'distributor', format: (v: any) => `${v?.user?.firstName} ${v?.user?.lastName}` },
            { label: 'Code', key: 'distributor', format: (v: any) => v?.referralCode },
            { label: 'Type', key: 'type', format: (v: string) => TYPE_LABELS[v] ?? v },
            { label: 'Contrat', key: 'contract', format: (v: any) => v?.number ?? '—' },
            { label: 'Base', key: 'baseAmount' },
            { label: 'Taux', key: 'rate' },
            { label: 'Commission', key: 'amount' },
            { label: 'Statut', key: 'status' },
            { label: 'Date', key: 'createdAt', format: (v: string) => fmtDate(v) },
          ], items ?? []);
        }}>📊 CSV</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${tab === 'list' ? 'bg-white shadow text-brand-700' : 'text-slate-600 hover:text-slate-800'}`}
          onClick={() => setTab('list')}
        >Liste ({data?.total ?? 0})</button>
        <button
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${tab === 'stats' ? 'bg-white shadow text-brand-700' : 'text-slate-600 hover:text-slate-800'}`}
          onClick={() => setTab('stats')}
        >Résumé</button>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* STATS TAB */}
      {tab === 'stats' && stats && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total commissions" value={fcfa(stats.total?.amount)} sub={`${stats.total?.count ?? 0} commission(s)`} accent />
          <StatCard label="En attente" value={fcfa(stats.pending?.amount)} sub={`${stats.pending?.count ?? 0} à traiter`} />
          <StatCard label="Approuvées" value={fcfa(stats.approved?.amount)} sub={`${stats.approved?.count ?? 0} à payer`} />
          <StatCard label="Payées" value={fcfa(stats.paid?.amount)} sub={`${stats.paid?.count ?? 0} transaction(s)`} />
        </div>
      )}

      {tab === 'stats' && stats?.byType && (
        <div className="card-p">
          <p className="text-sm font-semibold text-slate-700">Par type</p>
          <div className="mt-3 divide-y divide-mist">
            {stats.byType.map((t: any) => (
              <div key={t.type} className="flex items-center justify-between py-2">
                <p className="text-sm">{TYPE_LABELS[t.type] ?? t.type}</p>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold">{fcfa(t.amount)}</p>
                  <p className="text-xs text-slate-400">{t.count} commission(s)</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LIST TAB */}
      {tab === 'list' && (
        <>
          {!items ? (
            <Spinner />
          ) : (items?.length ?? 0) === 0 ? (
            <div className="card-p text-center py-8 text-slate-400">Aucune commission trouvée</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Distributeur</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Type</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Contrat</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400 text-right">Base</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400 text-right">Taux</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400 text-right">Commission</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Statut</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Date</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {items?.map((c: any) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-xs">{c.distributor?.user?.firstName} {c.distributor?.user?.lastName}</p>
                        <p className="font-mono text-[10px] text-slate-400">{c.distributor?.referralCode}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs">{TYPE_LABELS[c.type] ?? c.type}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{c.contract?.number ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{fcfa(c.baseAmount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{c.rate}%</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-bold">{fcfa(c.amount)}</td>
                      <td className="px-3 py-2.5"><Badge tone={statusStyle(c.status)}>{statusLabel(c.status)}</Badge></td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(c.createdAt)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          {c.status === 'PENDING' && (
                            <>
                              <button className="text-[11px] font-bold text-emerald-600 hover:underline" onClick={() => approve(c.id)}>✅ Approuver</button>
                              <button className="text-[11px] font-bold text-red-600 hover:underline" onClick={() => setRejectModal(c)}>❌ Rejeter</button>
                            </>
                          )}
                          {c.status === 'APPROVED' && (
                            <button className="text-[11px] font-bold text-brand-700 hover:underline" onClick={() => setPayModal(c)}>💰 Payer</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
        </>
      )}

      {/* PAY MODAL */}
      {payModal && (
        <Modal open onClose={() => { setPayModal(null); setPaymentRef(''); }} title="Marquer comme payée">
          <p className="text-sm text-slate-600">
            Commission de <strong>{fcfa(payModal.amount)}</strong> pour {payModal.distributor?.user?.firstName} {payModal.distributor?.user?.lastName}
          </p>
          <Field label="Référence de paiement (MoMo, virement, etc.)">
            <input className="input" placeholder="Ex: MOMO-123456789" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} />
          </Field>
          <button className="btn-primary w-full mt-2" disabled={!paymentRef.trim()} onClick={() => markPaid(payModal.id)}>
            Confirmer le paiement
          </button>
        </Modal>
      )}

      {/* REJECT MODAL */}
      {rejectModal && (
        <Modal open onClose={() => { setRejectModal(null); setRejectNote(''); }} title="Rejeter la commission">
          <p className="text-sm text-slate-600">
            Commission de <strong>{fcfa(rejectModal.amount)}</strong> pour {rejectModal.distributor?.user?.firstName} {rejectModal.distributor?.user?.lastName}
          </p>
          <Field label="Raison du rejet">
            <textarea className="input" rows={3} placeholder="Expliquez la raison du rejet…" value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
          </Field>
          <button className="btn-primary w-full mt-2 bg-red-600 hover:bg-red-700" disabled={!rejectNote.trim()} onClick={() => reject(rejectModal.id)}>
            Confirmer le rejet
          </button>
        </Modal>
      )}
    </div>
  );
}

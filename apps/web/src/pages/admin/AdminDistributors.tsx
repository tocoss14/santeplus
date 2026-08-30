import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate, statusLabel, statusStyle } from '../../format';
import { Badge, ErrorBanner, Field, Modal, Spinner, StatCard } from '../../components/ui';
import Pagination from '../../components/Pagination';
import { printReport, exportCsv } from '../../printReport';

const LEVEL_LABELS: Record<string, string> = {
  AMBASSADOR: 'Ambassadeur',
  COMMERCIAL: 'Commercial',
  DISTRIBUTOR: 'Sous-distributeur',
  INSTITUTIONAL: 'Institutionnel',
};

const LEVEL_BADGES: Record<string, string> = {
  AMBASSADOR: 'bg-sky-100 text-sky-800',
  COMMERCIAL: 'bg-brand-100 text-brand-800',
  DISTRIBUTOR: 'bg-purple-100 text-purple-800',
  INSTITUTIONAL: 'bg-amber-100 text-amber-800',
};

export default function AdminDistributors() {
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'list' | 'stats'>('list');

  const items = data?.items ?? null;

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (levelFilter) params.set('level', levelFilter);
    if (statusFilter) params.set('status', statusFilter);
    params.set('page', String(page));
    api.get(`/admin/distributors?${params}`).then(setData).catch(() => setData({ items: [], total: 0 }));
  };

  useEffect(() => { setPage(1); }, [q, levelFilter, statusFilter]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, levelFilter, statusFilter, page]);

  const handleCreate = async (data: any) => {
    try {
      await api.post('/admin/distributors', data);
      setEditing(null);
      load();
    } catch (err: any) {
      setError(err?.message ?? 'Erreur lors de la création');
    }
  };

  const handleUpdate = async (id: string, data: any) => {
    try {
      await api.patch(`/admin/distributors/${id}`, data);
      setEditing(null);
      load();
    } catch (err: any) {
      setError(err?.message ?? 'Erreur lors de la modification');
    }
  };

  const handleActivate = async (id: string) => {
    await api.post(`/admin/distributors/${id}/activate`);
    load();
  };

  const handleSuspend = async (id: string) => {
    if (!confirm('Suspendre ce distributeur ?')) return;
    await api.post(`/admin/distributors/${id}/suspend`);
    load();
  };

  const viewDetail = async (id: string) => {
    const d = await api.get(`/admin/distributors/${id}`);
    setDetail(d);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Distributeurs ({data?.total ?? '…'})</h1>
        <input className="input w-52" placeholder="Rechercher…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="input w-auto" value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
          <option value="">Tous les niveaux</option>
          <option value="AMBASSADOR">Ambassadeurs</option>
          <option value="COMMERCIAL">Commerciaux</option>
          <option value="DISTRIBUTOR">Sous-distributeurs</option>
          <option value="INSTITUTIONAL">Institutionnels</option>
        </select>
        <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="ACTIVE">Actifs</option>
          <option value="PENDING">En attente</option>
          <option value="SUSPENDED">Suspendus</option>
        </select>
        <button className="btn-outline btn-sm" onClick={() => {
          if (!items) return;
          printReport({
            title: 'État des distributeurs',
            subtitle: `${items.length} distributeur(s)`,
            columns: [
              { label: 'Nom', key: 'user', format: (v: any) => `${v?.firstName} ${v?.lastName}` },
              { label: 'Email', key: 'user', format: (v: any) => v?.email },
              { label: 'Code', key: 'referralCode' },
              { label: 'Niveau', key: 'level', format: (v: string) => LEVEL_LABELS[v] ?? v },
              { label: 'Territoire', key: 'territory', format: (v: string) => v ?? '—' },
              { label: 'Commission %', key: 'commissionRate', format: (v: number) => `${v}%` },
              { label: 'Recrutés', key: 'totalRecruited' },
              { label: 'Premium généré', key: 'totalPremiumGenerated', format: (v: number) => fcfa(v) },
              { label: 'Statut', key: 'status' },
            ],
            rows: items,
            summary: [
              { label: 'Total', value: `${data?.total ?? items?.length ?? 0} distributeur(s)`, accent: true },
              { label: 'Actifs', value: `${items?.filter((d: any) => d.status === 'ACTIVE').length ?? 0}` },
              { label: 'En attente', value: `${items?.filter((d: any) => d.status === 'PENDING').length ?? 0}` },
              { label: 'Recrutés total', value: `${items?.reduce((s: number, d: any) => s + (d.totalRecruited || 0), 0) ?? 0}` },
            ],
          });
        }}>🖨️ Imprimer</button>
        <button className="btn-outline btn-sm" onClick={() => {
          if (!items) return;
          exportCsv('distributeurs.csv', [
            { label: 'Nom', key: 'user', format: (v: any) => `${v?.firstName} ${v?.lastName}` },
            { label: 'Email', key: 'user', format: (v: any) => v?.email },
            { label: 'Code', key: 'referralCode' },
            { label: 'Niveau', key: 'level', format: (v: string) => LEVEL_LABELS[v] ?? v },
            { label: 'Territoire', key: 'territory' },
            { label: 'Commission %', key: 'commissionRate' },
            { label: 'Recrutés', key: 'totalRecruited' },
            { label: 'Premium', key: 'totalPremiumGenerated' },
            { label: 'Statut', key: 'status' },
          ], items);
        }}>📊 CSV</button>
        <button className="btn-primary btn-sm" onClick={() => setEditing({ level: 'AMBASSADOR', commissionRate: 10, renewalRate: 3, overrideRate: 0 })}>＋ Distributeur</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${tab === 'list' ? 'bg-white shadow text-brand-700' : 'text-slate-600 hover:text-slate-800'}`}
          onClick={() => setTab('list')}
        >Liste</button>
        <button
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${tab === 'stats' ? 'bg-white shadow text-brand-700' : 'text-slate-600 hover:text-slate-800'}`}
          onClick={() => setTab('stats')}
        >Résumé</button>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* STATS TAB */}
      {tab === 'stats' && items && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total" value={data?.total ?? items.length} sub="distributeurs" accent />
          <StatCard label="Actifs" value={items.filter((i: any) => i.status === 'ACTIVE').length} sub={`de ${items.length} affiché(s)`} />
          <StatCard label="En attente" value={items.filter((i: any) => i.status === 'PENDING').length} />
          <StatCard label="Recrutés total" value={items.reduce((s: number, i: any) => s + (i.totalRecruited || 0), 0)} sub={fcfa(items.reduce((s: number, i: any) => s + (i.totalPremiumGenerated || 0), 0)) + ' premium'} />
        </div>
      )}

      {/* LIST TAB */}
      {tab === 'list' && (
        <>
          {!items ? (
            <Spinner />
          ) : items.length === 0 ? (
            <div className="card-p text-center py-8 text-slate-400">Aucun distributeur trouvé</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Nom</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Code</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Niveau</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Territoire</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400 text-right">Commission</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400 text-right">Recrutés</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400 text-right">Premium</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Statut</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {items.map((d: any) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{d.user?.firstName} {d.user?.lastName}</p>
                        <p className="text-xs text-slate-400">{d.user?.email}</p>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-bold">{d.referralCode}</td>
                      <td className="px-3 py-2.5"><Badge tone={LEVEL_BADGES[d.level]}>{LEVEL_LABELS[d.level] ?? d.level}</Badge></td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{d.territory ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{d.commissionRate}%</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{d.totalRecruited}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{fcfa(d.totalPremiumGenerated)}</td>
                      <td className="px-3 py-2.5"><Badge tone={statusStyle(d.status)}>{statusLabel(d.status)}</Badge></td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <button className="text-xs text-brand-700 hover:underline" onClick={() => viewDetail(d.id)}>Détail</button>
                          {d.status === 'PENDING' && (
                            <button className="text-xs text-emerald-600 hover:underline" onClick={() => handleActivate(d.id)}>Activer</button>
                          )}
                          {d.status === 'ACTIVE' && (
                            <button className="text-xs text-red-600 hover:underline" onClick={() => handleSuspend(d.id)}>Suspendre</button>
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

      {/* CREATE/EDIT MODAL */}
      {editing && (
        <Modal open onClose={() => { setEditing(null); setError(null); }} title={editing.id ? 'Modifier le distributeur' : 'Nouveau distributeur'}>
          <ErrorBanner message={error} />
          {!editing.id && (
            <Field label="Utilisateur ID (email ou ID)">
              <input className="input" placeholder="ID de l'utilisateur" value={editing.userId ?? ''} onChange={e => setEditing((f: any) => ({ ...f, userId: e.target.value }))} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Niveau">
              <select className="input" value={editing.level} onChange={e => setEditing((f: any) => ({ ...f, level: e.target.value }))}>
                <option value="AMBASSADOR">Ambassadeur</option>
                <option value="COMMERCIAL">Commercial</option>
                <option value="DISTRIBUTOR">Sous-distributeur</option>
                <option value="INSTITUTIONAL">Institutionnel</option>
              </select>
            </Field>
            <Field label="Territoire">
              <input className="input" placeholder="Ex: Cotonou" value={editing.territory ?? ''} onChange={e => setEditing((f: any) => ({ ...f, territory: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Commission nouveau (%)">
              <input className="input" type="number" min={0} max={30} value={editing.commissionRate} onChange={e => setEditing((f: any) => ({ ...f, commissionRate: +e.target.value }))} />
            </Field>
            <Field label="Commission renouvellement (%)">
              <input className="input" type="number" min={0} max={15} value={editing.renewalRate} onChange={e => setEditing((f: any) => ({ ...f, renewalRate: +e.target.value }))} />
            </Field>
            <Field label="Override équipe (%)">
              <input className="input" type="number" min={0} max={10} value={editing.overrideRate} onChange={e => setEditing((f: any) => ({ ...f, overrideRate: +e.target.value }))} />
            </Field>
          </div>
          {editing.id && (
            <Field label="Statut">
              <select className="input" value={editing.status ?? 'ACTIVE'} onChange={e => setEditing((f: any) => ({ ...f, status: e.target.value }))}>
                <option value="PENDING">En attente</option>
                <option value="ACTIVE">Actif</option>
                <option value="SUSPENDED">Suspendu</option>
              </select>
            </Field>
          )}
          <button
            className="btn-primary w-full mt-2"
            onClick={() => editing.id ? handleUpdate(editing.id, editing) : handleCreate(editing)}
          >
            {editing.id ? 'Enregistrer' : 'Créer le distributeur'}
          </button>
        </Modal>
      )}

      {/* DETAIL MODAL */}
      {detail && (
        <Modal open onClose={() => setDetail(null)} title={`Distributeur — ${detail.user?.firstName} ${detail.user?.lastName}`} wide>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Informations</p>
              <div className="mt-2 space-y-1.5 text-sm">
                <p><span className="text-slate-500">Email :</span> {detail.user?.email}</p>
                <p><span className="text-slate-500">Code :</span> <span className="font-mono font-bold">{detail.referralCode}</span></p>
                <p><span className="text-slate-500">Niveau :</span> <Badge tone={LEVEL_BADGES[detail.level]}>{LEVEL_LABELS[detail.level]}</Badge></p>
                <p><span className="text-slate-500">Territoire :</span> {detail.territory ?? '—'}</p>
                <p><span className="text-slate-500">Statut :</span> <Badge tone={statusStyle(detail.status)}>{statusLabel(detail.status)}</Badge></p>
                <p><span className="text-slate-500">Créé le :</span> {fmtDate(detail.createdAt)}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Performance</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <StatCard label="Recrutés" value={detail.totalRecruited} />
                <StatCard label="Premium" value={fcfa(detail.totalPremiumGenerated)} />
                <StatCard label="Commission" value={`${detail.commissionRate}%`} />
                <StatCard label="Renouvellement" value={`${detail.renewalRate}%`} />
              </div>
            </div>
          </div>
          {detail.children && detail.children.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Équipe ({detail.children.length})</p>
              <div className="mt-2 divide-y divide-mist">
                {detail.children.map((child: any) => (
                  <div key={child.id} className="flex items-center justify-between py-2">
                    <p className="text-sm">{child.user?.firstName} {child.user?.lastName}</p>
                    <Badge tone={LEVEL_BADGES[child.level]}>{LEVEL_LABELS[child.level]}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

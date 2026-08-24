import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ROLE_LABELS, statusLabel, statusStyle } from '../../format';
import { Modal, Spinner, Field, ErrorBanner } from '../../components/ui';

export default function AdminUsers() {
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (role) params.set('role', role);
    api.get(`/admin/users?${params}`).then(setData).catch(() => setData({ items: [], total: 0 }));
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, role]);

  async function toggleStatus(u: any) {
    await api.patch(`/admin/users/${u.id}`, { status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Assurés & utilisateurs ({data?.total ?? '…'})</h1>
        <select className="input w-auto" value={role} onChange={e => setRole(e.target.value)}>
          <option value="">Tous les rôles</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="input w-52" placeholder="Nom, email, n° assuré…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>＋ Utilisateur interne</button>
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead><tr><th className="th">Utilisateur</th><th className="th">Rôle</th><th className="th">N° assuré</th><th className="th">Inscrit le</th><th className="th">Statut</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((u: any) => (
                <tr key={u.id} className="cursor-pointer hover:bg-slate-50" onClick={() => api.get(`/admin/users/${u.id}`).then(setDetail)}>
                  <td className="td">
                    <p className="font-medium">{u.lastName} {u.firstName}</p>
                    <p className="text-xs text-slate-400">{u.email}{u.company ? ` · ${u.company.name}` : ''}</p>
                  </td>
                  <td className="td text-xs">{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td className="td text-xs">{u.memberNumber ?? '—'}</td>
                  <td className="td text-xs">{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td>
                  <td className="td">
                    <button onClick={e => { e.stopPropagation(); void toggleStatus(u); }} className={`badge ${statusStyle(u.status)} cursor-pointer`} title="Cliquer pour suspendre/réactiver">
                      {statusLabel(u.status)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Aucun utilisateur trouvé</p>}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Fiche utilisateur" wide>
        {detail && (
          <div className="text-sm space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <p><b>Nom :</b> {detail.lastName} {detail.firstName}</p>
              <p><b>Email :</b> {detail.email}</p>
              <p><b>Téléphone :</b> {detail.phone ?? '—'}</p>
              <p><b>Ville :</b> {detail.city ?? '—'}</p>
              <p><b>N° assuré :</b> {detail.memberNumber ?? '—'}</p>
              <p><b>Urgence :</b> {detail.emergencyContact ?? '—'}</p>
            </div>
            {detail.contractsAsPrincipal?.length > 0 && (
              <>
                <p className="label mt-3">Contrats</p>
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {detail.contractsAsPrincipal.map((c: any) => (
                    <li key={c.id} className="flex justify-between px-3 py-2 text-xs">
                      <span>{c.number} · {c.product.name}</span>
                      <span className={`badge ${statusStyle(c.status)}`}>{statusLabel(c.status)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {detail.claims?.length > 0 && (
              <>
                <p className="label mt-3">Dernières demandes</p>
                <ul className="text-xs text-slate-500 space-y-1">
                  {detail.claims.map((c: any) => <li key={c.id}>{c.reference} · {c.totalRequested.toLocaleString('fr-FR')} F · {statusLabel(c.status)}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
      </Modal>

      <CreateStaffModal open={createOpen} onClose={() => setCreateOpen(false)} onDone={load} />
    </div>
  );
}

function CreateStaffModal({ open, onClose, onDone }: any) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'INSURANCE_MANAGER' });
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal open={open} onClose={onClose} title="Créer un utilisateur interne">
      <ErrorBanner message={error} />
      <Field label="Rôle">
        <select className="input" value={form.role} onChange={e => setForm((f: any) => ({ ...f, role: e.target.value }))}>
          <option value="INSURANCE_MANAGER">{ROLE_LABELS.INSURANCE_MANAGER}</option>
          <option value="SUPPORT_AGENT">{ROLE_LABELS.SUPPORT_AGENT}</option>
          <option value="PROVIDER">{ROLE_LABELS.PROVIDER}</option>
          <option value="SUPER_ADMIN">{ROLE_LABELS.SUPER_ADMIN}</option>
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nom"><input className="input" value={form.lastName} onChange={e => setForm((f: any) => ({ ...f, lastName: e.target.value }))} /></Field>
        <Field label="Prénom"><input className="input" value={form.firstName} onChange={e => setForm((f: any) => ({ ...f, firstName: e.target.value }))} /></Field>
      </div>
      <Field label="Email"><input type="email" className="input" value={form.email} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} /></Field>
      <Field label="Mot de passe initial"><input className="input" value={form.password} onChange={e => setForm((f: any) => ({ ...f, password: e.target.value }))} placeholder="8 caractères min." /></Field>
      <button
        className="btn-primary w-full"
        onClick={async () => {
          try {
            await api.post('/admin/users', form);
            onDone();
            onClose();
          } catch (e: any) {
            setError(e?.message ?? 'Erreur');
          }
        }}
      >
        Créer
      </button>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fmtDateTime } from '../../format';
import { ErrorBanner, Field, Modal, Spinner, StatusBadge } from '../../components/ui';

export default function Staff() {
  const [items, setItems] = useState<any[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.get('/provider/staff').then(setItems).catch(e => { setError(e?.message); setItems([]); });
  useEffect(() => { load(); }, []);

  async function toggle(u: any) {
    await api.patch(`/provider/staff/${u.id}`, { status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' });
    load();
  }

  async function resetPassword(id: string, newPassword: string) {
    await api.patch(`/provider/staff/${id}`, { newPassword });
    setPasswordTarget(null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Personnel de l'établissement</h1>
        <button className="btn-primary btn-sm" onClick={() => setAddOpen(true)}>＋ Ajouter un membre</button>
      </div>
      <ErrorBanner message={error} />

      {!items ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr><th className="th">Membre</th><th className="th">Email</th><th className="th">Dernière connexion</th><th className="th">Statut</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(u => (
                <tr key={u.id}>
                  <td className="td font-medium">{u.lastName} {u.firstName}</td>
                  <td className="td text-xs">{u.email}</td>
                  <td className="td text-xs">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'jamais'}</td>
                  <td className="td"><StatusBadge status={u.status} /></td>
                  <td className="td text-right space-x-3 whitespace-nowrap">
                    <button onClick={() => setPasswordTarget(u)} className="text-xs text-brand-700 hover:underline">Mot de passe</button>
                    <button onClick={() => toggle(u)} className="text-xs text-red-600 hover:underline">{u.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddStaffModal open={addOpen} onClose={() => setAddOpen(false)} onDone={load} />
      <PasswordModal
        user={passwordTarget}
        onClose={() => setPasswordTarget(null)}
        onSave={password => resetPassword(passwordTarget.id, password)}
      />
    </div>
  );
}

function PasswordModal({ user, onClose, onSave }: { user: any | null; onClose: () => void; onSave: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setPassword('');
      setError(null);
    }
  }, [user]);

  const save = async () => {
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(password);
    } catch (err: any) {
      setError(err?.message ?? 'Mise à jour impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(user)} onClose={onClose} title={`Mot de passe — ${user?.firstName ?? ''} ${user?.lastName ?? ''}`}>
      <ErrorBanner message={error} />
      <Field label="Nouveau mot de passe">
        <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères min." />
      </Field>
      <button className="btn-primary w-full" disabled={busy || password.length < 8} onClick={save}>
        {busy ? 'Mise à jour…' : 'Mettre à jour'}
      </button>
    </Modal>
  );
}

function AddStaffModal({ open, onClose, onDone }: any) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', title: '' });
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un membre du personnel">
      <ErrorBanner message={error} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nom"><input className="input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></Field>
        <Field label="Prénom"><input className="input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></Field>
      </div>
      <Field label="Email professionnel"><input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
      <Field label="Fonction (optionnel)" error="Ex. : Médecin, Caissier, Facturation, Réception">
        <input className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      </Field>
      <Field label="Mot de passe initial"><input className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="8 caractères min." /></Field>
      <button
        className="btn-primary w-full"
        disabled={!form.firstName || !form.lastName || !form.email || form.password.length < 8}
        onClick={async () => {
          try {
            await api.post('/provider/staff', form);
            onDone();
            onClose();
          } catch (e: any) {
            setError(e?.message ?? 'Erreur');
          }
        }}
      >
        Créer le compte
      </button>
    </Modal>
  );
}

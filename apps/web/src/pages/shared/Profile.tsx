import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { ErrorBanner, Field, Spinner } from '../../components/ui';

export default function Profile() {
  const { me, refresh } = useAuth();
  const [form, setForm] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  useEffect(() => {
    if (me) {
      setForm({
        firstName: me.firstName,
        lastName: me.lastName,
        phone: me.phone ?? '',
        address: me.address ?? '',
        city: me.city ?? '',
        emergencyContact: me.emergencyContact ?? '',
      });
    }
  }, [me]);

  if (!form || !me) return <Spinner />;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-xl font-bold">Mon profil</h1>

      <div className="card-p">
        <div className="mb-4 grid grid-cols-2 gap-3 text-sm text-slate-500">
          <div><p className="label">Email</p>{me.email}</div>
          <div><p className="label">N° assuré</p>{me.memberNumber ?? '—'}</div>
        </div>
        <ErrorBanner message={error} />
        {msg && <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700">{msg}</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nom"><input className="input" value={form.lastName} onChange={e => setForm((f: any) => ({ ...f, lastName: e.target.value }))} /></Field>
          <Field label="Prénom(s)"><input className="input" value={form.firstName} onChange={e => setForm((f: any) => ({ ...f, firstName: e.target.value }))} /></Field>
        </div>
        <Field label="Téléphone"><input className="input" value={form.phone} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} /></Field>
        <Field label="Adresse"><input className="input" value={form.address} onChange={e => setForm((f: any) => ({ ...f, address: e.target.value }))} /></Field>
        <Field label="Ville"><input className="input" value={form.city} onChange={e => setForm((f: any) => ({ ...f, city: e.target.value }))} /></Field>
        <Field label="Contact d’urgence"><input className="input" placeholder="Nom + téléphone" value={form.emergencyContact} onChange={e => setForm((f: any) => ({ ...f, emergencyContact: e.target.value }))} /></Field>
        <button
          className="btn-primary"
          onClick={async () => {
            setMsg(null); setError(null);
            try {
              await api.patch('/users/me', form);
              await refresh();
              setMsg('Profil mis à jour.');
            } catch (e: any) {
              setError(e?.message ?? 'Erreur');
            }
          }}
        >
          Enregistrer
        </button>
      </div>

      <div className="card-p">
        <h2 className="font-semibold">Changer mon mot de passe</h2>
        {pwMsg && <p className="mt-2 text-sm text-emerald-600">{pwMsg}</p>}
        <Field label="Mot de passe actuel"><input type="password" className="input" value={pw.currentPassword} onChange={e => setPw((p: any) => ({ ...p, currentPassword: e.target.value }))} /></Field>
        <Field label="Nouveau mot de passe" error="8 caractères min., lettres et chiffres">
          <input type="password" className="input" value={pw.newPassword} onChange={e => setPw((p: any) => ({ ...p, newPassword: e.target.value }))} />
        </Field>
        <button
          className="btn-outline"
          onClick={async () => {
            setPwMsg(null);
            try {
              await api.post('/auth/password', pw);
              setPw({ currentPassword: '', newPassword: '' });
              setPwMsg('Mot de passe modifié.');
            } catch (e: any) {
              setPwMsg(e?.message ?? 'Erreur');
            }
          }}
        >
          Mettre à jour le mot de passe
        </button>
      </div>
    </div>
  );
}

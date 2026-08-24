import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { api } from '../api';
import { ErrorBanner, Field } from '../components/ui';

export default function Register() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', birthDate: '', gender: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f: any) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone || undefined,
        birthDate: form.birthDate || undefined,
        gender: form.gender || undefined,
        password: form.password,
      });
      await login(form.email, form.password);
      navigate('/app/souscrire');
    } catch (err: any) {
      const fieldErrors = err?.data?.errors?.fieldErrors;
      const first = fieldErrors ? Object.values(fieldErrors).flat().join(', ') : null;
      setError(first ?? err?.message ?? 'Inscription impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12">
      <h1 className="text-center text-2xl font-bold">Créer mon compte</h1>
      <p className="mt-1 text-center text-sm text-slate-500">Étape 1 sur votre parcours d’assurance santé</p>
      <form onSubmit={submit} className="card-p mt-6">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nom"><input className="input" required minLength={2} value={form.lastName} onChange={set('lastName')} /></Field>
          <Field label="Prénom(s)"><input className="input" required minLength={2} value={form.firstName} onChange={set('firstName')} /></Field>
        </div>
        <Field label="Email"><input className="input" type="email" required value={form.email} onChange={set('email')} placeholder="vous@exemple.bj" /></Field>
        <Field label="Téléphone"><input className="input" value={form.phone} onChange={set('phone')} placeholder="+229 96 00 00 00" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date de naissance"><input className="input" type="date" value={form.birthDate} onChange={set('birthDate')} /></Field>
          <Field label="Sexe">
            <select className="input" value={form.gender} onChange={set('gender')}>
              <option value="">—</option><option value="M">Masculin</option><option value="F">Féminin</option>
            </select>
          </Field>
        </div>
        <Field label="Mot de passe" error="8 caractères minimum, lettres et chiffres">
          <input className="input" type="password" required minLength={8} value={form.password} onChange={set('password')} />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Création…' : 'Créer mon compte'}</button>
        <p className="mt-4 text-center text-sm text-slate-500">
          Déjà inscrit ? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Se connecter</Link>
        </p>
      </form>
      <p className="mt-4 text-center text-xs text-slate-400">
        En créant un compte, vous acceptez le traitement de vos données conformément à la réglementation applicable.
      </p>
    </div>
  );
}

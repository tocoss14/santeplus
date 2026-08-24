import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorBanner, Field } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await login(email, password);
      const homes: Record<string, string> = {
        MEMBER: '/app',
        COMPANY_ADMIN: '/entreprise',
        SUPER_ADMIN: '/admin',
        INSURANCE_MANAGER: '/admin',
        SUPPORT_AGENT: '/admin/claims',
        PROVIDER: '/prestataire',
      };
      navigate(homes[me.role] ?? '/');
    } catch (err: any) {
      setError(err?.message ?? 'Connexion impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12">
      <h1 className="text-center text-2xl font-bold">Connexion</h1>
      <p className="mt-1 text-center text-sm text-slate-500">Accédez à votre espace santé</p>
      <form onSubmit={submit} className="card-p mt-6">
        <ErrorBanner message={error} />
        <Field label="Email"><input className="input" type="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus /></Field>
        <Field label="Mot de passe"><input className="input" type="password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        <p className="mt-4 text-center text-sm text-slate-500">
          Pas encore de compte ? <Link to="/register" className="font-semibold text-brand-700 hover:underline">Créer un compte</Link>
        </p>
      </form>
      <div className="mt-6 card-p bg-slate-50 border-dashed text-xs text-slate-500">
        <p className="font-semibold text-slate-600">Comptes de démonstration (Demo1234!) :</p>
        <p className="mt-1.5 leading-relaxed">
          jean@demo.bj (assuré) · entreprise@santeplus.bj (entreprise)<br />
          admin@santeplus.bj (admin) · gestionnaire@santeplus.bj · prestataire@santeplus.bj
        </p>
      </div>
    </div>
  );
}

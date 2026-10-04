import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { ErrorBanner, Field } from '../components/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // L'API répond toujours « envoyé » (que le compte existe ou non) : l'écran
      // de confirmation reste donc identique dans les deux cas, par construction.
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? 'Demande impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12">
      <h1 className="text-center text-2xl font-bold">Mot de passe oublié</h1>

      {sent ? (
        <>
          <div className="card-p mt-6 text-center">
            <p className="text-3xl" aria-hidden>📧</p>
            <h2 className="mt-2 text-lg font-semibold">Vérifiez votre boîte mail</h2>
            <p className="mt-2 text-sm text-slate-600">
              Si un compte <strong>{email.trim()}</strong> existe, vous allez recevoir un lien
              pour choisir un nouveau mot de passe. Il est valable 1 heure et ne fonctionne
              qu'une seule fois.
            </p>
            <p className="mt-3 text-sm text-slate-500">
              Rien reçu ? Vérifiez vos courriers indésirables, ou attendez quelques minutes
              avant de réessayer.
            </p>
          </div>
          <p className="mt-4 text-center text-sm text-slate-500">
            <Link to="/login" className="font-semibold text-brand-700 hover:underline">Retour à la connexion</Link>
          </p>
        </>
      ) : (
        <form onSubmit={submit} className="card-p mt-6">
          <p className="mb-4 text-sm text-slate-600">
            Indiquez l'email de votre compte : nous vous enverrons un lien de réinitialisation.
          </p>
          <ErrorBanner message={error} />
          <Field label="Email">
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              autoComplete="email"
            />
          </Field>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Envoi…' : 'Envoyer le lien'}
          </button>
          <p className="mt-4 text-center text-sm text-slate-500">
            <Link to="/login" className="font-semibold text-brand-700 hover:underline">Retour à la connexion</Link>
          </p>
        </form>
      )}
    </div>
  );
}
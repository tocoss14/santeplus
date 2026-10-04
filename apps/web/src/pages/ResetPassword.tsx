import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorBanner, Field, PasswordChecklist, Spinner } from '../components/ui';

type State = 'checking' | 'valid' | 'invalid' | 'done';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setState('invalid');
      return;
    }
    setState('checking');
    api
      .get(`/auth/reset-password/${encodeURIComponent(token)}`)
      .then(r => !cancelled && setState(r?.valid ? 'valid' : 'invalid'))
      .catch(() => !cancelled && setState('invalid'));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setState('done');
    } catch (err: any) {
      setError(err?.message ?? 'Réinitialisation impossible. Demandez un nouveau lien.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12">
      <h1 className="text-center text-2xl font-bold">Nouveau mot de passe</h1>

      {state === 'checking' && (
        <div className="card-p mt-6 flex justify-center"><Spinner /></div>
      )}

      {state === 'invalid' && (
        <div className="card-p mt-6 text-center">
          <p className="text-3xl" aria-hidden>⏳</p>
          <h2 className="mt-2 text-lg font-semibold">Lien invalide ou expiré</h2>
          <p className="mt-2 text-sm text-slate-600">
            Ce lien a été utilisé, expiré, ou n'a jamais existé. Demandez-en un nouveau
            pour continuer.
          </p>
          <Link to="/mot-de-passe-oublie" className="btn-primary mt-4 inline-block">
            Demander un nouveau lien
          </Link>
        </div>
      )}

      {state === 'done' && (
        <div className="card-p mt-6 text-center">
          <p className="text-3xl" aria-hidden>✅</p>
          <h2 className="mt-2 text-lg font-semibold">Mot de passe modifié</h2>
          <p className="mt-2 text-sm text-slate-600">
            Votre mot de passe a été mis à jour. Vos autres sessions ont été déconnectées
            par sécurité — reconnectez-vous avec votre nouveau mot de passe.
          </p>
          <Link to="/login" className="btn-primary mt-4 inline-block">Se connecter</Link>
        </div>
      )}

      {state === 'valid' && (
        <form onSubmit={submit} className="card-p mt-6">
          <p className="mb-4 text-sm text-slate-600">Choisissez votre nouveau mot de passe.</p>
          <ErrorBanner message={error} />
          <Field label="Nouveau mot de passe" below={<PasswordChecklist password={password} />}>
            <input
              className="input"
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              autoComplete="new-password"
            />
          </Field>
          <Field
            label="Confirmer le mot de passe"
            error={confirm && confirm !== password ? 'Les deux mots de passe ne correspondent pas' : undefined}
          >
            <input
              className="input"
              type="password"
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <button className="btn-primary w-full" disabled={busy || password !== confirm}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}
    </div>
  );
}
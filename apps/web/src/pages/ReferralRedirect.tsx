import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';

export default function ReferralRedirect() {
  const { code } = useParams<{ code: string }>();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!code) return;
    // Store referral code in localStorage for registration
    localStorage.setItem('sp_referral', code.toUpperCase());
    // Look up the distributor info
    api.get(`/distributors/lookup/${code.toUpperCase()}`)
      .then(setInfo)
      .catch(() => setError(true));
  }, [code]);

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <p className="text-5xl">🔗</p>
        <h1 className="mt-4 font-display text-2xl font-bold">Lien de parrainage invalide</h1>
        <p className="mt-2 text-sm text-stone">Ce code de parrainage n'est pas actif ou a expiré.</p>
        <Link to="/register" className="btn-primary mt-6 inline-block rounded-full">Créer mon compte</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <div className="card-wax rounded-[24px] p-8">
        <p className="text-5xl">🤝</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">
          {info
            ? `Vous êtes parrainé par ${info.user.firstName} ${info.user.lastName}`
            : 'Activation de votre lien de parrainage…'}
        </h1>
        {info && (
          <p className="mt-2 text-sm text-stone">
            {info.level === 'COMMERCIAL' ? 'Commercial' : info.level === 'DISTRIBUTOR' ? 'Distributeur' : 'Ambassadeur'}
            {info.territory ? ` · ${info.territory}` : ''}
          </p>
        )}
        <p className="mt-4 text-sm leading-relaxed text-stone">
          Votre code de parrainage <span className="font-mono font-bold text-ink">{code?.toUpperCase()}</span> a été enregistré.
          Créez votre compte et souscrivez pour que votre parrain soit crédité.
        </p>
        <Link
          to="/register"
          className="btn-primary mt-6 inline-block w-full rounded-full"
        >
          Créer mon compte maintenant →
        </Link>
        <p className="mt-3 text-xs text-stone">
          Déjà inscrit ? <Link to="/login" className="font-bold text-brand-700 hover:underline">Se connecter</Link>
        </p>
      </div>
    </div>
  );
}

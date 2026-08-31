import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { ErrorBanner, Field } from '../components/ui';

export default function RegisterCompany() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    companyName: '',
    sector: '',
    city: '',
    address: '',
    phone: '',
    contactName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f: any) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) return setError('Veuillez accepter la politique de confidentialité');
    setBusy(true);
    setError(null);
    try {
      await api.post('/companies/register', {
        companyName: form.companyName,
        sector: form.sector || undefined,
        city: form.city || undefined,
        address: form.address || undefined,
        phone: form.phone || undefined,
        contactName: form.contactName || undefined,
        email: form.email,
        password: form.password,
      });
      await login(form.email, form.password);
      navigate('/entreprise');
    } catch (err: any) {
      const fieldErrors = err?.data?.errors?.fieldErrors;
      const first = fieldErrors ? Object.values(fieldErrors).flat().join(', ') : null;
      setError(first ?? err?.message ?? 'Création impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 py-10">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold">Créer mon espace entreprise</h1>
        <p className="mt-2 text-sm text-slate-500">Gérez la couverture santé de vos salariés en quelques minutes</p>
      </div>
      <form onSubmit={submit} className="card-p mt-6 space-y-4">
        <ErrorBanner message={error} />

        <div className="rounded-xl bg-ink px-4 py-3 text-white">
          <p className="text-sm font-semibold">🏢 Informations de l'entreprise</p>
          <p className="text-xs text-white/60">Ces informations figureront sur votre contrat collectif</p>
        </div>

        <Field label="Nom de l'entreprise *"><input className="input" required minLength={2} value={form.companyName} onChange={set('companyName')} placeholder="Ex: SOTRABEN SARL" autoFocus /></Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Secteur d'activité">
            <select className="input" value={form.sector} onChange={set('sector')}>
              <option value="">— Sélectionner —</option>
              <option value="BTP">BTP</option>
              <option value="Commerce">Commerce</option>
              <option value="Industrie">Industrie</option>
              <option value="Services">Services</option>
              <option value="Transport">Transport</option>
              <option value="Autre">Autre</option>
            </select>
          </Field>
          <Field label="Ville"><input className="input" value={form.city} onChange={set('city')} placeholder="Ex: Cotonou" /></Field>
        </div>

        <Field label="Adresse"><input className="input" value={form.address} onChange={set('address')} placeholder="Ex: Zone industrielle, Akpakpa" /></Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone entreprise"><input className="input" value={form.phone} onChange={set('phone')} placeholder="+229 01 00 00 00" /></Field>
          <Field label="Nom du contact RH *"><input className="input" value={form.contactName} onChange={set('contactName')} placeholder="Ex: Jean AHOUANDJINOU" /></Field>
        </div>

        <div className="rounded-xl bg-sand px-4 py-3">
          <p className="text-sm font-semibold text-ink">👤 Compte administrateur</p>
          <p className="text-xs text-stone">Vous recevrez vos accès à cette adresse</p>
        </div>

        <Field label="Email administrateur *"><input className="input" type="email" required value={form.email} onChange={set('email')} placeholder="rh@entreprise.bj" /></Field>
        <Field label="Mot de passe *" error="8 caractères minimum, lettres et chiffres">
          <input className="input" type="password" required minLength={8} value={form.password} onChange={set('password')} placeholder="••••••••" />
        </Field>

        <label className="flex gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5" required />
          <span>J’accepte la <Link to="/cga" className="font-semibold text-brand-700 hover:underline">politique de confidentialité</Link> et le traitement des données entreprise (RGPD). <span className="text-red-600">*</span></span>
        </label>

        <button className="btn-primary w-full" disabled={busy || !consent}>{busy ? 'Création…' : "Créer mon espace entreprise"}</button>

        <p className="text-center text-sm text-slate-500">
          Déjà un espace ? <Link to="/login" className="font-semibold text-brand-700 hover:underline">Se connecter</Link>
          <span className="mx-2 text-slate-300">·</span>
          Particulier ? <Link to="/register" className="font-semibold text-ink hover:underline">Créer un compte personnel</Link>
        </p>
      </form>
      <p className="mt-4 text-center text-xs text-slate-400">
        En créant un compte entreprise, vous pourrez importer vos salariés par Excel/CSV et souscrire un contrat collectif.
      </p>
    </div>
  );
}

import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { api, fileUrl } from '../api';
import { ErrorBanner, Field } from '../components/ui';

export default function Register() {
  const { register, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', birthDate: '', gender: '', password: '' });
  const [referralCode, setReferralCode] = useState(() => localStorage.getItem('sp_referral') || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f: any) => ({ ...f, [k]: e.target.value }));

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

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
        referralCode: referralCode || undefined,
      });
      await login(form.email, form.password);
      // Clear referral code from localStorage after successful registration
      localStorage.removeItem('sp_referral');
      // Upload photo si sélectionnée
      if (photoFile) {
        const fd = new FormData();
        fd.append('photo', photoFile);
        await api.post('/users/me/photo', fd);
      }
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

        {!referralCode && (
          <Field label="Code de parrainage (optionnel)">
            <input
              className="input"
              placeholder="Ex: ABC123"
              value={referralCode}
              onChange={e => setReferralCode(e.target.value.toUpperCase())}
              maxLength={20}
            />
          </Field>
        )}

        <div className="mb-3.5">
          <label className="label">Photo d'identité (pour votre carte d'assuré)</label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-slate-50 text-sm text-slate-400 hover:border-brand-400 hover:bg-brand-50 transition"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Aperçu" className="h-full w-full rounded-full object-cover" />
              ) : (
                <span className="text-center text-xs leading-tight">📸<br />Photo</span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhoto} />
            <div className="text-xs text-slate-400 space-y-1">
              <p>Photo carrée recommandée (format carte).</p>
              <p>JPG, PNG ou WebP — max 5 Mo.</p>
              {photoPreview && (
                <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="text-red-500 hover:underline">Retirer</button>
              )}
            </div>
          </div>
        </div>

        {referralCode && (
          <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm">
            🤝 Parrainé par le code <span className="font-mono font-bold text-brand-700">{referralCode}</span>
            <button type="button" onClick={() => { setReferralCode(''); localStorage.removeItem('sp_referral'); }} className="ml-2 text-xs text-stone hover:text-red-500">✕ Retirer</button>
          </div>
        )}
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

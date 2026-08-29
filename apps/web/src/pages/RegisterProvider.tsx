import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PROVIDER_TYPES } from '../format';
import { ErrorBanner, Field, Spinner } from '../components/ui';

export default function RegisterProvider() {
  const [form, setForm] = useState({
    name: '', type: 'CLINIC', city: '', address: '', phone: '', email: '',
    specialties: '', openingHours: 'Lun-Sam 8h-18h', services: '',
    contactFirstName: '', contactLastName: '', contactPhone: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const submit = async () => {
    if (!form.name || !form.city || !form.email || !form.contactFirstName || !form.contactLastName || !form.contactPhone) {
      return setError('Veuillez remplir tous les champs obligatoires');
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/providers/register', form);
      setSuccess(true);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? "Erreur lors de l'inscription");
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="text-5xl">✅</div>
        <h1 className="mt-4 text-2xl font-bold text-emerald-700">Inscription reçue !</h1>
        <p className="mt-2 text-slate-600">
          Votre demande d'inscription a été envoyée à notre équipe.
          Vous recevrez une notification une fois votre compte validé.
        </p>
        <Link to="/" className="btn-primary mt-6 inline-block">Retour à l'accueil</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold">Inscription prestataire</h1>
        <p className="mt-2 text-slate-500">
          Rejoignez le réseau SantéPlus Bénin. Créez votre établissement et accédez au tiers payant.
        </p>
      </div>

      <ErrorBanner message={error} />

      <div className="space-y-6">
        {/* Informations de l'établissement */}
        <div className="card-p space-y-4">
          <h2 className="font-semibold text-slate-800">🏥 Informations de l'établissement</h2>

          <Field label="Nom de l'établissement *">
            <input className="input" value={form.name} onChange={e => update({ name: e.target.value })} placeholder="Ex: Clinique Saint-Jean" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Type *">
              <select className="input" value={form.type} onChange={e => update({ type: e.target.value })}>
                {Object.entries(PROVIDER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Ville *">
              <input className="input" value={form.city} onChange={e => update({ city: e.target.value })} placeholder="Ex: Cotonou" />
            </Field>
          </div>

          <Field label="Adresse">
            <input className="input" value={form.address} onChange={e => update({ address: e.target.value })} placeholder="Ex: Quartier Haie Vive, rue 12.068" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Téléphone établissement">
              <input className="input" value={form.phone} onChange={e => update({ phone: e.target.value })} placeholder="+229 XX XX XX XX" />
            </Field>
            <Field label="Email établissement *">
              <input className="input" type="email" value={form.email} onChange={e => update({ email: e.target.value })} placeholder="contact@clinique.bj" />
            </Field>
          </div>

          <Field label="Spécialités (séparées par virgule)">
            <input className="input" value={form.specialties} onChange={e => update({ specialties: e.target.value })} placeholder="Ex: Cardiologie, Pédiatrie, Médecine générale" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Horaires d'ouverture">
              <input className="input" value={form.openingHours} onChange={e => update({ openingHours: e.target.value })} />
            </Field>
            <Field label="Services proposés">
              <input className="input" value={form.services} onChange={e => update({ services: e.target.value })} placeholder="Ex: Consultations, Hospitalisation, Laboratoire" />
            </Field>
          </div>
        </div>

        {/* Contact principal */}
        <div className="card-p space-y-4">
          <h2 className="font-semibold text-slate-800">👤 Contact principal</h2>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prénom *">
              <input className="input" value={form.contactFirstName} onChange={e => update({ contactFirstName: e.target.value })} />
            </Field>
            <Field label="Nom *">
              <input className="input" value={form.contactLastName} onChange={e => update({ contactLastName: e.target.value })} />
            </Field>
          </div>

          <Field label="Téléphone du contact *">
            <input className="input" value={form.contactPhone} onChange={e => update({ contactPhone: e.target.value })} placeholder="+229 XX XX XX XX" />
          </Field>
        </div>

        {/* Notes */}
        <div className="card-p space-y-4">
          <h2 className="font-semibold text-slate-800">📝 Informations complémentaires</h2>
          <Field label="Notes (optionnel)">
            <textarea className="input min-h-[80px]" value={form.notes} onChange={e => update({ notes: e.target.value })} placeholder="Convention en cours, documents à transmettre, etc." />
          </Field>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link to="/" className="btn-outline flex-1 text-center">Annuler</Link>
          <button className="btn-primary flex-[2]" disabled={busy} onClick={submit}>
            {busy ? <><Spinner /> Inscription…</> : "Envoyer mon inscription"}
          </button>
        </div>

        <p className="text-xs text-center text-slate-400">
          En soumettant ce formulaire, vous acceptez les conditions d'utilisation de SantéPlus Bénin.
          Votre compte sera validé par notre équipe avant activation.
        </p>
      </div>
    </div>
  );
}

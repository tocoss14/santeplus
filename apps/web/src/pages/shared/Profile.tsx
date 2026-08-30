import { useEffect, useRef, useState } from 'react';
import { api, fileUrl } from '../../api';
import { useAuth } from '../../auth';
import { ErrorBanner, Field, Spinner } from '../../components/ui';

export default function Profile() {
  const { me, refresh } = useAuth();
  const [form, setForm] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Charger la photo existante
  useEffect(() => {
    api.get<{ fileId: string | null }>('/users/me/photo').then(r => {
      if (r.fileId) setPhotoPreview(fileUrl(r.fileId));
    }).catch(() => {});
  }, []);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function uploadPhoto() {
    if (!photoFile) return;
    const fd = new FormData();
    fd.append('photo', photoFile);
    await api.post('/users/me/photo', fd);
    setPhotoFile(null);
  }

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
        {/* Photo d'identité */}
        <div className="mb-5 flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-brand-400 hover:bg-brand-50 transition"
          >
            {photoPreview ? (
              <img src={photoPreview} alt="Photo" className="h-full w-full rounded-full object-cover" />
            ) : (
              <span className="text-center text-xs leading-tight">📸<br />Photo</span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhoto} />
          <div>
            <p className="text-sm font-medium text-slate-700">Photo d'identité</p>
            <p className="text-xs text-slate-400">Apparaît sur votre carte d'assuré</p>
            {photoFile && (
              <button
                className="mt-1 text-xs text-brand-600 hover:underline"
                onClick={async () => {
                  try {
                    await uploadPhoto();
                    setMsg('Photo mise à jour.');
                  } catch (e: any) {
                    setError(e?.message ?? 'Erreur upload');
                  }
                }}
              >
                💾 Enregistrer la photo
              </button>
            )}
          </div>
        </div>

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
              if (photoFile) await uploadPhoto();
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

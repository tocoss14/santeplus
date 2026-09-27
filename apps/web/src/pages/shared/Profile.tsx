import { useEffect, useRef, useState } from 'react';
import { api, fileUrl } from '../../api';
import { useAuth } from '../../auth';
import { isPasswordValid } from '../../lib/password';
import { ErrorBanner, Field, PasswordChecklist, PhotoImg, Spinner } from '../../components/ui';

/** Comparaison tolérante (casse/accents) — même normalisation que l'API. */
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

interface ActeField { field: string; label: string; acte: string; compte: string | null }
interface ActeDiff {
  acte: { fileId: string; documentNumber: string | null; birthPlace: string | null } | null;
  verified: boolean;
  fields: ActeField[];
  aligned: boolean;
}

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
  // Comparatif acte de naissance ↔ compte (OCR) : l'assuré peut aligner son
  // compte sur son acte — c'est exactement ce que compare la vérification.
  const [acteDiff, setActeDiff] = useState<ActeDiff | null>(null);
  const [acteLoading, setActeLoading] = useState(true);
  const [acteMsg, setActeMsg] = useState<string | null>(null);
  const [acteUploading, setActeUploading] = useState(false);
  const acteFileRef = useRef<HTMLInputElement>(null);

  // Charger la photo existante
  useEffect(() => {
    api.get<{ fileId: string | null }>('/users/me/photo').then(r => {
      if (r.fileId) setPhotoPreview(fileUrl(r.fileId));
    }).catch(() => {});
  }, []);

  // Comparatif acte ↔ compte : { acte: null } tant qu'aucun acte valide n'est connu.
  useEffect(() => {
    setActeLoading(true);
    api.get<ActeDiff>('/subscription/birth-certificate/profile-diff')
      .then(setActeDiff)
      .catch(() => setActeDiff(null))
      .finally(() => setActeLoading(false));
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

  /** Aligne Prénom/Nom/Date de naissance du compte sur l'acte (les seuls champs comparables). */
  async function alignWithActe() {
    if (!acteDiff?.fields.length) return;
    setError(null); setMsg(null); setActeMsg(null);
    const find = (field: string) => acteDiff.fields.find(f => f.field === field)?.acte;
    const patch: any = { firstName: find('firstName'), lastName: find('lastName') };
    const birthDate = find('birthDate');
    if (birthDate) patch.birthDate = birthDate; // ISO yyyy-mm-dd
    try {
      await api.patch('/users/me', patch);
      await refresh();
      setMsg('Profil aligné sur votre acte de naissance.');
      setActeDiff(await api.get<ActeDiff>('/subscription/birth-certificate/profile-diff'));
    } catch (e: any) {
      setError(e?.message ?? 'Erreur');
    }
  }

  /** Téléverse l'acte depuis le profil : upload → extraction OCR → comparatif. */
  async function uploadActe(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de retéléverser le même fichier
    if (!file) return;
    setActeMsg(null); setError(null); setActeUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { fileId } = await api.post<{ fileId: string }>('/subscription/birth-certificate/upload', fd);
      // Extraction best effort : { extracted: null } = rien d'exploitable, jamais bloquant.
      const ex = await api.post<{ extracted: unknown | null }>('/subscription/birth-certificate/extract', { fileId });
      const diff = await api.get<ActeDiff>('/subscription/birth-certificate/profile-diff');
      setActeDiff(diff);
      setActeMsg(diff.acte ? null : ex.extracted ? null : 'Acte enregistré, mais l’extraction n’a rien trouvé d’exploitable — réessayez avec un document plus lisible.');
    } catch (err: any) {
      setActeMsg(err?.message ?? 'Erreur lors du téléversement');
    } finally {
      setActeUploading(false);
    }
  }

  useEffect(() => {
    if (me) {
      setForm({
        firstName: me.firstName,
        lastName: me.lastName,
        birthDate: me.birthDate?.slice(0, 10) ?? '',
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
              <PhotoImg src={photoPreview} alt="Photo" className="h-full w-full rounded-full object-cover" />
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
        <Field label="Date de naissance"><input type="date" className="input" value={form.birthDate} onChange={e => setForm((f: any) => ({ ...f, birthDate: e.target.value }))} /></Field>
        <Field label="Téléphone"><input className="input" value={form.phone} onChange={e => setForm((f: any) => ({ ...f, phone: e.target.value }))} /></Field>
        <Field label="Adresse"><input className="input" value={form.address} onChange={e => setForm((f: any) => ({ ...f, address: e.target.value }))} /></Field>
        <Field label="Ville"><input className="input" value={form.city} onChange={e => setForm((f: any) => ({ ...f, city: e.target.value }))} /></Field>
        <Field label="Contact d’urgence"><input className="input" placeholder="Nom + téléphone" value={form.emergencyContact} onChange={e => setForm((f: any) => ({ ...f, emergencyContact: e.target.value }))} /></Field>
        <button
          className="btn-primary"
          onClick={async () => {
            setMsg(null); setError(null);
            try {
              const payload: any = { ...form };
              if (!payload.birthDate) delete payload.birthDate; // champ vide = non modifié
              await api.patch('/users/me', payload);
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
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Acte de naissance</h2>
          {acteDiff?.acte && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${acteDiff.verified ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              {acteDiff.verified ? 'Vérifié' : 'Non vérifié'}
            </span>
          )}
        </div>
        {acteLoading ? (
          <Spinner />
        ) : !acteDiff?.acte ? (
          <div>
            <p className="text-sm text-slate-500">
              Téléversez votre acte de naissance : nous lisons automatiquement vos
              informations (OCR) et vous proposons de les aligner sur votre compte,
              pour qu'elles correspondent à celles de votre acte.
            </p>
            <input ref={acteFileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={uploadActe} />
            <button type="button" className="btn-outline mt-3" disabled={acteUploading} onClick={() => acteFileRef.current?.click()}>
              {acteUploading ? 'Lecture du document…' : '📄 Téléverser mon acte de naissance'}
            </button>
            {acteMsg && <p className="mt-2 text-sm text-amber-700">{acteMsg}</p>}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {(acteDiff.acte.documentNumber || acteDiff.acte.birthPlace) && (
              <p className="text-xs text-slate-400">
                {acteDiff.acte.documentNumber && <>N° acte {acteDiff.acte.documentNumber}</>}
                {acteDiff.acte.documentNumber && acteDiff.acte.birthPlace && ' — '}
                {acteDiff.acte.birthPlace && <>né(e) à {acteDiff.acte.birthPlace}</>}
              </p>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="py-1 font-medium">Champ</th>
                  <th className="font-medium">Acte de naissance</th>
                  <th className="font-medium">Mon compte</th>
                </tr>
              </thead>
              <tbody>
                {acteDiff.fields.map(f => {
                  const ok = f.field === 'birthDate' ? f.acte === f.compte : f.compte != null && norm(f.acte) === norm(f.compte);
                  return (
                    <tr key={f.field} className="border-t border-slate-100">
                      <td className="py-1.5 text-slate-500">{f.label}</td>
                      <td className="font-medium text-slate-800">{f.acte}</td>
                      <td className={ok ? 'text-slate-600' : 'font-medium text-amber-700'}>{f.compte ?? '—'}{!ok && ' ⚠️'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {acteDiff.aligned ? (
              <p className="text-sm text-emerald-700">✓ Votre compte correspond à votre acte de naissance.</p>
            ) : (
              <button type="button" className="btn-primary" onClick={alignWithActe}>✅ Aligner mon compte sur mon acte</button>
            )}
            {acteMsg && <p className="text-sm text-amber-700">{acteMsg}</p>}
          </div>
        )}
      </div>

      <div className="card-p">
        <h2 className="font-semibold">Changer mon mot de passe</h2>
        {pwMsg && <p className="mt-2 text-sm text-emerald-600">{pwMsg}</p>}
        <Field label="Mot de passe actuel"><input type="password" className="input" value={pw.currentPassword} onChange={e => setPw((p: any) => ({ ...p, currentPassword: e.target.value }))} /></Field>
        <Field
          label="Nouveau mot de passe"
          below={<PasswordChecklist password={pw.newPassword} />}
        >
          <input type="password" className="input" value={pw.newPassword} onChange={e => setPw((p: any) => ({ ...p, newPassword: e.target.value }))} />
        </Field>
        <button
          className="btn-outline"
          onClick={async () => {
            setPwMsg(null);
            if (!isPasswordValid(pw.newPassword)) {
              setPwMsg('Le mot de passe doit contenir au moins 8 caractères, une lettre et un chiffre.');
              return;
            }
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

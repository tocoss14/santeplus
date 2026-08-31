import { useEffect, useRef, useState } from 'react';
import { api, fileUrl } from '../../api';
import { ErrorBanner, Field, Spinner } from '../../components/ui';
import { PROVIDER_TYPES } from '../../format';

export default function Establishment() {
  const [me, setMe] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get('/provider/me').then((d: any) => {
      setMe(d);
      setForm({
        address: d.establishment.address ?? '',
        phone: d.establishment.phone ?? '',
        email: d.establishment.email ?? '',
        openingHours: d.establishment.openingHours ?? '',
        specialties: d.establishment.specialties ?? '',
        services: d.establishment.services ?? '',
      });
      if (d.establishment.photoUrl) {
        const url = d.establishment.photoUrl.startsWith('/api/') ? fileUrl(d.establishment.photoUrl.split('/')[3] ?? '') : d.establishment.photoUrl;
        // photoUrl may be /api/files/xxx/view or external
        setPhotoPreview(d.establishment.photoUrl.startsWith('http') ? d.establishment.photoUrl : d.establishment.photoUrl);
      }
    }).catch(e => setError(e?.message));
  }, []);

  if (!form || !me) return <Spinner />;

  const e = me.establishment;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-bold">Mon établissement</h1>

      <div className="card-p">
        <div className="flex gap-4">
          <div className="shrink-0">
            <div className="h-24 w-24 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {photoPreview ? <img src={photoPreview} alt={e.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-2xl">🏥</div>}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async ev => {
              const file = ev.target.files?.[0];
              if (!file) return;
              setPhotoPreview(URL.createObjectURL(file));
              const fd = new FormData();
              fd.append('photo', file);
              try {
                const res: any = await api.post('/provider/me/photo', fd);
                setMsg('Photo mise à jour');
                setMe((m: any) => ({ ...m, establishment: { ...m.establishment, photoUrl: res.photoUrl } }));
                setPhotoPreview(res.photoUrl.startsWith('http') ? res.photoUrl : res.photoUrl);
              } catch (err: any) { setError(err?.message ?? 'Upload échoué'); }
            }} />
            <button className="btn-outline btn-sm mt-2 w-full" onClick={() => fileRef.current?.click()}>Changer photo</button>
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-lg">{e.name}</h2>
              <span className="badge bg-slate-100">{PROVIDER_TYPES[e.type] ?? e.type}</span>
              <span className="badge bg-brand-100 text-brand-800">Convention {e.conventionLevel}</span>
              {e.thirdPartyPayer && <span className="badge bg-emerald-100 text-emerald-700">Tiers payant</span>}
            </div>
            <p className="mt-1 text-sm text-slate-500">{e.city} · {e.address}</p>
            <p className="mt-1 text-xs text-slate-400">Photo visible sur le réseau public — JPG/PNG/WebP, max 8 Mo</p>
          </div>
        </div>
      </div>

      <div className="card-p">
        <h2 className="font-semibold mb-3">Informations modifiables</h2>
        <ErrorBanner message={error} />
        {msg && <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700">{msg}</div>}
        <Field label="Adresse"><input className="input" value={form.address} onChange={ev => setForm((f: any) => ({ ...f, address: ev.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Téléphone"><input className="input" value={form.phone} onChange={ev => setForm((f: any) => ({ ...f, phone: ev.target.value }))} /></Field>
          <Field label="Email"><input type="email" className="input" value={form.email} onChange={ev => setForm((f: any) => ({ ...f, email: ev.target.value }))} /></Field>
        </div>
        <Field label="Horaires"><input className="input" value={form.openingHours} onChange={ev => setForm((f: any) => ({ ...f, openingHours: ev.target.value }))} placeholder="Lun-Sam 8h-18h" /></Field>
        <Field label="Spécialités"><input className="input" value={form.specialties} onChange={ev => setForm((f: any) => ({ ...f, specialties: ev.target.value }))} /></Field>
        <Field label="Services"><input className="input" value={form.services} onChange={ev => setForm((f: any) => ({ ...f, services: ev.target.value }))} /></Field>
        <button
          className="btn-primary"
          onClick={async () => {
            setMsg(null); setError(null);
            try {
              await api.patch('/provider/me/establishment', form);
              setMsg('Informations mises à jour.');
            } catch (err: any) {
              setError(err?.message ?? 'Erreur');
            }
          }}
        >
          Enregistrer
        </button>
        <p className="mt-3 text-xs text-slate-400">
          Le nom, le type et le statut de l'établissement sont gérés par la plateforme (validation requise).
        </p>
      </div>
    </div>
  );
}

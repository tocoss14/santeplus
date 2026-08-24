import { useEffect, useState } from 'react';
import { api } from '../../api';
import { PROVIDER_TYPES } from '../../format';
import { Badge, ErrorBanner, Field, Modal, Spinner } from '../../components/ui';

const EMPTY = {
  name: '', type: 'PHARMACY', city: '', address: '', phone: '', specialties: '',
  openingHours: 'Lun-Sam 8h-18h', services: '', conventionLevel: 'BASIC',
  thirdPartyPayer: false, active: true,
};

export default function AdminProviders() {
  const [items, setItems] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<any | null>(null);

  const load = () => {
    api.get(`/admin/providers${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setItems).catch(() => setItems([]));
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Réseau de soins ({items?.length ?? '…'})</h1>
        <input className="input w-52" placeholder="Rechercher…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn-primary btn-sm" onClick={() => setEditing({ ...EMPTY })}>＋ Prestataire</button>
      </div>

      {!items ? (
        <Spinner />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map(p => (
            <li key={p.id} className={`card-p ${!p.active ? 'opacity-50' : ''}`}>
              <div className="flex justify-between gap-2">
                <p className="font-semibold">{p.name}</p>
                <Badge tone={p.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}>{p.active ? 'Actif' : 'Inactif'}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">{PROVIDER_TYPES[p.type]} · {p.city}</p>
              <p className="text-xs text-slate-500 truncate">{p.address}</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                {p.thirdPartyPayer && <Badge tone="bg-brand-100 text-brand-800">Tiers payant</Badge>}
                <Badge>Conv. {p.conventionLevel}</Badge>
              </div>
              <button
                className="btn-outline btn-sm mt-3 w-full"
                onClick={() => setEditing({ ...EMPTY, ...p, thirdPartyPayer: p.thirdPartyPayer, active: p.active })}
              >
                ✏️ Modifier
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? `Modifier ${editing.name}` : 'Nouveau prestataire'}>
          <ErrorBanner message={null} />
          <Field label="Nom"><input className="input" value={editing.name} onChange={e => setEditing((f: any) => ({ ...f, name: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select className="input" value={editing.type} onChange={e => setEditing((f: any) => ({ ...f, type: e.target.value }))}>
                {Object.entries(PROVIDER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Ville"><input className="input" value={editing.city} onChange={e => setEditing((f: any) => ({ ...f, city: e.target.value }))} /></Field>
          </div>
          <Field label="Adresse"><input className="input" value={editing.address} onChange={e => setEditing((f: any) => ({ ...f, address: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Téléphone"><input className="input" value={editing.phone} onChange={e => setEditing((f: any) => ({ ...f, phone: e.target.value }))} /></Field>
            <Field label="Horaires"><input className="input" value={editing.openingHours} onChange={e => setEditing((f: any) => ({ ...f, openingHours: e.target.value }))} /></Field>
          </div>
          <Field label="Spécialités (séparées par virgule)"><input className="input" value={editing.specialties} onChange={e => setEditing((f: any) => ({ ...f, specialties: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Niveau de convention">
              <select className="input" value={editing.conventionLevel} onChange={e => setEditing((f: any) => ({ ...f, conventionLevel: e.target.value }))}>
                <option value="BASIC">Basique</option><option value="PLUS">Plus</option><option value="PREMIUM">Premium</option>
              </select>
            </Field>
            <label className="flex items-end gap-2 pb-3.5 text-sm">
              <input type="checkbox" checked={editing.thirdPartyPayer} onChange={e => setEditing((f: any) => ({ ...f, thirdPartyPayer: e.target.checked }))} />
              Tiers payant actif
            </label>
          </div>
          <button
            className="btn-primary w-full mt-2"
            disabled={!editing.name || !editing.city}
            onClick={async () => {
              const payload = {
                name: editing.name, type: editing.type, city: editing.city,
                address: editing.address || undefined, phone: editing.phone || undefined,
                specialties: editing.specialties || undefined, openingHours: editing.openingHours || undefined,
                conventionLevel: editing.conventionLevel, thirdPartyPayer: editing.thirdPartyPayer,
                active: editing.active,
              };
              if (editing.id) await api.patch(`/admin/providers/${editing.id}`, payload);
              else await api.post('/admin/providers', payload);
              setEditing(null);
              load();
            }}
          >
            Enregistrer
          </button>
        </Modal>
      )}
    </div>
  );
}

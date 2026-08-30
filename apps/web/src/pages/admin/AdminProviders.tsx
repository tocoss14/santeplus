import { useEffect, useState } from 'react';
import { api } from '../../api';
import { PROVIDER_TYPES } from '../../format';
import { Badge, ErrorBanner, Field, Modal, Spinner } from '../../components/ui';
import Pagination from '../../components/Pagination';
import BulkProviderImport from '../../components/BulkProviderImport';
import { printReport, exportCsv } from '../../printReport';

const EMPTY = {
  name: '', type: 'PHARMACY', city: '', address: '', phone: '', specialties: '',
  openingHours: 'Lun-Sam 8h-18h', services: '', conventionLevel: 'BASIC',
  thirdPartyPayer: false, active: true,
};

export default function AdminProviders() {
  const [data, setData] = useState<any>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<any | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [tab, setTab] = useState<'all' | 'pending'>('all');

  const items = data?.items ?? null;

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('page', String(page));
    api.get(`/admin/providers?${params}`).then(setData).catch(() => setData({ items: [], total: 0 }));
    api.get('/admin/providers/registrations').then(setPending).catch(() => setPending([]));
  };

  useEffect(() => { setPage(1); }, [q]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, page]);

  const approveRegistration = async (id: string) => {
    await api.post(`/admin/providers/${id}/approve-registration`, {});
    load();
  };

  const rejectRegistration = async (id: string) => {
    const reason = prompt('Raison du rejet :');
    if (!reason) return;
    await api.post(`/admin/providers/${id}/reject-registration`, { reason });
    load();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Réseau de soins ({items?.length ?? '…'})</h1>
        <input className="input w-52" placeholder="Rechercher…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn-outline btn-sm" onClick={() => setShowImport(true)}>📥 Import Excel</button>
        <button className="btn-outline btn-sm" onClick={() => {
          if (!items) return;
          const filters = q ? `Recherche : "${q}"` : 'Aucun filtre';
          printReport({
            title: 'État du réseau de soins',
            subtitle: `${items.length} prestataire(s)`,
            filters,
            columns: [
              { label: 'Nom', key: 'name' },
              { label: 'Type', key: 'type', format: (v: string) => PROVIDER_TYPES[v] ?? v },
              { label: 'Ville', key: 'city' },
              { label: 'Adresse', key: 'address' },
              { label: 'Téléphone', key: 'phone' },
              { label: 'Convention', key: 'conventionLevel' },
              { label: 'Tiers payant', key: 'thirdPartyPayer', format: (v: boolean) => v ? 'Oui' : 'Non' },
              { label: 'Statut', key: 'active', format: (v: boolean) => v ? 'Actif' : 'Inactif' },
            ],
            rows: items,
            summary: [
              { label: 'Total', value: `${items.length} prestataire(s)`, accent: true },
              { label: 'Actifs', value: `${items.filter((p: any) => p.active).length}` },
              { label: 'Tiers payant', value: `${items.filter((p: any) => p.thirdPartyPayer).length}` },
            ],
          });
        }}>🖨️ Imprimer</button>
        <button className="btn-outline btn-sm" onClick={() => {
          if (!items) return;
          exportCsv('etats-reseau-soins.csv', [
            { label: 'Nom', key: 'name' },
            { label: 'Type', key: 'type', format: (v: string) => PROVIDER_TYPES[v] ?? v },
            { label: 'Ville', key: 'city' },
            { label: 'Adresse', key: 'address' },
            { label: 'Téléphone', key: 'phone' },
            { label: 'Convention', key: 'conventionLevel' },
            { label: 'Tiers payant', key: 'thirdPartyPayer', format: (v: boolean) => v ? 'Oui' : 'Non' },
            { label: 'Statut', key: 'active', format: (v: boolean) => v ? 'Actif' : 'Inactif' },
          ], items);
        }}>📊 CSV</button>
        <button className="btn-primary btn-sm" onClick={() => setEditing({ ...EMPTY })}>＋ Prestataire</button>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <button
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${tab === 'all' ? 'bg-white shadow text-brand-700' : 'text-slate-600 hover:text-slate-800'}`}
          onClick={() => setTab('all')}
        >
          Tous ({items?.length ?? 0})
        </button>
        <button
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${tab === 'pending' ? 'bg-white shadow text-brand-700' : 'text-slate-600 hover:text-slate-800'}`}
          onClick={() => setTab('pending')}
        >
          En attente ({pending.length})
        </button>
      </div>

      {/* Inscriptions en attente */}
      {tab === 'pending' && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <div className="card-p text-center text-slate-400 py-8">Aucune inscription en attente</div>
          ) : (
            pending.map(p => (
              <div key={p.id} className="card-p border-l-4 border-yellow-400">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-slate-500">{PROVIDER_TYPES[p.type]} · {p.city}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Contact : {p.contactFirstName} {p.contactLastName} — {p.contactPhone}
                    </p>
                    <p className="text-xs text-slate-400">Email : {p.contactEmail}</p>
                    {p.specialties && <p className="text-xs text-slate-400">Spécialités : {p.specialties}</p>}
                    <p className="text-xs text-slate-400 mt-1">
                      Inscrit le {new Date(p.createdAt).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary btn-sm" onClick={() => approveRegistration(p.id)}>
                      ✅ Approuver
                    </button>
                    <button className="btn-outline btn-sm text-red-600 border-red-200 hover:bg-red-50" onClick={() => rejectRegistration(p.id)}>
                      ❌ Rejeter
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Liste des prestataires */}
      {tab === 'all' && (
        <>
          {!items ? (
            <Spinner />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {items.map((p: any) => (
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
                    {p.registrationStatus === 'PENDING_REGISTRATION' && <Badge tone="bg-yellow-100 text-yellow-700">En attente</Badge>}
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
        </>
      )}

      {/* Modal édition */}
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

      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}

      {/* Modal import Excel */}
      {showImport && (
        <Modal open onClose={() => setShowImport(false)} title="📥 Import bulk prestataires">
          <BulkProviderImport
            onClose={() => setShowImport(false)}
            onDone={() => { load(); }}
          />
        </Modal>
      )}
    </div>
  );
}

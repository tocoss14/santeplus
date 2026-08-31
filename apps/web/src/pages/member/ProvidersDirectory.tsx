import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { PROVIDER_TYPES } from '../../format';
import { EmptyState, Spinner } from '../../components/ui';

export default function ProvidersDirectory() {
  const [items, setItems] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [city, setCity] = useState('');
  const [cities, setCities] = useState<string[]>([]);
  const [nearOnly, setNearOnly] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    api.get('/providers/cities').then(setCities).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (type) params.set('type', type);
    if (city) params.set('city', city);
    if (nearOnly && coords) params.set('near', `${coords.lat},${coords.lng}`);
    const t = setTimeout(() => {
      api.get<any[]>(`/providers?${params}`).then(setItems).catch(() => setItems([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, type, city, nearOnly, coords]);

  function locate() {
    if (!navigator.geolocation) return alert('Géolocalisation non disponible');
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: +pos.coords.latitude.toFixed(4), lng: +pos.coords.longitude.toFixed(4) });
        setNearOnly(true);
      },
      () => alert('Position indisponible'),
      { timeout: 8000 },
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Réseau de soins partenaires</h1>

      <div className="card-p space-y-3">
        <input className="input" placeholder="Rechercher : pharmacie près de moi, clinique à Cotonou…" value={q} onChange={e => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" value={type} onChange={e => setType(e.target.value)}>
            <option value="">Tous les types</option>
            {Object.entries(PROVIDER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="input w-auto" value={city} onChange={e => setCity(e.target.value)}>
            <option value="">Toutes les villes</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={locate} className={`btn-outline btn-sm ${coords ? 'ring-1 ring-brand-500' : ''}`}>
            📍 {coords ? 'Ma position' : 'Autour de moi'}
          </button>
        </div>
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState icon="🏥" title="Aucun établissement trouvé" hint="Essayez d’élargir votre recherche." />
      ) : (
        <>
          {coords && nearOnly && <p className="text-xs text-slate-400">Triés par distance depuis votre position.</p>}
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map(p => (
              <li key={p.id} className="card-p overflow-hidden p-0">
                {p.photoUrl ? (
                  <img src={p.photoUrl} alt={p.name} className="h-32 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-32 w-full place-items-center bg-sand text-2xl">🏥</div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-slate-400">{PROVIDER_TYPES[p.type]} · {p.city}</p>
                      <p className="mt-1 text-xs text-slate-500 truncate">{p.address}</p>
                      {p.specialties && <p className="text-xs text-slate-500 truncate">🩺 {p.specialties}</p>}
                      <p className="text-xs text-slate-500">🕒 {p.openingHours ?? '—'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {p.distanceKm != null && <span className="badge bg-brand-100 text-brand-800">{p.distanceKm} km</span>}
                      {p.thirdPartyPayer && <span className="badge bg-emerald-100 text-emerald-700">Tiers payant</span>}
                      <a
                        className="text-[11px] font-semibold text-brand-700 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.city}`)}`}
                      >
                        Itinéraire ↗
                      </a>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

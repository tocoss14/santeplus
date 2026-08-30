import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const PROVIDER_TYPES: Record<string, string> = {
  HOSPITAL: 'Hôpital',
  CLINIC: 'Clinique',
  PHARMACY: 'Pharmacie',
  LABORATORY: 'Laboratoire',
  MEDICAL_CABINET: 'Cabinet médical',
  SPECIALIST: 'Spécialiste',
  HEALTH_CENTER: 'Centre de santé',
};

const CONVENTION_COLORS: Record<string, string> = {
  PREMIUM: 'bg-laterite-500 text-white',
  PLUS: 'bg-ink text-white',
  BASIC: 'bg-sand text-ink',
};

export default function PublicProvidersDirectory() {
  const [items, setItems] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [city, setCity] = useState('');
  const [cities, setCities] = useState<string[]>([]);

  useEffect(() => {
    api.get('/providers/cities').then(setCities).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (type) params.set('type', type);
    if (city) params.set('city', city);
    const t = setTimeout(() => {
      api.get<any[]>(`/providers?${params}`).then(setItems).catch(() => setItems([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, type, city]);

  const stats = useMemo(() => {
    if (!items) return { total: 0, byType: {} as Record<string, number> };
    const byType: Record<string, number> = {};
    items.forEach(p => { byType[p.type] = (byType[p.type] || 0) + 1; });
    return { total: items.length, byType };
  }, [items]);

  return (
    <div className="bg-sand min-h-screen">
      {/* Hero */}
      <section className="bg-ink text-white py-12 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 text-center">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Réseau de soins</p>
          <h1 className="mt-3 font-display text-3xl sm:text-[42px] font-bold leading-tight">
            Partout au Bénin, <span className="italic text-[#FACC15]">vous êtes reconnu</span>
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-white/65">
            Hôpitaux, cliniques, pharmacies, laboratoires et spécialistes conventionnés — trouvez l'établissement le plus proche.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2 font-mono text-xs">
            <span className="rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">Cotonou</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">Porto-Novo</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">Parakou</span>
            <span className="rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">Abomey-Calavi</span>
          </div>
        </div>
      </section>

      <div className="wax-divider" aria-hidden />

      {/* Stats bar */}
      {items && (
        <div className="border-b border-mist bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-4 px-4 py-4">
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-stone">
              {stats.total} établissements partenaires
            </p>
            <span className="text-mist">·</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.byType).map(([t, n]) => (
                <span key={t} className="rounded-full bg-sand px-3 py-1 font-mono text-[10px] font-bold text-ink">
                  {n} {PROVIDER_TYPES[t] || t}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Search & Filters */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="card-wax rounded-[24px] p-6 shadow-[0_8px_30px_rgba(15,30,46,0.06)] space-y-4">
          <input
            className="w-full rounded-xl border border-mist bg-white px-4 py-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200 transition"
            placeholder="Rechercher : pharmacie près de moi, clinique à Cotonou…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <select
              className="rounded-xl border border-mist bg-white px-4 py-2 text-sm outline-none focus:border-brand-500 transition"
              value={type}
              onChange={e => setType(e.target.value)}
            >
              <option value="">Tous les types</option>
              {Object.entries(PROVIDER_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              className="rounded-xl border border-mist bg-white px-4 py-2 text-sm outline-none focus:border-brand-500 transition"
              value={city}
              onChange={e => setCity(e.target.value)}
            >
              <option value="">Toutes les villes</option>
              {cities.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Results */}
        {!items ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-4xl">🏥</p>
            <p className="mt-3 font-display text-lg font-bold text-ink">Aucun établissement trouvé</p>
            <p className="mt-1 text-sm text-stone">Essayez d'élargir votre recherche.</p>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(p => (
              <li key={p.id} className="group relative card-wax rounded-[20px] p-5 shadow-[0_4px_20px_rgba(15,30,46,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(15,30,46,0.08)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold leading-tight">{p.name}</p>
                    <p className="mt-1 text-xs text-stone">{PROVIDER_TYPES[p.type]} · {p.city}</p>
                    <p className="mt-1 text-xs text-stone truncate">{p.address}</p>
                    {p.specialties && <p className="mt-0.5 text-xs text-stone truncate">🩺 {p.specialties}</p>}
                    <p className="mt-0.5 text-xs text-stone">🕒 {p.openingHours ?? '—'}</p>
                    {p.phone && <p className="mt-0.5 text-xs font-medium text-ink">📞 {p.phone}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {p.conventionLevel && (
                      <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${CONVENTION_COLORS[p.conventionLevel] || 'bg-sand text-ink'}`}>
                        {p.conventionLevel}
                      </span>
                    )}
                    {p.thirdPartyPayer && (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 font-mono text-[10px] font-bold text-emerald-700">Tiers payant</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <a
                    className="flex-1 rounded-full border border-mist bg-white py-2 text-center text-xs font-bold text-ink transition hover:border-ink/20"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.city}`)}`}
                  >
                    Itinéraire ↗
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* CTA */}
        <div className="card-wax mt-10 overflow-hidden rounded-[24px] bg-ink p-8 text-center text-white">
          <h3 className="font-display text-2xl font-bold">Vous êtes prestataire ?</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/60">
            Rejoignez notre réseau de soins conventionnés et bénéficiez d'un afflux de patients assurés SantéPlus.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/inscription-prestataire" className="btn-primary bg-white px-8 !text-ink hover:!bg-sand">
              🏥 S'inscrire comme prestataire
            </Link>
            <Link to="/offres" className="rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-bold text-white hover:bg-white hover:text-ink transition">
              Souscrire une formule →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

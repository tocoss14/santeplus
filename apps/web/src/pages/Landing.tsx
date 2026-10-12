import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fcfa } from '../format';
import { CountUp, Reveal } from '../components/motion';

const FAQ: [string, string][] = [
  ['Comment souscrire ?', 'Choisissez une formule, ajoutez vos ayants droit, payez par mobile money : votre contrat et votre carte d’assuré sont générés immédiatement.'],
  ['Quels moyens de paiement acceptez-vous ?', 'Mobile money (MTN MoMo, Moov Money), carte bancaire via nos partenaires de paiement agréés au Bénin.'],
  ['Quand suis-je couvert ?', 'Dès la confirmation de votre paiement, sauf délai de carence indiqué sur certaines garanties.'],
  ['Comment me faire rembourser ?', 'Photographiez votre facture depuis l’application, ajoutez votre ordonnance, et suivez le traitement en temps réel.'],
];

/* Icônes SVG (stroke) — jamais d'emoji : un emoji n'a ni taille contrôlée,
   ni couleur de thème, ni libellé lisible par un lecteur d'écran. */
const icon = 'h-6 w-6 shrink-0';
const BENEFITS: { title: string; body: string; svg: JSX.Element }[] = [
  {
    title: '100 % mobile, zéro papier',
    body: 'Souscription, contrat, carte d’assuré et remboursements : tout tient dans votre téléphone.',
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className={icon} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3m-3 18h6" />
      </svg>
    ),
  },
  {
    title: 'Paiement mobile money',
    body: 'MTN MoMo et Moov Money, en mensuel, trimestriel ou annuel — sans compte bancaire.',
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className={icon} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
      </svg>
    ),
  },
  {
    title: 'Carte d’assuré QR immédiate',
    body: 'Elle est générée dès le paiement. Présentez le QR chez nos partenaires, c’est reconnu.',
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className={icon} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.5h4.5v4.5h-4.5zm0 10.5h4.5v4.5h-4.5zM10.5 4.5h3.75M18 4.5h2.25v2.25H18zm-7.5 6h3.75v3.75H10.5zM18 10.5h2.25M18 15.75h2.25V18H18zm-4.5 0h.75m3 4.5h.75" />
      </svg>
    ),
  },
  {
    title: 'Remboursement par photo',
    body: 'Photographiez facture et ordonnance depuis l’app, suivez le dossier en temps réel.',
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className={icon} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
      </svg>
    ),
  },
  {
    title: 'Des plafonds clairs, avant de payer',
    body: 'Chaque garantie affiche son plafond annuel. Aucun frais caché, résiliable à l’échéance.',
    svg: (
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor" className={icon} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
      </svg>
    ),
  },
];

export default function Landing() {
  const [products, setProducts] = useState<any[]>([]);
  const [providerCount, setProviderCount] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(1);
  const [simIndex, setSimIndex] = useState(1);

  useEffect(() => {
    api.get<any[]>('/products?clientType=INDIVIDUAL').then(setProducts).catch(() => {});
    api.get<any[]>('/providers').then(p => setProviderCount(p.length)).catch(() => {});
  }, []);

  // Filtrer les produits individuels (pas entreprise)
  const individualProducts = products.filter(p => p.clientType === 'INDIVIDUAL');
  const simProduct = individualProducts[simIndex] || individualProducts[1] || individualProducts[0];
  const simTotal = simProduct
    ? Math.round(simProduct.basePremiumAnnual + Math.max(0, adults - 1) * (simProduct.pricePerAdditionalAdultAnnual || 0) + children * (simProduct.pricePerChildAnnual || 0))
    : 0;

  return (
    <div className="bg-sand">
      {/* Données structurées FAQ — reprises telles quelles du bloc FAQ plus bas */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQ.map(([q, a]) => ({
              '@type': 'Question',
              name: q,
              acceptedAnswer: { '@type': 'Answer', text: a },
            })),
          }),
        }}
      />

      {/* HERO — thesis: live simulator, not centered claim */}
      <section className="relative overflow-hidden bg-ink text-white">
        {/* wax pattern overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='48' height='24' viewBox='0 0 48 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 12 L12 0 L24 12 L36 0 L48 12 L36 24 L24 12 L12 24 Z' fill='white'/%3E%3C/svg%3E")`, backgroundSize: '48px 24px' }} />
        {/* halos flottants — la page respire dès l'arrivée */}
        <div aria-hidden className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl motion-safe:animate-float" />
        <div aria-hidden className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-laterite-500/15 blur-3xl motion-safe:animate-float-delayed" />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:py-16 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            {/* left */}
            <div>
              <p className="eyebrow text-white/70 motion-safe:animate-fade-up">Mutuelle santé digitale · Bénin</p>
              <h1 className="mt-3 font-display text-[34px] sm:text-[52px] font-bold leading-[0.95] tracking-[-0.03em] text-balance motion-safe:animate-fade-up" style={{ animationDelay: '90ms' }}>
                Votre santé.<br />
                Vos proches.<br />
                <span className="font-display italic font-bold text-[#FACC15]">Simplement</span> protégés.
              </h1>
              <p className="mt-5 max-w-xl text-[15px] sm:text-[17px] leading-relaxed text-white/75 motion-safe:animate-fade-up" style={{ animationDelay: '180ms' }}>
                Souscrivez en quelques minutes depuis votre téléphone. Payez par mobile money, recevez
                votre carte d’assuré numérique — et utilisez-la directement chez nos partenaires.
              </p>
              <div className="mt-8 flex flex-wrap gap-3 motion-safe:animate-fade-up" style={{ animationDelay: '270ms' }}>
                <Link to="/offres" className="btn-primary bg-white text-ink hover:bg-sand hover:text-ink px-7 py-3.5 text-[15px] rounded-full">
                  Voir les formules
                </Link>
                <Link to="/register" className="rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-bold text-white backdrop-blur hover:bg-white hover:text-ink transition">
                  Créer mon compte
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/75 motion-safe:animate-fade-up" style={{ animationDelay: '340ms' }}>
                <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-laterite-500" /> Sans papier</span>
                <span aria-hidden className="text-white/25">·</span>
                <span>Sans déplacement</span>
                <span aria-hidden className="text-white/25">·</span>
                <span>Résiliable à l’échéance</span>
              </div>
              {/* React 18 ignore fetchPriority (camelCase) : il prévient et ne l'applique pas.
                  Le spread minuscule l'applique réellement au DOM (priorité de chargement
                  de l'image héro — règle performance du skill). */}
              <div className="mt-8 overflow-hidden rounded-[20px] border border-white/10 bg-white/5 backdrop-blur motion-safe:animate-fade-up" style={{ animationDelay: '420ms' }}>
                <img
                  src="/img/famille-protegee-800.jpg"
                  srcSet="/img/famille-protegee-400.jpg 400w, /img/famille-protegee-800.jpg 800w"
                  sizes="(min-width: 1024px) 560px, 92vw"
                  alt="Famille souriante, protégée par SantéPlus"
                  width="800"
                  height="500"
                  decoding="async"
                  {...({ fetchpriority: 'high' } as Record<string, string>)}
                  className="h-48 w-full object-cover sm:h-56"
                />
                <div className="px-4 py-2.5 text-center font-mono text-[10px] uppercase tracking-widest text-white/80">Famille protégée · Soins à portée de main</div>
              </div>
            </div>

            {/* right — interactive simulator card */}
            <div className="relative lg:pl-6 motion-safe:animate-fade-up" style={{ animationDelay: '200ms' }}>
              {/* stack behind */}
              <div aria-hidden className="absolute -right-2 top-6 hidden h-[92%] w-[92%] rotate-[1.2deg] rounded-[24px] border border-white/10 bg-white/5 backdrop-blur lg:block" />
              <div aria-hidden className="absolute -right-1 top-3 hidden h-[94%] w-[94%] rotate-[0.6deg] rounded-[24px] border border-white/10 bg-white/[0.04] backdrop-blur lg:block" />
              <div className="relative card-wax rounded-[24px] p-6 sm:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow">Simulateur familial</p>
                    <p className="mt-1 font-display text-xl font-bold text-ink">Combien pour ma famille ?</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-laterite-600 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-ping motion-safe:[animation-duration:1.6s]" /> En direct</span>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-sand p-4">
                    <p className="label !mb-2">Adultes</p>
                    <div className="flex items-center justify-between">
                      <button type="button" onClick={() => setAdults(a => Math.max(1, a - 1))} aria-label="Retirer un adulte" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink shadow-sm hover:bg-ink hover:text-white transition"><span aria-hidden>−</span></button>
                      <span aria-hidden className="font-display text-2xl font-bold">{adults}</span>
                      <button type="button" onClick={() => setAdults(a => Math.min(4, a + 1))} aria-label="Ajouter un adulte" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-white hover:bg-brand-700 transition"><span aria-hidden>+</span></button>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-sand p-4">
                    <p className="label !mb-2">Enfants</p>
                    <div className="flex items-center justify-between">
                      <button type="button" onClick={() => setChildren(c => Math.max(0, c - 1))} aria-label="Retirer un enfant" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-ink shadow-sm hover:bg-ink hover:text-white transition"><span aria-hidden>−</span></button>
                      <span aria-hidden className="font-display text-2xl font-bold">{children}</span>
                      <button type="button" onClick={() => setChildren(c => Math.min(6, c + 1))} aria-label="Ajouter un enfant" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-white hover:bg-brand-700 transition"><span aria-hidden>+</span></button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-1.5" role="group" aria-label="Choisir une formule">
                  {individualProducts.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSimIndex(i)}
                      aria-pressed={simIndex === i}
                      className={`flex-1 min-h-[44px] rounded-full px-2 py-2 text-[10px] font-bold transition cursor-pointer ${simIndex === i ? 'bg-ink text-white' : 'bg-mist text-stone hover:bg-ink/10'}`}
                    >
                      {p.name.replace('Santé ', '').replace('Formule ', '')}
                    </button>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl bg-ink p-5 text-white">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/75">Cotisation estimée</p>
                  <div aria-live="polite" aria-atomic="true">
                    <div className="mt-1 flex items-baseline gap-2">
                      <span key={simTotal} className="inline-block font-mono text-3xl font-bold tracking-tight motion-safe:animate-pop-in">{simProduct ? fcfa(Math.round(simTotal / 12)) : '—'}</span>
                      <span className="text-sm font-bold text-white/75">/ mois</span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-white/75">soit {simProduct ? fcfa(simTotal) : '—'} / an · Famille {adults} adulte{adults > 1 ? 's' : ''}{children ? ` + ${children} enfant${children > 1 ? 's' : ''}` : ''}</p>
                  </div>
                  <Link to={simProduct ? `/register?productId=${simProduct.id}` : '/register'} className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-bold text-ink hover:bg-sand transition">
                    Souscrire cette formule <span aria-hidden>→</span>
                  </Link>
                  <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-widest text-white/75">Tarifs indicatifs · Devis détaillé à l’étape suivante</p>
                </div>
              </div>
              <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-white/75">Paiement mobile money · Carte QR instantanée</p>
            </div>
          </div>
        </div>
        <div className="wax-divider motion-safe:animate-wax-slide" aria-hidden />
      </section>

      {/* PREUVE CHIFFRÉE — la confiance se pose tout de suite, avant le moindre CTA */}
      <section aria-label="Chiffres clés" className="border-b border-mist bg-white">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-px overflow-hidden bg-mist sm:grid-cols-4">
          {[
            { v: <><CountUp value={providerCount || 12} /><span aria-hidden className="text-laterite-600">+</span></>, l: 'Établissements conventionnés' },
            { v: <>5&nbsp;min</>, l: 'Pour souscrire, de bout en bout' },
            { v: <>4</>, l: 'Villes couvertes, du Nord au Sud' },
            { v: <>QR</>, l: 'Carte d’assuré immédiate, sans plastique' },
          ].map(s => (
            <div key={s.l} className="bg-white px-4 py-6 text-center sm:py-7">
              <dd className="font-display text-3xl font-bold tracking-tight text-ink sm:text-[34px]">{s.v}</dd>
              <dt className="mx-auto mt-1.5 max-w-[22ch] text-[11px] font-bold uppercase tracking-[0.12em] text-stone">{s.l}</dt>
            </div>
          ))}
        </dl>
      </section>

      {/* TRUST BAR */}
      <section className="border-b border-mist bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-stone">Paiement par</p>
          <div className="flex flex-wrap items-center gap-2">
            {['MTN MoMo', 'Moov Money', 'FedaPay', 'CinetPay'].map(b => (
              <span key={b} className="rounded-full border border-mist bg-sand px-3.5 py-1.5 font-mono text-xs font-bold text-ink">{b}</span>
            ))}
          </div>
          <p className="hidden items-center gap-2 font-mono text-xs text-stone sm:flex">
            <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-700" /> Plateforme agréée · Partenaires assureurs conventionnés
          </p>
        </div>
      </section>

      {/* BÉNÉFICES — 5 raisons concrètes, icônes SVG, pas d'emoji */}
      <section id="avantages" className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Pourquoi SantéPlus</p>
          <h2 className="mt-2 font-display text-3xl sm:text-[38px] font-bold leading-tight">Une mutuelle qui tient dans votre poche</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-stone">Conçue pour un usage mobile, des réalités béninoises et des prix affichés sans détour.</p>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b, i) => (
            <Reveal as="li" key={b.title} delay={i * 70} className="card-wax h-full p-6 transition hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(15,30,46,0.08)]">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-50 text-brand-600">{b.svg}</span>
              <h3 className="mt-4 font-display text-lg font-bold leading-tight">{b.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone">{b.body}</p>
            </Reveal>
          ))}
          <Reveal as="li" delay={BENEFITS.length * 70} className="flex h-full flex-col justify-between rounded-[24px] bg-ink p-6 text-white">
              <div>
                <h3 className="font-display text-lg font-bold leading-tight">Vous êtes prestataire de santé ?</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-white/75">Rejoignez le réseau conventionné et recevez des patients déjà couverts.</p>
              </div>                <Link to="/inscription-prestataire" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-bold text-ink hover:bg-sand transition">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v5m0 0a3 3 0 0 0 3-3V4a3 3 0 0 0-6 0v1a3 3 0 0 0 3 3Zm0 0v4a5 5 0 0 1-5 5m5-5a5 5 0 0 0 5 5m-5-5v4m0 0a5 5 0 0 1-5 5m5-5a5 5 0 0 0 5 5" />
                  </svg>
                  Rejoindre le réseau
                </Link>
            </Reveal>
        </ul>
      </section>

      <div className="wax-divider wax-divider--laterite mx-auto max-w-6xl rounded-full motion-safe:animate-wax-slide" aria-hidden />

      {/* COMMENT ÇA MARCHE — with connecting wax line */}
      <section id="fonctionnement" className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Parcours</p>
          <h2 className="mt-2 font-display text-3xl sm:text-[38px] font-bold leading-tight">De l’idée à la carte, en quatre gestes</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-stone">Aucun formulaire interminable. Chaque étape tient sur un écran de téléphone.</p>
        </div>
        <div className="relative mt-10 grid gap-4 sm:grid-cols-4">
          <div aria-hidden className="pointer-events-none absolute left-[12%] right-[12%] top-[38px] hidden h-px bg-gradient-to-r from-transparent via-mist to-transparent sm:block" />
          {[
            ['01', 'Créez votre compte', '2 minutes, numéro + pièce'],
            ['02', 'Choisissez votre formule', 'Devis instantané, ayants droit inclus'],
            ['03', 'Payez par mobile money', 'Mensuel, trimestriel ou annuel'],
            ['04', 'Utilisez votre carte', 'QR chez nos partenaires'],
          ].map(([n, t, d], i) => (
            <Reveal key={n} delay={i * 90} className="h-full">
              <div className="group relative card-wax h-full p-6 text-center transition hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(15,30,46,0.08)]">
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-ink font-mono text-sm font-bold text-white">{n}</span>
                <p className="mt-4 font-display text-[17px] font-bold leading-tight">{t}</p>
                <p className="mx-auto mt-1.5 max-w-[18ch] text-sm leading-relaxed text-stone">{d}</p>
                {i < 3 && <span aria-hidden className="absolute -right-2 top-[38px] hidden h-8 w-8 place-items-center rounded-full bg-laterite-600 text-white sm:grid">→</span>}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FORMULES */}
      <section id="offres" className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
        <div className="text-center">
          <p className="eyebrow">Formules individuelles</p>
          <h2 className="mt-2 font-display text-3xl sm:text-[38px] font-bold">Une protection à votre mesure</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-stone">Trois niveaux de couverture, mêmes fondamentaux : transparence, plafonds clairs, aucun frais caché.</p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {individualProducts.map((p, i) => {
            const isPopular = p.code === 'CONF';
            return (
              <Reveal key={p.id} delay={i * 110} className="h-full">
                <div className={`group relative flex h-full flex-col overflow-hidden rounded-[24px] border bg-white p-6 shadow-[0_8px_30px_rgba(15,30,46,0.06)] transition hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(15,30,46,0.10)] ${isPopular ? 'border-ink ring-[1.5px] ring-ink' : 'border-mist'}`}>
                  {isPopular && <div aria-hidden className="absolute left-0 right-0 top-0 h-[10px]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='12' viewBox='0 0 24 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 6 L6 0 L12 6 L18 0 L24 6 L18 12 L12 6 L6 12 Z' fill='%23C2512F'/%3E%3C/svg%3E")`, backgroundSize: '24px 12px' }} />}
                  {isPopular && <span className="absolute right-4 top-4 rounded-full bg-laterite-600 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-white">Populaire</span>}
                  <h3 className="font-display text-xl font-bold leading-tight">{p.name}</h3>
                  <p className="mt-2 min-h-[44px] text-sm leading-relaxed text-stone">{p.description}</p>
                  <div className="mt-5 rounded-2xl bg-sand p-4">
                    <p className="font-mono text-3xl font-bold tracking-tight text-ink">{fcfa(Math.round(p.basePremiumAnnual / 12))}<span className="font-sans text-sm font-bold text-stone"> / mois</span></p>
                    <p className="mt-1 font-mono text-xs text-stone">soit {fcfa(p.basePremiumAnnual)} / an · assuré principal</p>
                  </div>
                  <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                    {p.guarantees.slice(0, 5).map((g: any) => (
                      <li key={g.id} className="flex items-start gap-2.5">
                        <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-700 text-[11px] font-bold text-white">✓</span>
                        <span className="flex-1 font-medium leading-snug">{g.guarantee.name}</span>
                        {g.annualLimit ? <span className="ml-auto shrink-0 font-mono text-xs text-stone">jusqu’à {fcfa(g.annualLimit)}</span> : null}
                      </li>
                    ))}
                  </ul>
                  <Link to="/offres" className={`mt-6 w-full ${isPopular ? 'btn-primary rounded-full' : 'btn-outline rounded-full'}`}>Voir la formule</Link>
                  <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-widest text-stone">Sans engagement · Détails à l’étape suivante</p>
                </div>
              </Reveal>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <Link to="/cga" className="inline-flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-brand-700 hover:text-brand-800 hover:underline">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            Voir tous les barèmes et conditions générales
            <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* ENTREPRISES */}
      <section id="entreprises" className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div className="grid items-center gap-8 overflow-hidden rounded-[28px] border border-mist bg-white p-6 sm:grid-cols-[1.05fr_0.95fr] sm:p-8">
          <div>
            <p className="eyebrow">Entreprises</p>
            <h2 className="mt-2 font-display text-2xl sm:text-[32px] font-bold leading-tight">La santé de vos équipes, gérée en un fichier</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone">
              Importez vos salariés par Excel/CSV, souscrivez le contrat collectif et laissez chaque salarié gérer sa carte. Vous ne voyez que l’administratif.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm">
              {['Détection automatique des doublons avant import', 'Suivi des entrées/sorties en un clic', 'Cotisations centralisées, reçus téléchargeables'].map(t => (
                <li key={t} className="flex items-start gap-2.5"><span aria-hidden className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] text-white">✓</span><span>{t}</span></li>
              ))}
            </ul>
            <Link to="/register-entreprise" className="btn-primary mt-6 rounded-full">Créer mon espace entreprise</Link>
          </div>
          <Reveal>
            <div className="relative rounded-2xl bg-ink p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-white/70">Import salariés · SOTRABEN SARL</p>
                <span className="rounded-full bg-emerald-700 px-2.5 py-1 font-mono text-[10px] font-bold text-white">3 ajoutés</span>
              </div>
              <div className="mt-4 overflow-hidden rounded-xl bg-white">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Aperçu de l’import Excel/CSV des salariés</caption>
                  <thead className="bg-sand"><tr><th scope="col" className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-stone">Nom</th><th scope="col" className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-stone">Fonction</th><th scope="col" className="px-3 py-2 text-right"><span className="rounded-full bg-emerald-100 px-2 py-1 font-mono text-[10px] font-bold text-emerald-800">Validé</span></th></tr></thead>
                  <tbody className="divide-y divide-mist">
                    {[['AHOUANDJINOU', 'Chauffeur senior'], ['TOSSOU', 'Comptable'], ['SOUMANOU', 'Magasinier']].map(r => (
                      <tr key={r[0]}><td className="px-3 py-2.5 font-medium">{r[0]}</td><td className="px-3 py-2.5 text-stone">{r[1]}</td><td className="px-3 py-2.5 text-right font-mono text-xs font-bold text-emerald-700">✓</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-white/75">CSV validé ligne par ligne · 0 doublon</p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* RÉSEAU — ink */}
      <section id="reseau" className="relative mt-6 overflow-hidden bg-ink py-14 text-white sm:py-16">
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='48' height='24' viewBox='0 0 48 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 12 L12 0 L24 12 L36 0 L48 12 L36 24 L24 12 L12 24 Z' fill='white'/%3E%3C/svg%3E")`, backgroundSize: '48px 24px' }} />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-[1.35fr_0.65fr] md:items-center">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/75">Réseau de soins</p>
            <h2 className="mt-2 font-display text-2xl sm:text-[32px] font-bold leading-tight">Partout au Bénin, vous êtes reconnu</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/75">
              Hôpitaux, cliniques, pharmacies, laboratoires et spécialistes conventionnés — trouvez « une pharmacie près de moi » directement dans l’app.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2 font-mono text-xs">
              {['Cotonou', 'Porto-Novo', 'Parakou'].map(v => <li key={v} className="rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">{v}</li>)}
              <li className="rounded-full bg-laterite-600 px-3 py-1.5 font-bold">Abomey-Calavi</li>
            </ul>
          </div>
          <Reveal>
            <div className="rounded-[24px] bg-white p-6 text-ink shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-stone">Établissements partenaires</p>
              <p className="mt-2 font-display text-5xl font-bold tracking-tight"><CountUp value={providerCount || 12} /><span className="text-laterite-600">+</span></p>
              <p className="mt-1 text-sm font-medium text-stone">référencés dans la démo, partout sur le territoire</p>
              <Link to="/reseau" className="btn-outline mt-5 w-full rounded-full">Explorer le réseau</Link>
              <Link to="/inscription-prestataire" className="mt-3 inline-flex w-full items-center justify-center gap-2 text-xs font-bold text-brand-700 hover:underline">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v5m0 0a3 3 0 0 0 3-3V4a3 3 0 0 0-6 0v1a3 3 0 0 0 3 3Zm0 0v4a5 5 0 0 1-5 5m5-5a5 5 0 0 0 5 5m-5-5v4m0 0a5 5 0 0 1-5 5m5-5a5 5 0 0 0 5 5" />
                </svg>
                Vous êtes prestataire ? Inscrivez-vous
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-14 sm:py-16">
        <p className="eyebrow text-center">FAQ</p>
        <h2 className="mt-2 text-center font-display text-2xl sm:text-[32px] font-bold">On répond à vos questions</h2>
        <div className="mt-8 space-y-3" id="faq">
          {FAQ.map(([q, a], i) => (
            <Reveal key={q} delay={i * 60}>
              <div className={`overflow-hidden rounded-2xl border bg-white transition ${openFaq === i ? 'border-ink shadow-[0_8px_24px_rgba(15,30,46,0.08)]' : 'border-mist hover:border-ink/20'}`}>
                <h3>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    aria-expanded={openFaq === i}
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-button-${i}`}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
                  >
                    <span className="font-display text-[15px] font-bold leading-snug">{q}</span>
                    <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold transition ${openFaq === i ? 'bg-ink text-white' : 'bg-sand text-ink'}`}>{openFaq === i ? '−' : '+'}</span>
                  </button>
                </h3>
                {openFaq === i && (
                  <p id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-button-${i}`} className="px-5 pb-5 text-sm leading-relaxed text-stone">
                    {a}
                  </p>
                )}
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <div className="card-wax mt-10 overflow-hidden rounded-[24px] bg-ink p-8 text-center text-white">
            <h3 className="font-display text-2xl font-bold">Prêt à protéger votre famille ?</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/75">Souscription 100% en ligne, effective dès paiement. Votre carte arrive instantanément.</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link to="/offres" className="btn-primary bg-white px-8 !text-ink hover:!bg-sand">Souscrire maintenant</Link>
              <Link to="/inscription-prestataire" className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-bold text-white hover:bg-white hover:text-ink transition">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v5m0 0a3 3 0 0 0 3-3V4a3 3 0 0 0-6 0v1a3 3 0 0 0 3 3Zm0 0v4a5 5 0 0 1-5 5m5-5a5 5 0 0 0 5 5m-5-5v4m0 0a5 5 0 0 1-5 5m5-5a5 5 0 0 0 5 5" />
                </svg>
                Prestataire ? Rejoindre le réseau
              </Link>
            </div>
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-white/75">Paiement sécurisé · Données chiffrées</p>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fcfa } from '../format';

const FAQ = [
  ['Comment souscrire ?', 'Choisissez une formule, ajoutez vos ayants droit, payez par mobile money : votre contrat et votre carte d’assuré sont générés immédiatement.'],
  ['Quels moyens de paiement acceptez-vous ?', 'Mobile money (MTN MoMo, Moov Money), carte bancaire via nos partenaires de paiement agréés au Bénin.'],
  ['Quand suis-je couvert ?', 'Dès la confirmation de votre paiement, sauf délai de carence indiqué sur certaines garanties.'],
  ['Comment me faire rembourser ?', 'Photographiez votre facture depuis l’application, ajoutez votre ordonnance, et suivez le traitement en temps réel.'],
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

  const simProduct = products[simIndex] || products[1] || products[0];
  const simTotal = simProduct
    ? Math.round(simProduct.basePremiumAnnual + Math.max(0, adults - 1) * (simProduct.pricePerAdditionalAdultAnnual || 0) + children * (simProduct.pricePerChildAnnual || 0))
    : 0;

  return (
    <div className="bg-sand">
      {/* HERO — thesis: live simulator, not centered claim */}
      <section className="relative overflow-hidden bg-ink text-white">
        {/* wax pattern overlay */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='48' height='24' viewBox='0 0 48 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 12 L12 0 L24 12 L36 0 L48 12 L36 24 L24 12 L12 24 Z' fill='white'/%3E%3C/svg%3E")`, backgroundSize: '48px 24px' }} />
        <div className="relative mx-auto max-w-6xl px-4 py-10 sm:py-16 lg:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            {/* left */}
            <div>
              <p className="eyebrow text-white/60">Mutuelle santé digitale · Bénin</p>
              <h1 className="mt-3 font-display text-[34px] sm:text-[52px] font-bold leading-[0.95] tracking-[-0.03em] text-balance">
                Votre santé.<br />
                Vos proches.<br />
                <span className="font-display italic font-bold text-[#FACC15]">Simplement</span> protégés.
              </h1>
              <p className="mt-5 max-w-xl text-[15px] sm:text-[17px] leading-relaxed text-white/70">
                Souscrivez en quelques minutes depuis votre téléphone. Payez par mobile money, recevez
                votre carte d’assuré numérique — et utilisez-la directement chez nos partenaires.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/offres" className="btn-primary bg-white text-ink hover:bg-sand hover:text-ink px-7 py-3.5 text-[15px] rounded-full">
                  Voir les formules
                </Link>
                <Link to="/register" className="rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-sm font-bold text-white backdrop-blur hover:bg-white hover:text-ink transition">
                  Créer mon compte
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-white/50">
                <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-laterite-500" /> Sans papier</span>
                <span className="text-white/20">·</span>
                <span>Sans déplacement</span>
                <span className="text-white/20">·</span>
                <span>Résiliable à l’échéance</span>
              </div>
            </div>

            {/* right — interactive simulator card */}
            <div className="relative lg:pl-6">
              {/* stack behind */}
              <div className="absolute -right-2 top-6 hidden h-[92%] w-[92%] rotate-[1.2deg] rounded-[24px] border border-white/10 bg-white/5 backdrop-blur lg:block" />
              <div className="absolute -right-1 top-3 hidden h-[94%] w-[94%] rotate-[0.6deg] rounded-[24px] border border-white/10 bg-white/[0.04] lg:block" />
              <div className="relative card-wax rounded-[24px] p-6 sm:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow">Simulateur familial</p>
                    <p className="mt-1 font-display text-xl font-bold text-ink">Combien pour ma famille ?</p>
                  </div>
                  <span className="rounded-full bg-laterite-500 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white">En direct</span>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-sand p-4">
                    <p className="label !mb-2">Adultes</p>
                    <div className="flex items-center justify-between">
                      <button onClick={() => setAdults(a => Math.max(1, a - 1))} className="grid h-8 w-8 place-items-center rounded-full bg-white text-ink shadow-sm hover:bg-ink hover:text-white transition">−</button>
                      <span className="font-display text-2xl font-bold">{adults}</span>
                      <button onClick={() => setAdults(a => Math.min(4, a + 1))} className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white hover:bg-brand-700 transition">+</button>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-sand p-4">
                    <p className="label !mb-2">Enfants</p>
                    <div className="flex items-center justify-between">
                      <button onClick={() => setChildren(c => Math.max(0, c - 1))} className="grid h-8 w-8 place-items-center rounded-full bg-white text-ink shadow-sm hover:bg-ink hover:text-white transition">−</button>
                      <span className="font-display text-2xl font-bold">{children}</span>
                      <button onClick={() => setChildren(c => Math.min(6, c + 1))} className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white hover:bg-brand-700 transition">+</button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  {products.slice(0, 3).map((p, i) => (
                    <button
                      key={p.id}
                      onClick={() => setSimIndex(i)}
                      className={`flex-1 rounded-full px-3 py-2 text-xs font-bold transition ${simIndex === i ? 'bg-ink text-white' : 'bg-mist text-stone hover:bg-ink/10'}`}
                    >
                      {p.name.replace('Formule ', '')}
                    </button>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl bg-ink p-5 text-white">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">Cotisation estimée</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-bold tracking-tight">{simProduct ? fcfa(Math.round(simTotal / 12)) : '—'}</span>
                    <span className="text-sm font-bold text-white/50">/ mois</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-white/40">soit {simProduct ? fcfa(simTotal) : '—'} / an · Famille {adults} adulte{adults > 1 ? 's' : ''}{children ? ` + ${children} enfant${children > 1 ? 's' : ''}` : ''}</p>
                  <Link to="/register" className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-bold text-ink hover:bg-sand transition">
                    Souscrire cette formule <span aria-hidden>→</span>
                  </Link>
                  <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-widest text-white/30">Tarifs indicatifs · Devis détaillé à l’étape suivante</p>
                </div>
              </div>
              <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">Paiement mobile money · Carte QR instantanée</p>
            </div>
          </div>
        </div>
        <div className="wax-divider" aria-hidden />
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
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Plateforme agréée · Partenaires assureurs conventionnés
          </p>
        </div>
      </section>

      {/* COMMENT ÇA MARCHE — with connecting wax line */}
      <section id="fonctionnement" className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Parcours</p>
          <h2 className="mt-2 font-display text-3xl sm:text-[38px] font-bold leading-tight">De l’idée à la carte, en quatre gestes</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-stone">Aucun formulaire interminable. Chaque étape tient sur un écran de téléphone.</p>
        </div>
        <div className="relative mt-10 grid gap-4 sm:grid-cols-4">
          <div className="pointer-events-none absolute left-[12%] right-[12%] top-[38px] hidden h-px bg-gradient-to-r from-transparent via-mist to-transparent sm:block" />
          {[
            ['01', 'Créez votre compte', '2 minutes, numéro + pièce', '→'],
            ['02', 'Choisissez votre formule', 'Devis instantané, ayants droit inclus', '→'],
            ['03', 'Payez par mobile money', 'Mensuel, trimestriel ou annuel', '→'],
            ['04', 'Utilisez votre carte', 'QR chez nos partenaires', ''],
          ].map(([n, t, d, arrow]) => (
            <div key={n} className="group relative card-wax p-6 text-center transition hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(15,30,46,0.08)]">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-ink font-mono text-sm font-bold text-white">{n}</span>
              <p className="mt-4 font-display text-[17px] font-bold leading-tight">{t}</p>
              <p className="mx-auto mt-1.5 max-w-[18ch] text-sm leading-relaxed text-stone">{d}</p>
              {arrow && <span className="absolute -right-2 top-[38px] hidden h-8 w-8 place-items-center rounded-full bg-laterite-500 text-white sm:grid">→</span>}
            </div>
          ))}
        </div>
      </section>

      <div className="wax-divider wax-divider--laterite mx-auto max-w-6xl rounded-full" />

      {/* FORMULES */}
      <section id="offres" className="mx-auto max-w-6xl px-4 py-14 sm:py-16">
        <div className="text-center">
          <p className="eyebrow">Formules</p>
          <h2 className="mt-2 font-display text-3xl sm:text-[38px] font-bold">Une protection à votre mesure</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-stone">Trois niveaux, mêmes fondamentaux : transparence des garanties, plafonds clairs, aucun frais caché.</p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {products.map((p, i) => (
            <div key={p.id} className={`group relative flex flex-col overflow-hidden rounded-[24px] border bg-white p-6 shadow-[0_8px_30px_rgba(15,30,46,0.06)] transition hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(15,30,46,0.10)] ${i === 1 ? 'border-ink ring-[1.5px] ring-ink' : 'border-mist'}`}>
              {i === 1 && <div className="absolute left-0 right-0 top-0 h-[10px]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='12' viewBox='0 0 24 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 6 L6 0 L12 6 L18 0 L24 6 L18 12 L12 6 L6 12 Z' fill='%23C2512F'/%3E%3C/svg%3E")`, backgroundSize: '24px 12px' }} />}
              {i === 1 && <span className="absolute right-4 top-4 rounded-full bg-laterite-600 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-white">Populaire</span>}
              <h3 className="font-display text-xl font-bold leading-tight">{p.name}</h3>
              <p className="mt-2 min-h-[44px] text-sm leading-relaxed text-stone">{p.description}</p>
              <div className="mt-5 rounded-2xl bg-sand p-4">
                <p className="font-mono text-3xl font-bold tracking-tight text-ink">{fcfa(Math.round(p.basePremiumAnnual / 12))}<span className="font-sans text-sm font-bold text-stone"> / mois</span></p>
                <p className="mt-1 font-mono text-xs text-stone">soit {fcfa(p.basePremiumAnnual)} / an · assuré principal</p>
              </div>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {p.guarantees.slice(0, 5).map((g: any) => (
                  <li key={g.id} className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">✓</span>
                    <span className="flex-1 font-medium leading-snug">{g.guarantee.name}</span>
                    {g.annualLimit ? <span className="ml-auto shrink-0 font-mono text-xs text-stone">jusqu’à {fcfa(g.annualLimit)}</span> : null}
                  </li>
                ))}
              </ul>
              <Link to="/offres" className={`mt-6 w-full ${i === 1 ? 'btn-primary rounded-full' : 'btn-outline rounded-full'}`}>Voir la formule</Link>
              <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-widest text-stone/60">Sans engagement · Détails à l’étape suivante</p>
            </div>
          ))}
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
                <li key={t} className="flex items-start gap-2.5"><span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-[10px] text-white">✓</span><span>{t}</span></li>
              ))}
            </ul>
            <Link to="/register" className="btn-primary mt-6 rounded-full">Créer mon espace entreprise</Link>
          </div>
          <div className="relative rounded-2xl bg-ink p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-white/50">Import salariés · SOTRABEN SARL</p>
              <span className="rounded-full bg-emerald-500 px-2.5 py-1 font-mono text-[10px] font-bold text-white">3 ajoutés</span>
            </div>
            <div className="mt-4 overflow-hidden rounded-xl bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-sand"><tr><th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-stone">Nom</th><th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-stone">Fonction</th><th className="px-3 py-2 text-right"><span className="rounded-full bg-emerald-100 px-2 py-1 font-mono text-[10px] font-bold text-emerald-700">Validé</span></th></tr></thead>
                <tbody className="divide-y divide-mist">
                  {[['AHOUANDJINOU','Chauffeur senior'],['TOSSOU','Comptable'],['SOUMANOU','Magasinier']].map(r => (
                    <tr key={r[0]}><td className="px-3 py-2.5 font-medium">{r[0]}</td><td className="px-3 py-2.5 text-stone">{r[1]}</td><td className="px-3 py-2.5 text-right font-mono text-xs text-emerald-600">✓</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-white/40">CSV validé ligne par ligne · 0 doublon</p>
          </div>
        </div>
      </section>

      {/* RÉSEAU — ink */}
      <section id="reseau" className="relative mt-6 overflow-hidden bg-ink py-14 text-white sm:py-16">
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='48' height='24' viewBox='0 0 48 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 12 L12 0 L24 12 L36 0 L48 12 L36 24 L24 12 L12 24 Z' fill='white'/%3E%3C/svg%3E")`, backgroundSize: '48px 24px' }} />
        <div className="relative mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-[1.35fr_0.65fr] md:items-center">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">Réseau de soins</p>
            <h2 className="mt-2 font-display text-2xl sm:text-[32px] font-bold leading-tight">Partout au Bénin, vous êtes reconnu</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/65">
              Hôpitaux, cliniques, pharmacies, laboratoires et spécialistes conventionnés — trouvez « une pharmacie près de moi » directement dans l’app.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 font-mono text-xs">
              <span className="rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">Cotonou</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">Porto-Novo</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">Parakou</span>
              <span className="rounded-full bg-laterite-600 px-3 py-1.5 font-bold">Abomey-Calavi</span>
            </div>
          </div>
          <div className="rounded-[24px] bg-white p-6 text-ink shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <p className="font-mono text-[11px] font-bold uppercase tracking-widest text-stone">Établissements partenaires</p>
            <p className="mt-2 font-display text-5xl font-bold tracking-tight">{providerCount || 12}<span className="text-laterite-600">+</span></p>
            <p className="mt-1 text-sm font-medium text-stone">référencés dans la démo, partout sur le territoire</p>
            <Link to="/login" className="btn-outline mt-5 w-full rounded-full">Explorer le réseau</Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-14 sm:py-16">
        <p className="eyebrow text-center">FAQ</p>
        <h2 className="mt-2 text-center font-display text-2xl sm:text-[32px] font-bold">On répond à vos questions</h2>
        <div className="mt-8 space-y-3" id="faq">
          {FAQ.map(([q, a], i) => (
            <div key={q} className={`overflow-hidden rounded-2xl border bg-white transition ${openFaq === i ? 'border-ink shadow-[0_8px_24px_rgba(15,30,46,0.08)]' : 'border-mist hover:border-ink/20'}`}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                <span className="font-display text-[15px] font-bold leading-snug">{q}</span>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold transition ${openFaq === i ? 'bg-ink text-white' : 'bg-sand text-ink'}`}>{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && <p className="px-5 pb-5 text-sm leading-relaxed text-stone">{a}</p>}
            </div>
          ))}
        </div>
        <div className="card-wax mt-10 overflow-hidden rounded-[24px] bg-ink p-8 text-center text-white">
          <h3 className="font-display text-2xl font-bold">Prêt à protéger votre famille ?</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/60">Souscription 100% en ligne, effective dès paiement. Votre carte arrive instantanément.</p>
          <Link to="/offres" className="btn-primary mt-6 bg-white px-8 !text-ink hover:!bg-sand">Souscrire maintenant</Link>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-white/30">Paiement sécurisé · Données chiffrées</p>
        </div>
      </section>
    </div>
  );
}

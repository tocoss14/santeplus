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

  useEffect(() => {
    api.get<any[]>('/products?clientType=INDIVIDUAL').then(setProducts).catch(() => {});
    api.get<any[]>('/providers').then(p => setProviderCount(p.length)).catch(() => {});
  }, []);

  return (
    <div>
      <section className="bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24 text-center">
          <h1 className="text-3xl sm:text-5xl font-extrabold leading-tight">
            Votre santé. Votre couverture.<br className="hidden sm:block" /> Simplement.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-brand-100 text-base sm:text-lg">
            Souscrivez une mutuelle santé en quelques minutes depuis votre téléphone. Payez par mobile money,
            recevez votre carte d’assuré numérique et faites-vous rembourser sans stress.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/offres" className="btn bg-white text-brand-800 hover:bg-brand-50 px-6 py-3 rounded-xl font-bold shadow">
              Souscrire maintenant
            </Link>
            <Link to="/register" className="btn border border-white/40 px-6 py-3 rounded-xl font-semibold hover:bg-white/10">
              Créer un compte gratuit
            </Link>
          </div>
          <p className="mt-4 text-xs text-brand-200">Sans papier · Sans déplacement · Résiliable à l’échéance</p>
        </div>
      </section>

      <section id="fonctionnement" className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-center text-2xl sm:text-3xl font-bold">Comment ça marche ?</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          {[
            ['1', 'Créez votre compte', '2 minutes avec votre téléphone'],
            ['2', 'Choisissez votre formule', 'Comparez garanties et cotisations'],
            ['3', 'Payez par mobile money', 'Mensuel, trimestriel ou annuel'],
            ['4', 'Utilisez votre carte', 'QR code chez les partenaires'],
          ].map(([n, t, d]) => (
            <div key={n} className="card-p text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-brand-100 font-bold text-brand-700">{n}</span>
              <p className="mt-3 font-semibold">{t}</p>
              <p className="mt-1 text-sm text-slate-500">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="offres" className="bg-white border-y border-slate-200 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl sm:text-3xl font-bold">Des formules pour chaque famille</h2>
          <p className="mt-2 text-center text-slate-500">Cotisations transparentes, garanties claires.</p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {products.map((p, i) => (
              <div key={p.id} className={`card-p relative ${i === 1 ? 'ring-2 ring-brand-500' : ''}`}>
                {i === 1 && (
                  <span className="absolute -top-2.5 left-4 badge bg-brand-600 text-white">Populaire</span>
                )}
                <h3 className="font-bold text-lg">{p.name}</h3>
                <p className="mt-1 min-h-10 text-sm text-slate-500">{p.description}</p>
                <p className="mt-3">
                  <span className="text-2xl font-extrabold text-brand-700">{fcfa(Math.round(p.basePremiumAnnual / 12))}</span>
                  <span className="text-sm text-slate-400">/mois</span>
                </p>
                <p className="text-xs text-slate-400">soit {fcfa(p.basePremiumAnnual)}/an pour l’assuré principal</p>
                <ul className="mt-4 space-y-1.5 text-sm text-slate-600">
                  {p.guarantees.slice(0, 5).map((g: any) => (
                    <li key={g.id} className="flex items-start gap-2">
                      <span className="text-brand-600">✓</span>
                      {g.guarantee.name}
                      {g.annualLimit ? <span className="ml-auto text-xs text-slate-400">plafond {fcfa(g.annualLimit)}</span> : null}
                    </li>
                  ))}
                </ul>
                <Link to="/offres" className={`mt-5 w-full ${i === 1 ? 'btn-primary' : 'btn-outline'}`}>Voir la formule</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="entreprises" className="mx-auto max-w-6xl px-4 py-14 grid gap-8 md:grid-cols-2 items-center">
        <div>
          <span className="badge bg-slate-900 text-white">Entreprises</span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold">Couverture santé collective pour vos salariés</h2>
          <p className="mt-3 text-slate-600">
            Importez la liste de vos salariés en un fichier Excel/CSV, souscrivez le contrat collectif et laissez chaque salarié gérer sa carte et ses remboursements.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            <li>✓ Détection automatique des doublons avant importation</li>
            <li>✓ Suivi des entrées et sorties de personnel</li>
            <li>✓ Cotisations centralisées et reçus téléchargeables</li>
          </ul>
        </div>
        <div className="card p-6 bg-gradient-to-br from-slate-50 to-brand-50">
          <table className="w-full text-left text-xs">
            <thead><tr className="th"><th>Nom</th><th>Prénom</th><th>Fonction</th><th>Ayants droit</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {[['AHOUANDJINOU','Rodrigue','Chauffeur senior','—'],['TOSSOU','Nadège','Comptable','2 enfants'],['SOUMANOU','Ibrahim','Magasinier','Conjoint']].map(r => (
                <tr key={r[0]}>{r.map(c => <td key={c} className="td whitespace-nowrap">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-center text-[11px] text-slate-400">Import CSV validé ligne par ligne</p>
        </div>
      </section>

      <section id="reseau" className="bg-brand-800 text-white py-14">
        <div className="mx-auto max-w-6xl px-4 grid gap-8 md:grid-cols-3 items-center">
          <div className="md:col-span-2">
            <h2 className="text-2xl sm:text-3xl font-bold">Un réseau de soins partenaires partout au Bénin</h2>
            <p className="mt-3 text-brand-100">
              Hôpitaux, cliniques, pharmacies, laboratoires et spécialistes conventionnés.
              Trouvez « une pharmacie près de moi » ou « une clinique à Cotonou » directement dans l’application.
            </p>
          </div>
          <div className="card bg-white/10 border-white/20 p-6 text-center">
            <p className="text-4xl font-extrabold">{providerCount || '12'}+</p>
            <p className="mt-1 text-sm text-brand-100">établissements partenaires référencés dans la démo</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-center text-2xl sm:text-3xl font-bold">Questions fréquentes</h2>
        <div className="mt-6 space-y-2" id="faq">
          {FAQ.map(([q, a], i) => (
            <div key={q} className="card overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between px-5 py-4 text-left font-medium">
                {q}
                <span className="text-slate-400">{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && <p className="px-5 pb-4 text-sm text-slate-600">{a}</p>}
            </div>
          ))}
        </div>
        <div className="mt-10 card-p text-center bg-gradient-to-r from-brand-600 to-brand-700 text-white border-brand-600">
          <h3 className="text-xl font-bold">Prêt à protéger votre famille ?</h3>
          <p className="mt-1 text-brand-100">Souscription en ligne, effective dès paiement.</p>
          <Link to="/offres" className="mt-4 btn bg-white text-brand-800 hover:bg-brand-50 px-6">Souscrire maintenant</Link>
        </div>
      </section>
    </div>
  );
}

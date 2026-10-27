import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fcfa, ticketModerateurLabel, CATEGORY_LABELS, CATEGORY_WAITING_LABELS } from '../format';

export default function Offers() {
  const [products, setProducts] = useState<any[]>([]);
  const [detail, setDetail] = useState<any | null>(null);

  useEffect(() => {
    api.get<any[]>('/products?clientType=INDIVIDUAL').then(setProducts).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-center">Choisissez votre formule</h1>
      <p className="mt-2 text-center text-stone">Cotisation annuelle pour l'assuré principal. Conjoint et enfants en supplément.</p>
      <div className="mt-2 text-center"><Link to="/cga" className="font-mono text-xs font-bold uppercase tracking-widest text-brand-700 hover:underline">📋 Consulter les Conditions Générales →</Link></div>
      <div className="mt-4 card-p bg-brand-50 border-brand-100 text-center">
        <p className="text-sm text-slate-600">Famille, entreprise, budget soins : estimez prime, budget et risque d'épuisement avant de souscrire.</p>
        <Link to="/simulateur" className="btn-primary btn-sm mt-3">📊 Ouvrir le simulateur commercial</Link>
        <p className="mt-1 text-[11px] text-slate-600">Estimation indicative, sans engagement.</p>
      </div>

      <div className="mt-8 card-p text-center">
        <p className="text-sm text-slate-600">Choisissez une formule dans le tableau ci-dessous, puis souscrivez en ligne.</p>
        <Link to="/app/souscrire" className="btn-primary mt-3">Souscrire maintenant</Link>
      </div>

      {/* Structure de cotisation — conforme prompt mutualité agréée */}
      <section className="mt-12 space-y-8">
        <div className="card-p">
          <h2 className="text-xl font-bold">Nos 4 formules d'adhésion</h2>
          <p className="mt-1 text-sm text-slate-600">Cotisation annuelle pour l'assuré principal. Modulation par tranche d'âge (voir tableau ci-dessous).</p>
          {/* tabIndex + role="region" nommé : à 390 px le tableau défile
              horizontalement, une zone défilante inatteignable au clavier est
              une violation axe `scrollable-region-focusable` (sérieuse). */}
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Formules d'adhésion — cotisations annuelles et mensuelles (défilement horizontal)">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-stone"><th className="py-2">Formule</th><th>Cotisation annuelle</th><th>Cotisation mensuelle</th><th>Plafond annuel</th><th>Cible</th></tr></thead>
              <tbody>
                <tr className="border-t border-mist"><td className="py-2 font-semibold">Essentielle</td><td>À partir de 25 000 FCFA</td><td>2 100 FCFA</td><td>600 000 FCFA</td><td>Étudiants, jeunes actifs informels</td></tr>
                <tr className="border-t border-mist"><td className="py-2 font-semibold">Confort</td><td>À partir de 28 000 FCFA</td><td>2 350 FCFA</td><td>1 800 000 FCFA</td><td>TPE/PME, professions libérales</td></tr>
                <tr className="border-t border-mist"><td className="py-2 font-semibold">Famille</td><td>À partir de 75 000 FCFA</td><td>6 250 FCFA</td><td>3 000 000 FCFA</td><td>Ménages : forfait 2 adultes + 3 enfants, suppléments au-delà (30 000 FCFA/adulte, 18 000 FCFA/enfant)</td></tr>
                <tr className="border-t border-mist"><td className="py-2 font-semibold">Entreprise</td><td>À partir de 19 000 FCFA/adhérent</td><td>Sur devis</td><td>Personnalisable</td><td>Entreprises ≥ 10 salariés</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card-p">
          <h2 className="text-xl font-bold">Modulation par tranche d'âge</h2>
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Modulation par tranche d'âge (défilement horizontal)">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-stone"><th className="py-2">Tranche d'âge</th><th>Essentielle (FCFA/an)</th><th>Confort (FCFA/an)</th><th>Coefficient vs 15-29 ans</th></tr></thead>
              <tbody>
                <tr className="border-t border-mist"><td className="py-2">15-29 ans</td><td>25 000</td><td>28 000</td><td>× 1,00 (référence)</td></tr>
                <tr className="border-t border-mist"><td className="py-2">30-39 ans</td><td>25 000</td><td>33 000</td><td>× 1,00 / 1,18</td></tr>
                <tr className="border-t border-mist"><td className="py-2">40-49 ans</td><td>27 000</td><td>40 000</td><td>× 1,08 / 1,43</td></tr>
                <tr className="border-t border-mist"><td className="py-2">50-59 ans</td><td>33 000</td><td>50 000</td><td>× 1,32 / 1,79</td></tr>
                <tr className="border-t border-mist"><td className="py-2">60 ans et plus</td><td>42 000</td><td>65 000</td><td>× 1,68 / 2,32</td></tr>
              </tbody>
            </table>
          </div>              <p className="mt-2 text-xs text-slate-600">Ratio maximal entre la tranche la plus basse et la plus élevée : 1,87 (conformément à la Loi 2015-30).</p>
        </div>

        <div className="card-p">
          <h2 className="text-xl font-bold">Panier de soins — taux de prise en charge</h2>
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Panier de soins — taux de prise en charge par formule (défilement horizontal)">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-stone"><th className="py-2">Catégorie de soins</th><th>Essentielle</th><th>Confort</th><th>Famille</th><th>Entreprise</th></tr></thead>
              <tbody>
                {[
                  ['Consultation médecine générale','70 %','85 %','90 %','85 %'],
                  ['Consultation spécialisée','Non','75 %','85 %','85 %'],
                  ['Examens biologiques','50 %','70 %','80 %','70 %'],
                  ['Examens radiologiques','Non','70 %','80 %','85 %'],
                  ['Pharmacie sur ordonnance','60 %','70 %','75 %','70 %'],
                  ['Hospitalisation (médecine)','60 %','75 %','85 %','70 %'],
                  ['Hospitalisation (chirurgie)','Non','70 %','80 %','90 %'],
                  ['Maternité (accouchement)','Non','100 %','85 %','100 %'],
                  ['Soins dentaires','Non','60 %','70 %','Non'],
                  ['Optique','Non','100 %','70 %','Non'],
                  ['Prévention (vaccins, dépistages)','Non','Non','Non','Non'],
                  ['Téléconsultation','Non','Non','Non','Non'],
                ].map(([cat,e,c,f,en]) => (
                  <tr key={cat} className="border-t border-mist"><td className="py-2">{cat}</td><td>{e}</td><td>{c}</td><td>{f}</td><td>{en}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-600">Taux brut avant plafonds et barème médical. Chaque ligne peut être plafonnée par acte (ex. hospitalisation : 45 000 FCFA/jour). Le ticket modérateur complète le taux (taux + ticket = 100 %).</p>
        </div>

        <div className="card-p">
          <h2 className="text-xl font-bold">Délais de carence</h2>
          <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Délais de carence par catégorie de soins (défilement horizontal)">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-stone"><th className="py-2">Catégorie de soins</th><th>Délai de carence</th></tr></thead>
              <tbody>
                {[
                  ['Consultations médecine générale', CATEGORY_WAITING_LABELS['CONSULTATION'] ?? '30 jours'],
                  ['Consultations spécialisées', CATEGORY_WAITING_LABELS['SPECIALIZED'] ?? '15 jours'],
                  ['Examens biologiques', CATEGORY_WAITING_LABELS['LABORATORY'] ?? '15 jours'],
                  ['Examens radiologiques', CATEGORY_WAITING_LABELS['RADIOLOGY'] ?? 'Non couvert (voir labo)'],
                  ['Pharmacie sur ordonnance', CATEGORY_WAITING_LABELS['PHARMACY'] ?? '30 jours'],
                  ['Hospitalisation (médecine)', CATEGORY_WAITING_LABELS['HOSPITALIZATION'] ?? '90 jours'],
                  ['Hospitalisation (chirurgie)', CATEGORY_WAITING_LABELS['SURGERY'] ?? '90 jours'],
                  ['Maternité (accouchement)', CATEGORY_WAITING_LABELS['MATERNITY'] ?? '10 mois'],
                  ['Soins dentaires', CATEGORY_WAITING_LABELS['DENTAL'] ?? '6 mois'],
                  ['Optique', CATEGORY_WAITING_LABELS['OPTICAL'] ?? '12 mois'],
                  ['Prévention (vaccins, dépistages)', CATEGORY_WAITING_LABELS['PREVENTION'] ?? 'Aucun'],
                  ['Téléconsultation', CATEGORY_WAITING_LABELS['TELECONSULT'] ?? 'Aucun'],
                  ['Affections chroniques préexistantes déclarées', CATEGORY_WAITING_LABELS['CHRONIC'] ?? '12 mois'],
                ].map(([cat,d]) => (
                  <tr key={cat} className="border-t border-mist"><td className="py-2">{cat}</td><td>{d}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">
            <b>Option payante — rachat de carence hospitalisation</b> : sur les formules individuelles,
            le délai de 90 jours peut être levé dès l’activation contre une surprime de 25 % de la
            cotisation annuelle et une déclaration de santé. La maternité, le dentaire et l’optique
            conservent leur délai : ce sont les postes les plus prévisibles, donc les plus exposés à
            l’anti-sélection.
          </p>
        </div>

        <div className="card-p">
          <h2 className="text-xl font-bold">Exclusions principales</h2>
          <ul className="mt-3 list-disc pl-5 text-sm space-y-1 text-slate-700">
            <li>Soins esthétiques et cosmétiques</li>
            <li>Médecines douces non conventionnées</li>
            <li>Cures thermales et thermalisme</li>
            <li>Orthodontie adulte, implants hors protocole, chirurgie réfractive</li>
            <li>Affections liées à la consommation d'alcool ou de stupéfiants</li>
            <li>Blessures auto-infligées et tentatives de suicide</li>
            <li>Accidents du travail et maladies professionnelles (CNSS)</li>
            <li>Accidents de la route responsables (assurance auto)</li>
            <li>Soins à l'étranger hors zone CEDEAO (sauf urgence vitale)</li>
            <li>Prothèses et implants hors liste nationale</li>
            <li>PMA/AMP et FIV (hors panier de base)</li>
            <li>Affections préexistantes non déclarées</li>
          </ul>
        </div>
      </section>

      <div className="mt-12 card-p bg-slate-900 text-white border-slate-900">
        <h2 className="text-lg font-bold">Vous êtes une entreprise ?</h2>
        <p className="mt-1 text-sm text-slate-300">
          Créez un compte entreprise depuis la page d’inscription entreprise, importez vos salariés par CSV et souscrivez le contrat collectif.
        </p>
        <Link to="/login" className="btn-outline mt-3 btn-sm">Contact commercial dans l’espace support</Link>
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="card max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="font-bold">{detail.name} — conditions</h3>
              <button onClick={() => setDetail(null)} className="text-slate-600">✕</button>
            </div>
            <h4 className="label mt-4">Garanties</h4>
            <table className="w-full text-sm">
              <thead><tr><th className="th">Garantie</th><th className="th">Taux de remboursement</th><th className="th">Ticket modérateur</th><th className="th">Plafond annuel</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {detail.guarantees.map((g: any) => (
                  <tr key={g.id}>
                    <td className="td">{CATEGORY_LABELS[g.guarantee.category]}</td>
                    <td className="td">{g.rate}%</td>
                    <td className="td font-semibold text-emerald-700">{ticketModerateurLabel(g.rate)}</td>
                    <td className="td">{g.annualLimit == null ? 'Illimité' : fcfa(g.annualLimit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-600">Le ticket modérateur complète le taux (taux + ticket = 100 %). Remboursement réel après barème, plafonds et plafond annuel de reste à charge.</p>
            {detail.exclusions?.length > 0 && (
              <>
                <h4 className="label mt-4">Exclusions</h4>
                <ul className="list-disc pl-5 text-sm text-slate-600">
                  {detail.exclusions.map((x: any) => <li key={x.id}>{x.description}</li>)}
                </ul>
              </>
            )}
            <h4 className="label mt-4">Conditions</h4>
            <ul className="list-disc pl-5 text-sm text-slate-600">
              {detail.oopAnnualCap != null && <li className="font-semibold text-emerald-700">Reste à charge maximum : {fcfa(detail.oopAnnualCap)}/an pour les soins éligibles</li>}
              <li>Âge : de {detail.minAge} à {detail.maxAge} ans</li>
              <li>Délai de carence : {detail.waitingPeriodDays > 0 ? `${detail.waitingPeriodDays} jours` : 'aucun'}</li>
              <li>Ayants droit autorisés : conjoint{detail.beneficiaryRules?.childMaxAge ? `, enfants < ${detail.beneficiaryRules.childMaxAge} ans` : ''}</li>
              {detail.eligibilityConditions && <li>{detail.eligibilityConditions}</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

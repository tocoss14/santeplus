import { Link } from 'react-router-dom';

/**
 * IPID — Document d'information produit (ARSS, Loi n° 2015-30 du 10 août 2015).
 *
 * Toutes les valeurs sont celles réellement appliquées par le moteur en
 * production (GET /api/products : prix, coefficients d'âge, taux, plafonds,
 * barèmes, carences, exclusions). Un IPID qui divergerait de la grille servie
 * est un document juridiquement faux : toute correction part de la production,
 * jamais l'inverse. En cas d'écart, les Conditions Générales (/cga) prévalent.
 */
export default function Ipid() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <h1 className="text-2xl font-bold">IPID — Information produit (formules individuelles et collectives)</h1>
      <p className="text-sm text-stone">Document d'information sur le produit d'assurance santé — conforme aux normes ARSS et à la Loi n° 2015-30 du 10 août 2015.</p>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-2">
        <p>
          <strong>Lecture des plafonds :</strong> tout montant est annuel et par assuré. Le barème « max par unité »
          s'applique à <strong>chaque</strong> journée d'hospitalisation et à chaque acte : une hospitalisation de
          3 journées est donc plafonnée à 3 × 45 000 FCFA. Une ordonnance, un équipement ou un forfait reste
          plafonné une seule fois, quel que soit le nombre de boîtes ou de pièces.
        </p>
        <p>
          <strong>Exclus toutes formules :</strong> soins esthétiques, médecines douces non conventionnées,
          cures thermales, orthodontie adulte, accidents du travail (CNSS), affection liée à l'alcool ou aux
          stupéfiants.
        </p>
      </div>

      <section className="card-p">
        <h2 className="font-semibold mb-2">Essentielle</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Type de contrat</th><td>Mutuelle santé individuelle (INDIVIDUEL)</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Durée</th><td>1 an renouvelable</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Cotisation annuelle</th><td>Assuré principal seul : 25 000 FCFA (15-39 ans) / 27 000 FCFA (40-49 ans) / 33 000 FCFA (50-59 ans) / 42 000 FCFA (60 ans et plus) — base 25 000 × coefficient 1,00 / 1,08 / 1,32 / 1,68. Adulte supplémentaire 25 000 FCFA/an, enfant 15 000 FCFA/an. Paiement trimestriel × 1,03, mensuel × 1,06.</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Ayants droit</th><td>6 maximum — conjoint et enfants jusqu'à 21 ans</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Plafonds annuels</th><td>600 000 FCFA global par assuré · reste à charge 200 000 FCFA — hospitalisation 150 000 · consultation 100 000 · pharmacie 180 000 · analyses 30 000</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Taux de prise en charge</th><td>Consultation 70%, Hospitalisation 60%, Pharmacie 60%, Analyses 50%</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Barème (max par unité)</th><td>Consultation 10 000/acte · Hospitalisation 45 000/journée · Pharmacie 15 000/ordonnance · Analyses 10 000/acte</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Délai de carence</th><td>Soins externes 30 jours, hospitalisation 90 jours — maternité non couverte</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Exclusions</th><td>Maternité, soins spécialisés, dentaire, optique</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-p">
        <h2 className="font-semibold mb-2">Confort</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Type</th><td>Mutuelle santé individuelle</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Durée</th><td>1 an renouvelable</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Cotisation annuelle</th><td>Assuré principal seul : 28 000 FCFA (15-29) / 33 040 FCFA (30-39) / 40 040 FCFA (40-49) / 50 120 FCFA (50-59) / 64 960 FCFA (60+) — base 28 000 × coefficient 1,00 / 1,18 / 1,43 / 1,79 / 2,32. Enfant 22 000 FCFA/an. Paiement trimestriel × 1,03, mensuel × 1,06.</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Ayants droit</th><td>8 maximum — conjoint et enfants jusqu'à 25 ans</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Plafonds annuels</th><td>1 800 000 FCFA global par assuré · reste à charge 150 000 FCFA — hospitalisation 500 000 · pharmacie 360 000 · consultation 144 000 · soins spécialisés 200 000 · analyses 75 000 · maternité 200 000 (forfait) · dentaire 40 000 · optique 30 000 tous les 2 ans</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Taux de prise en charge</th><td>Consultation 80%, Hospitalisation 75%, Pharmacie 70%, Analyses 70%, Soins spécialisés 70%, Maternité 100%, Dentaire 60%, Optique 100%</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Barème (max par unité)</th><td>Consultation 12 000/acte · Hospitalisation 45 000/journée · Pharmacie 30 000/ordonnance · Analyses, soins spécialisés et dentaire 15 000/acte — maternité et optique sont des forfaits : aucun barème ne s'y ajoute</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Délai de carence</th><td>Soins externes 30 jours, hospitalisation 90 jours, maternité 10 mois</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Exclusions</th><td>Aucune exclusion de catégorie</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-p">
        <h2 className="font-semibold mb-2">Famille</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Type</th><td>Mutuelle santé familiale (2 adultes + jusqu'à 3 enfants)</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Durée</th><td>1 an renouvelable</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Cotisation annuelle</th><td>75 000 FCFA par foyer — conjoint et enfants inclus, sans supplément par ayant droit. Paiement trimestriel × 1,03, mensuel × 1,06.</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Ayants droit</th><td>5 maximum — conjoint et enfants jusqu'à 21 ans</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Plafonds annuels</th><td>3 000 000 FCFA global par assuré · reste à charge 200 000 FCFA — hospitalisation 800 000 · pharmacie 400 000 · maternité 400 000 · soins spécialisés 300 000 · consultation 200 000 · analyses 100 000 · dentaire 80 000 · optique 60 000</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Taux de prise en charge</th><td>Consultation 90%, Hospitalisation 85%, Soins spécialisés 85%, Maternité 85%, Analyses 80%, Pharmacie 75%, Dentaire 70%, Optique 70%</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Barème (max par unité)</th><td>Consultation 12 000/acte · Hospitalisation 45 000/journée · Pharmacie 30 000/ordonnance · Analyses, soins spécialisés et dentaire 15 000/acte — maternité et optique sont des forfaits</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Délai de carence</th><td>Soins externes 30 jours, hospitalisation 90 jours, maternité 9 mois</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Exclusions</th><td>Aucune exclusion de catégorie</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-p">
        <h2 className="font-semibold mb-2">Entreprise (Performance et Cadre/VIP)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Type</th><td>Mutuelle santé collective (B2B), cotisation par adhérent salarié</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Durée</th><td>1 an renouvelable</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Cotisation annuelle</th><td>Entreprise Performance : 120 000 FCFA/an par adhérent (10 000 FCFA/mois, partagés 5 000 employeur + 5 000 salarié) · Entreprise Cadre/VIP : 240 000 FCFA/an (20 000 FCFA/mois, 10 000 + 10 000). Enfant : 48 000 FCFA/an (Performance) / 96 000 FCFA/an (Cadre/VIP). Paiement trimestriel × 1,03, mensuel × 1,06.</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Ayants droit</th><td>6 maximum (enfants jusqu'à 23 ans) en Performance · 8 maximum (jusqu'à 25 ans) en Cadre/VIP</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Plafonds annuels par salarié</th><td>500 000 FCFA (Performance) · 1 200 000 FCFA (Cadre/VIP) · reste à charge 150 000 / 100 000 FCFA</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Taux — Performance</th><td>Hospitalisation 70% (350 000/an), Consultation 70% (120 000/an), Pharmacie 70% (300 000/an), Analyses 70% (50 000/an), Maternité 100% (forfait 150 000) — dentaire, optique et soins spécialisés exclus</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Taux — Cadre/VIP</th><td>Hospitalisation 90% (1 000 000/an), Consultation 90% (240 000/an), Pharmacie 85% (480 000/an), Analyses 85% (150 000/an), Soins spécialisés 85% (400 000/an), Maternité 85% (300 000/an), Dentaire 70% (60 000/an), Optique 60% (50 000/an)</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Barème (max par unité)</th><td>Hospitalisation 45 000/journée (les deux formules) · Consultation 10 000/acte (Performance) et 20 000/acte (Cadre/VIP) · Pharmacie 25 000/ordonnance et 40 000/ordonnance · Analyses 10 000/acte et 25 000/acte</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Délai de carence</th><td>Soins externes 15 jours, hospitalisation 90 jours, maternité 10 mois</td></tr>
              <tr className="border-t border-mist"><th scope="row" className="py-2 pr-3 text-left align-top font-semibold">Entente préalable</th><td>Obligatoire sur Cadre/VIP, et au-delà de 150 000 FCFA sur Performance (urgences vitales exceptées)</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-6 text-xs text-slate-500">
        <p>Ce document est fourni à titre informatif. Les conditions générales du contrat prévalent sur toute autre information.</p>
        <Link to="/cga" className="font-semibold text-brand-700 hover:underline">Consulter les Conditions Générales →</Link>
      </div>
    </div>
  );
}

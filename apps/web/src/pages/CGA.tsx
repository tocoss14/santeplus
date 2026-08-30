import { Link } from 'react-router-dom';

const FORMULAS = [
  {
    code: 'ESS',
    name: 'Santé Essentielle',
    tagline: 'Gestion du risque de base',
    monthlyPrice: '6 000',
    adultPrice: '4 000',
    childPrice: '4 000',
    copay: '30%',
    globalCap: '500 000',
    ageLoading: '1,0 à 1,4',
    waitingDefault: '30 jours',
    waitingHospitalization: '90 jours',
    waitingMaternity: 'Non couverte',
    guarantees: [
      { category: 'Consultation généraliste', rate: '70%', cap: '100 000/an', perAct: '10 000/acte', copay: '30%' },
      { category: 'Hospitalisation', rate: '60%', cap: '150 000/an', perAct: '45 000/jour', copay: '40%', franchise: '10 000 fixe' },
      { category: 'Pharmacie', rate: '60%', cap: '180 000/an', perAct: '15 000/ordonnance', copay: '40%' },
      { category: 'Analyses & labos', rate: '50%', cap: '30 000/an', perAct: '10 000/acte', copay: '50%' },
    ],
    exclusions: ['Maternité', 'Soins spécialisés', 'Dentaire', 'Optique'],
    maxBeneficiaries: 6,
    childMaxAge: '21 ans',
  },
  {
    code: 'CONF',
    name: 'Santé Confort',
    tagline: 'Équilibre couverture / rentabilité',
    monthlyPrice: '12 000',
    adultPrice: '9 000',
    childPrice: '9 000',
    copay: '20%',
    globalCap: '1 200 000',
    ageLoading: '1,0 à 1,55',
    waitingDefault: '30 jours',
    waitingHospitalization: '90 jours',
    waitingMaternity: '10 mois',
    guarantees: [
      { category: 'Consultation généraliste', rate: '80%', cap: '144 000/an', perAct: '12 000/acte', copay: '20%' },
      { category: 'Hospitalisation', rate: '75%', cap: '500 000/an', perAct: '45 000/jour', copay: '25%', franchise: '10 000 fixe' },
      { category: 'Pharmacie', rate: '70%', cap: '360 000/an', perAct: '30 000/ordonnance', copay: '30%' },
      { category: 'Analyses & imagerie', rate: '70%', cap: '75 000/an', perAct: '15 000/acte', copay: '30%' },
      { category: 'Soins spécialisés', rate: '70%', cap: '200 000/an', perAct: '15 000/acte', copay: '30%', limit: '5 consultations/an' },
      { category: 'Maternité', rate: '100%', cap: '200 000 (forfait)', perAct: '—', copay: '—', franchise: '10 000 fixe' },
      { category: 'Dentaire', rate: '60%', cap: '40 000/an', perAct: '15 000/acte', copay: '40%' },
      { category: 'Optique', rate: '100%', cap: '30 000 / 2 ans', perAct: '—', copay: '—' },
    ],
    exclusions: [],
    maxBeneficiaries: 8,
    childMaxAge: '25 ans',
  },
  {
    code: 'EXC',
    name: 'Santé Excellence',
    tagline: 'Haute gamme pour cadres',
    monthlyPrice: '25 000',
    adultPrice: '20 000',
    childPrice: '20 000',
    copay: '10%',
    globalCap: '3 000 000',
    ageLoading: '1,0 à 1,7',
    waitingDefault: '30 jours',
    waitingHospitalization: '90 jours',
    waitingMaternity: '10 mois',
    guarantees: [
      { category: 'Consultations (gén. + spé.)', rate: '90%', cap: '300 000/an', perAct: '25 000/acte', copay: '10%' },
      { category: 'Hospitalisation', rate: '90%', cap: '1 500 000/an', perAct: '45 000/jour', copay: '10%', franchise: '10 000 fixe' },
      { category: 'Pharmacie', rate: '90%', cap: '600 000/an', perAct: '40 000/ordonnance', copay: '10%' },
      { category: 'Analyses, labos, imagerie', rate: '90%', cap: '250 000/an', perAct: '25 000/acte', copay: '10%' },
      { category: 'Soins spécialisés', rate: '90%', cap: '500 000/an', perAct: '25 000/acte', copay: '10%' },
      { category: 'Maternité', rate: '80%', cap: '400 000/an', perAct: '—', copay: '20%' },
      { category: 'Dentaire', rate: '80%', cap: '100 000/an', perAct: '15 000/acte', copay: '20%' },
      { category: 'Optique', rate: '70%', cap: '80 000 / 2 ans', perAct: '—', copay: '30%' },
    ],
    exclusions: [],
    maxBeneficiaries: 10,
    childMaxAge: '26 ans',
    priorAuth: true,
  },
  {
    code: 'ENT-PERF',
    name: 'Entreprise Performance',
    tagline: 'Collectif à co-partage',
    monthlyPrice: '10 000',
    adultPrice: '5 000 employ. + 5 000 sal.',
    childPrice: '4 000',
    copay: '30%',
    globalCap: '500 000',
    ageLoading: '—',
    waitingDefault: '15 jours',
    waitingHospitalization: '90 jours',
    waitingMaternity: '10 mois',
    guarantees: [
      { category: 'Hospitalisation', rate: '70%', cap: '350 000/an', perAct: '45 000/jour', copay: '30%', franchise: '10 000 fixe' },
      { category: 'Consultations', rate: '70%', cap: '120 000/an', perAct: '10 000/acte', copay: '30%' },
      { category: 'Pharmacie', rate: '70%', cap: '300 000/an', perAct: '25 000/ordonnance', copay: '30%' },
      { category: 'Analyses', rate: '70%', cap: '50 000/an', perAct: '10 000/acte', copay: '30%' },
      { category: 'Maternité', rate: '100%', cap: '150 000 (forfait)', perAct: '—', copay: '—', franchise: '10 000 fixe' },
    ],
    exclusions: ['Dentaire', 'Optique', 'Soins spécialisés'],
    maxBeneficiaries: 6,
    childMaxAge: '23 ans',
  },
  {
    code: 'ENT-VIP',
    name: 'Entreprise Cadre / VIP',
    tagline: 'Couverture premium collective',
    monthlyPrice: '20 000',
    adultPrice: '10 000 employ. + 10 000 sal.',
    childPrice: '8 000',
    copay: '10%',
    globalCap: '1 200 000',
    ageLoading: '—',
    waitingDefault: '15 jours',
    waitingHospitalization: '90 jours',
    waitingMaternity: '10 mois',
    guarantees: [
      { category: 'Hospitalisation', rate: '90%', cap: '1 000 000/an', perAct: '45 000/jour', copay: '10%', franchise: '10 000 fixe' },
      { category: 'Consultations', rate: '90%', cap: '240 000/an', perAct: '20 000/acte', copay: '10%' },
      { category: 'Pharmacie', rate: '85%', cap: '480 000/an', perAct: '40 000/ordonnance', copay: '15%' },
      { category: 'Analyses & imagerie', rate: '85%', cap: '150 000/an', perAct: '25 000/acte', copay: '15%' },
      { category: 'Soins spécialisés', rate: '85%', cap: '400 000/an', perAct: '25 000/acte', copay: '15%' },
      { category: 'Maternité', rate: '85%', cap: '300 000/an', perAct: '—', copay: '15%' },
      { category: 'Dentaire', rate: '70%', cap: '60 000/an', perAct: '15 000/acte', copay: '30%' },
      { category: 'Optique', rate: '60%', cap: '50 000 / 2 ans', perAct: '—', copay: '40%' },
    ],
    exclusions: [],
    maxBeneficiaries: 8,
    childMaxAge: '25 ans',
    priorAuth: true,
  },
];

const COST_CONTROL_MECHANISMS = [
  {
    title: '🎫 Ticket modérateur (Copay)',
    description: "L'assuré paie toujours une partie des frais (10% à 50% selon la formule et la catégorie). Cela responsabilise l'assuré et freine la surconsommation de soins non nécessaires.",
    detail: 'Exemple : une consultation à 15 000 FCFA avec un copay de 30% → la mutuelle rembourse 10 500 FCFA, l\'assuré paie 4 500 FCFA de sa poche.',
  },
  {
    title: '📋 Plafonds par acte (Barème médical)',
    description: "Chaque acte est plafonné à une valeur de référence. Si le prestataire facture au-dessus du tarif conventionné, la mutuelle ne rembourse qu'à hauteur du barème.",
    detail: 'Exemple : consultation généraliste bridée à 10 000 FCFA (Essentielle). Si le médecin facture 15 000 FCFA, la mutuelle calcul sur 10 000 FCFA. Les 5 000 FCFA de dépassement sont à la charge de l\'assuré.',
  },
  {
    title: '💰 Plafonds annuels stricts',
    description: "Chaque garantie (pharmacie, hospitalisation, labo…) a un plafond annuel en FCFA. Une fois le plafond atteint, l'assuré assume 100% des frais pour le reste de l'année.",
    detail: 'Cela protège la trésorerie de la mutuelle contre les gros consommateurs et les maladies chroniques.',
  },
  {
    title: '🛑 Plafond annuel global (Stop-loss)',
    description: "Au-delà du plafond de consommation globale par assuré (ex: 500 000 FCFA pour l'Essentielle), la mutuelle ne rembourse plus. C'est le filet de sécurité ultime.",
    detail: 'Ce mécanisme empêche les explosions de coûts sur les cas lourds (cancer, transplantation…) qui pourraient mettre en péril l\'équilibre technique.',
  },
  {
    title: '⏰ Délais de carence',
    description: "Période pendant laquelle certains soins ne sont pas remboursés après souscription. Cela empêche les souscriptions opportunistes (s'inscrire juste pour se faire soigner).",
    detail: 'Soins externes : 30 jours · Hospitalisation : 90 jours · Maternité : 10 mois (Confort/Excellence). La maternité n\'est pas couverte sur l\'Essentielle.',
  },
  {
    title: '📝 Entente préalable',
    description: "Pour tout acte coûteux (hospitalisation programmée, scanner, IRM, chirurgie), le médecin-conseil de la mutuelle doit valider l'acte AVANT sa réalisation.",
    detail: "Sans entente préalable, la mutuelle peut refuser le remboursement (sauf urgences vitales certifiées). C'est obligatoire sur Excellence et Cadre/VIP.",
  },
  {
    title: '🏥 Franchise fixe',
    description: "Montant fixe déduit du remboursement sur hospitalisation. L'assuré paie toujours cette franchise, quel que soit le montant de la facture.",
    detail: 'Franchise de 10 000 FCFA sur hospitalisation (toutes formules). Sur une hospitalisation de 100 000 FCFA remboursée à 75%, la franchise réduit le remboursement de 10 000 FCFA supplémentaires.',
  },
  {
    title: '🔬 Limite consultations spécialiste',
    description: "Nombre maximum de consultations chez un spécialiste par an. Au-delà, les consultations ne sont plus remboursées.",
    detail: 'Essentielle : 3 consultations spécialiste/an · Confort : 5 consultations spécialiste/an · Excellence : sans limite.',
  },
];

export default function CGA() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-10">
      {/* En-tête */}
      <div className="text-center">
        <h1 className="text-3xl font-extrabold text-slate-900">
          Conditions Générales d'Assurance
        </h1>
        <p className="mt-2 text-lg text-slate-500">
          SantéPlus Bénin — Formules d'assurance maladie v2.0
        </p>
        <p className="mt-1 text-sm text-slate-400">
          Version 2.0 · Équilibre Technique · Août 2026
        </p>
      </div>

      {/* Introduction */}
      <section className="card-p space-y-4">
        <h2 className="text-xl font-bold text-slate-900">1. Objet</h2>
        <p className="text-slate-600 leading-relaxed">
          Les présentes conditions générales définissent les règles applicables aux contrats d'assurance maladie
          proposés par SantéPlus Bénin, plateforme technologique d'intermédiation. Les contrats sont portés par
          des assureurs et mutuelles partenaires agréés conformément à la réglementation en vigueur au Bénin.
        </p>
        <p className="text-slate-600 leading-relaxed">
          SantéPlus agit en qualité de courtier technologique. L'assureur/mutuelle partenaire est le garant
          des engagements de couverture. Les tarifs, barèmes et garanties sont définis par la formule choisie
          lors de la souscription.
        </p>
      </section>

      {/* Tableau comparatif rapide */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">2. Résumé des formules</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="p-3 text-left font-semibold text-slate-600 min-w-[130px]">Formule</th>
                <th className="p-3 text-center font-semibold text-slate-600">Prix/mois</th>
                <th className="p-3 text-center font-semibold text-slate-600">Copay</th>
                <th className="p-3 text-center font-semibold text-slate-600">Plafond global/an</th>
                <th className="p-3 text-center font-semibold text-slate-600">Maternité</th>
                <th className="p-3 text-center font-semibold text-slate-600">Carence</th>
              </tr>
            </thead>
            <tbody>
              {FORMULAS.map((f, i) => (
                <tr key={f.code} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="p-3">
                    <div className="font-bold text-slate-800">{f.name}</div>
                    <div className="text-xs text-slate-400">{f.tagline}</div>
                  </td>
                  <td className="p-3 text-center font-bold text-brand-700">{f.monthlyPrice} F</td>
                  <td className="p-3 text-center font-semibold">{f.copay}</td>
                  <td className="p-3 text-center">{f.globalCap} F</td>
                  <td className="p-3 text-center text-xs">{f.waitingMaternity === 'Non couverte' ? <span className="text-red-500 font-medium">✗ Non</span> : <span className="text-emerald-600 font-medium">✓ {f.waitingMaternity}</span>}</td>
                  <td className="p-3 text-center text-xs">{f.waitingDefault}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Détail par formule */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900">3. Barèmes détaillés par formule</h2>
        {FORMULAS.map(f => (
          <div key={f.code} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-white">{f.name}</h3>
                <p className="text-sm text-slate-300">{f.tagline}</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <div className="text-2xl font-extrabold text-white">{f.monthlyPrice}<span className="text-sm font-normal"> F</span></div>
                  <div className="text-xs text-slate-400">Adhérent/mois</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-extrabold text-amber-300">{f.copay}</div>
                  <div className="text-xs text-slate-400">Copay</div>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Tarification */}
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-400 text-xs">Adhérent seul</div>
                  <div className="font-bold text-slate-800">{f.monthlyPrice} F/mois</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-400 text-xs">Conjoint / adulte</div>
                  <div className="font-bold text-slate-800">{f.adultPrice} F/mois</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-400 text-xs">Enfant</div>
                  <div className="font-bold text-slate-800">{f.childPrice} F/mois</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-slate-400 text-xs">Ayants droit max</div>
                  <div className="font-bold text-slate-800">{f.maxBeneficiaries} (max {f.childMaxAge})</div>
                </div>
              </div>

              {/* Délais de carence */}
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-2">⏳ Délais de carence</h4>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg border border-slate-200 p-3 text-center">
                    <div className="text-xs text-slate-400">Soins externes</div>
                    <div className="font-bold text-slate-800">{f.waitingDefault}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 text-center">
                    <div className="text-xs text-slate-400">Hospitalisation</div>
                    <div className="font-bold text-slate-800">{f.waitingHospitalization}</div>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3 text-center">
                    <div className="text-xs text-slate-400">Maternité</div>
                    <div className={`font-bold ${f.waitingMaternity === 'Non couverte' ? 'text-red-500' : 'text-slate-800'}`}>
                      {f.waitingMaternity}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tableau des garanties */}
              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-2">🛡️ Garanties et barèmes</h4>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="p-2.5 text-left text-xs font-semibold text-slate-600">Catégorie</th>
                        <th className="p-2.5 text-center text-xs font-semibold text-slate-600">Taux</th>
                        <th className="p-2.5 text-center text-xs font-semibold text-slate-600">Plafond/an</th>
                        <th className="p-2.5 text-center text-xs font-semibold text-slate-600">Max par acte</th>
                        <th className="p-2.5 text-center text-xs font-semibold text-slate-600">Copay</th>
                        <th className="p-2.5 text-center text-xs font-semibold text-slate-600">Franchise</th>
                        <th className="p-2.5 text-center text-xs font-semibold text-slate-600">Limite</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.guarantees.map((g, idx) => (
                        <tr key={g.category} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                          <td className="p-2.5 font-medium text-slate-700">{g.category}</td>
                          <td className="p-2.5 text-center font-bold text-brand-700">{g.rate}</td>
                          <td className="p-2.5 text-center text-slate-600">{g.cap}</td>
                          <td className="p-2.5 text-center text-slate-600">{g.perAct}</td>
                          <td className="p-2.5 text-center text-slate-600">{g.copay}</td>
                          <td className="p-2.5 text-center text-slate-600">{g.franchise ?? '—'}</td>
                          <td className="p-2.5 text-center text-xs text-slate-500">{'limit' in g ? (g as any).limit ?? '—' : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Exclusions */}
              {f.exclusions.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-2">❌ Exclusions</h4>
                  <div className="flex flex-wrap gap-2">
                    {f.exclusions.map(ex => (
                      <span key={ex} className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
                        {ex}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Entente préalable */}
              {f.priorAuth && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
                  <p className="font-bold text-amber-800">⚠️ Entente préalable obligatoire</p>
                  <p className="mt-1 text-amber-700">
                    Pour toute hospitalisation programmée, intervention chirurgicale ou acte d'imagerie (scanner, IRM),
                    une validation préalable du médecin-conseil est requise. Sans cette validation, la mutuelle
                    se réserve le droit de refuser le remboursement, sauf en cas d'urgence vitale certifiée.
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Mécanismes de contrôle des coûts */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">4. Mécanismes de maîtrise des coûts</h2>
        <p className="text-slate-600">
          Pour garantir la pérennité financière de la mutuelle et un résultat technique positif,
          les mécanismes suivants s'appliquent à toutes les formules :
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {COST_CONTROL_MECHANISMS.map(m => (
            <div key={m.title} className="card-p space-y-2">
              <h3 className="font-bold text-slate-800">{m.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{m.description}</p>
              <p className="text-xs text-slate-400 italic">{m.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Calcul de la franchise */}
      <section className="card-p space-y-4">
        <h2 className="text-xl font-bold text-slate-900">5. Ordre de calcul d'un remboursement</h2>
        <p className="text-sm text-slate-600">
          Pour chaque acte médical, le calcul du remboursement suit l'ordre strict suivant :
        </p>
        <ol className="space-y-3 text-sm text-slate-700">
          {[
            { step: '1', title: 'Vérification du statut du contrat', detail: 'Le contrat doit être ACTIF et les cotisations à jour.' },
            { step: '2', title: 'Vérification du délai de carence global', detail: 'Le soin doit intervenir après le délai de carence (30 jours soins externes, 90 jours hospitalisation).' },
            { step: '3', title: 'Vérification du délai de carence par catégorie', detail: 'Délai spécifique : maternité = 10 mois (Confort, Excellence, Entreprise).' },
            { step: '4', title: 'Vérification des exclusions', detail: 'Certaines catégories sont exclues de la formule (ex: dentaire, optique sur l\'Essentielle).' },
            { step: '5', title: 'Vérification du plafond annuel par catégorie', detail: 'Le plafond annuel de la catégorie doit avoir un reste disponible.' },
            { step: '6', title: 'Vérification du plafond annuel global', detail: 'La dépense totale de l\'assuré ne doit pas dépasser le stop-loss global.' },
            { step: '7', title: 'Bridage tarifaire (barème médical)', detail: 'Le montant est plafonné à la valeur de référence du barème (maxUnitPrice).' },
            { step: '8', title: 'Application de la franchise', detail: 'La franchise fixe (ex: 10 000 F) est déduite du montant éligible.' },
            { step: '9', title: 'Application du taux de couverture', detail: 'Le taux (ex: 70%, 80%, 90%) est appliqué sur le montant après franchise.' },
            { step: '10', title: 'Application du ticket modérateur (copay)', detail: 'Le copay (ex: 10%, 20%, 30%) est déduit du montant couvert.' },
            { step: '11', title: 'Vérification du global cap restant', detail: 'Le remboursement final est limité au plafond global annuel restant.' },
          ].map(s => (
            <li key={s.step} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                {s.step}
              </span>
              <div>
                <p className="font-semibold text-slate-800">{s.title}</p>
                <p className="text-xs text-slate-500">{s.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Réseau conventionné */}
      <section className="card-p space-y-4">
        <h2 className="text-xl font-bold text-slate-900">6. Réseau de soins conventionné</h2>
        <p className="text-sm text-slate-600 leading-relaxed">
          SantéPlus Bénin entretient des conventions avec un réseau de prestataires de soins au Bénin.
          En échange d'un flux garanti de patients, les prestataires conventionnés appliquent des tarifs
          préférentiels aux assurés SantéPlus (réduction de 10% à 20% sur les tarifs standards).
        </p>
        <p className="text-sm text-slate-600 leading-relaxed">
          Les prestataires conventionnés sont identifiés par un niveau de convention :
        </p>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-center">
            <div className="font-bold text-emerald-700">PREMIUM</div>
            <div className="text-xs text-emerald-600 mt-1">CHU, cliniques de référence</div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-center">
            <div className="font-bold text-blue-700">PLUS</div>
            <div className="text-xs text-blue-600 mt-1">Cliniques, labos, spécialistes</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
            <div className="font-bold text-slate-700">BASIC</div>
            <div className="text-xs text-slate-600 mt-1">Centres de santé, pharmacies</div>
          </div>
        </div>
      </section>

      {/* Obligations de l'assuré */}
      <section className="card-p space-y-4">
        <h2 className="text-xl font-bold text-slate-900">7. Obligations de l'assuré</h2>
        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex gap-2">
            <span className="text-brand-600 font-bold">•</span>
            <span>Payer les cotisations à échéance régulière. Le défaut de paiement entraîne la suspension après 45 jours de retard.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-600 font-bold">•</span>
            <span>Conserver toutes les factures et ordonnances originales pour tout dossier de remboursement.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-600 font-bold">•</span>
            <span>Demander l'entente préalable pour tout acte programmé dépassant le seuil indiqué.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-600 font-bold">•</span>
            <span>Signaler tout changement de situation familiale (mariage, naissance) sous 30 jours.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-600 font-bold">•</span>
            <span>Ne pas céder sa carte d'assuré à un tiers. Toute fraude entraîne la résiliation du contrat.</span>
          </li>
          <li className="flex gap-2">
            <span className="text-brand-600 font-bold">•</span>
            <span>Présenter sa carte d'assuré numérique (QR code) à chaque consultation.</span>
          </li>
        </ul>
      </section>

      {/* Contact */}
      <section className="card-p bg-gradient-to-r from-brand-50 to-brand-100 text-center space-y-3">
        <h2 className="text-xl font-bold text-brand-800">Des questions ?</h2>
        <p className="text-sm text-brand-700">
          Contactez notre service support pour toute question relative à vos conditions d'assurance.
        </p>
        <div className="flex justify-center gap-4 text-sm">
          <span className="font-semibold text-brand-800">📧 support@santeplus.bj</span>
          <span className="font-semibold text-brand-800">📞 +229 (0) 01 00 00 00</span>
        </div>
        <Link to="/" className="btn-primary mt-2 inline-block">Retour à l'accueil</Link>
      </section>
    </div>
  );
}

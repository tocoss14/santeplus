import { useState } from 'react';
import { Link } from 'react-router-dom';

const FAQS: { q: string; a: string }[] = [
  { q: 'Comment souscrire à une formule SantéPlus ?', a: 'Choisissez une formule sur la page « Nos formules », renseignez votre profil et vos ayants droit, puis payez par mobile money. La carte QR est générée immédiatement.' },
  { q: 'Quelles sont les formules disponibles ?', a: 'Quatre formules : Essentielle (25 000 FCFA/an), Confort (28 000 FCFA/an), Famille (75 000 FCFA/an pour le foyer : 2 adultes et 3 enfants) et Entreprise — Entreprise Performance (120 000 FCFA/an par adhérent, soit 10 000 FCFA/mois partagés entre l\'employeur et le salarié) ou Entreprise Cadre/VIP (240 000 FCFA/an par adhérent). Plafonds annuels par assuré : 600 000 FCFA (Essentielle), 1 800 000 FCFA (Confort), 3 000 000 FCFA (Famille), 500 000 FCFA (Entreprise Performance), 1 200 000 FCFA (Cadre/VIP).' },
  { q: 'Comment sont calculées les cotisations ?', a: 'La cotisation dépend de la formule, de la tranche d\'âge de l\'assuré principal et de la composition familiale. La modulation par âge va de 1,00 (15-29 ans) à 1,68 sur l\'Essentielle et 2,32 sur le Confort (60 ans et plus) ; les formules Famille et Entreprise ne sont pas modulées par l\'âge.' },
  { q: 'Quand puis-je bénéficier des prestations ?', a: 'Dès que le contrat est actif, après le délai de carence de votre formule : 30 jours pour les soins courants et 90 jours pour l\'hospitalisation (15 jours pour les soins courants en Entreprise), puis 10 mois pour la maternité — 9 mois sur la formule Famille. La maternité n\'est pas couverte par l\'Essentielle. Ces délais courent à partir de la date d\'effet du contrat.' },
  { q: 'Comment demander un remboursement ?', a: 'Téléversez la photo de l\'ordonnance et des factures depuis l\'application ou le portail. Le remboursement est traité sous 5 jours ouvrables.' },
  { q: 'Quels soins sont exclus ?', a: 'Soins esthétiques, médecines douces non conventionnées, cures thermales, orthodontie adulte, soins liés à l\'alcool/stupéfiants, accidents du travail (CNSS), etc. Voir la liste complète sur la page des formules.' },
  { q: 'Comment trouver un prestataire conventionné ?', a: 'Consultez le réseau de soins dans l\'application ou sur le site. Recherche par ville, spécialité et proximité.' },
  { q: 'Comment résilier mon contrat ?', a: 'La résiliation est possible selon les conditions générales. Contactez le service client pour la procédure et le délai de préavis.' },
  { q: 'Que faire en cas de réclamation ?', a: 'Adressez votre réclamation par écrit au service client (email ou courrier). En cas de désaccord, une médiation indépendante peut être saisie.' },
  { q: 'Les données de santé sont-elles protégées ?', a: 'Oui : chiffrement AES-256 au repos, TLS 1.3 en transit, hébergement souverain, conformité à la Loi 2017-20 sur la protection des données.' },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-center">Foire aux questions</h1>
      <p className="mt-2 text-center text-sm text-slate-500">Tout ce que vous devez savoir sur SantéPlus.</p>
      <div className="mt-8 space-y-3">
        {FAQS.map((f, i) => (
          <div key={i} className="card-p">
            <button className="w-full text-left font-semibold" onClick={() => setOpen(open === i ? null : i)}>
              {f.q}
            </button>
            {open === i && <p className="mt-2 text-sm text-slate-600">{f.a}</p>}
          </div>
        ))}
      </div>
      <div className="mt-8 text-center">
        <Link to="/offres" className="btn-primary">Voir les formules</Link>
      </div>
    </div>
  );
}

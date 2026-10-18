import { useState } from 'react';
import { Link } from 'react-router-dom';

const FAQS: { q: string; a: string }[] = [
  { q: 'Comment souscrire à une formule SantéPlus ?', a: 'Choisissez une formule sur la page « Nos formules », renseignez votre profil et vos ayants droit, puis payez par mobile money. La carte QR est générée immédiatement.' },
  { q: 'Quelles sont les formules disponibles ?', a: 'Quatre formules : Essentielle (15 000 FCFA/an), Confort (25 000 FCFA/an), Famille (78 000 FCFA/an) et Entreprise (à partir de 20 000 FCFA/adhérent).' },
  { q: 'Comment sont calculées les cotisations ?', a: 'La cotisation dépend de la formule, de la tranche d\'âge de l\'assuré principal et de la composition familiale. La modulation par âge respecte le ratio maximal de 1,87 prévu par la Loi 2015-30.' },
  { q: 'Quand puis-je bénéficier des prestations ?', a: 'Après le délai de carence propre à chaque catégorie de soins (7 jours pour les consultations, 3 mois pour l\'hospitalisation, 9 mois pour la maternité, etc.).' },
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

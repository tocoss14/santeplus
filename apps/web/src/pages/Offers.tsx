import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { fcfa, CATEGORY_LABELS } from '../format';

export default function Offers() {
  const [products, setProducts] = useState<any[]>([]);
  const [detail, setDetail] = useState<any | null>(null);

  useEffect(() => {
    api.get<any[]>('/products?clientType=INDIVIDUAL').then(setProducts).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-center">Choisissez votre formule</h1>
      <p className="mt-2 text-center text-slate-500">Cotisation annuelle pour l’assuré principal. Conjoint et enfants en supplément.</p>

      <div className="mt-8 space-y-4">
        {products.map(p => (
          <div key={p.id} className="card overflow-hidden sm:flex">
            <div className={`sm:w-64 p-6 ${p.code === 'CONF' ? 'bg-brand-600 text-white' : 'bg-brand-50'}`}>
              <h3 className={`font-bold text-lg ${p.code === 'CONF' ? '' : 'text-brand-800'}`}>{p.name}</h3>
              <p className={`mt-2 text-2xl font-extrabold ${p.code === 'CONF' ? '' : 'text-brand-700'}`}>{fcfa(p.basePremiumAnnual)}</p>
              <p className={`text-xs ${p.code === 'CONF' ? 'text-brand-100' : 'text-slate-400'}`}>par an — assuré principal</p>
              <Link to="/app/souscrire" state={{ productId: p.id }} className={`mt-4 w-full ${p.code === 'CONF' ? 'btn bg-white text-brand-800 hover:bg-brand-50' : 'btn-primary'}`}>
                Souscrire
              </Link>
            </div>
            <div className="flex-1 p-6">
              <p className="text-sm text-slate-600">{p.description}</p>
              <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {p.guarantees.map((g: any) => (
                  <div key={g.id} className="flex items-baseline justify-between gap-3 text-sm border-b border-dashed border-slate-100 pb-1.5">
                    <span>{CATEGORY_LABELS[g.guarantee.category] ?? g.guarantee.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {g.rate}% {g.annualLimit != null && `· plafond ${fcfa(g.annualLimit)}`}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                {p.insurerPartner?.name && <span>Porté par <b>{p.insurerPartner.name}</b></span>}
                {p.waitingPeriodDays > 0 && <span>Délai de carence : {p.waitingPeriodDays} j</span>}
                <button onClick={() => setDetail(p)} className="font-semibold text-brand-700 hover:underline">Détails & exclusions</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="mt-12 card-p bg-slate-900 text-white border-slate-900">
        <h2 className="text-lg font-bold">Vous êtes une entreprise ?</h2>
        <p className="mt-1 text-sm text-slate-300">
          Créez un compte entreprise depuis la page d’inscription entreprise, importez vos salariés par CSV et souscrivez le contrat collectif.
        </p>
        <Link to="/login" className="btn-outline mt-3 btn-sm">Contact commercial dans l’espace support</Link>
      </section>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDetail(null)}>
          <div className="card max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="font-bold">{detail.name} — conditions</h3>
              <button onClick={() => setDetail(null)} className="text-slate-400">✕</button>
            </div>
            <h4 className="label mt-4">Garanties</h4>
            <table className="w-full text-sm">
              <thead><tr><th className="th">Garantie</th><th className="th">Taux</th><th className="th">Plafond annuel</th><th className="th">Franchise</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {detail.guarantees.map((g: any) => (
                  <tr key={g.id}>
                    <td className="td">{CATEGORY_LABELS[g.guarantee.category]}</td>
                    <td className="td">{g.rate}%</td>
                    <td className="td">{g.annualLimit == null ? 'Illimité' : fcfa(g.annualLimit)}</td>
                    <td className="td">{g.deductibleType === 'NONE' ? '—' : g.deductibleType === 'FIXED' ? fcfa(g.deductibleValue) : `${g.deductibleValue}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

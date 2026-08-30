import { fcfa, CATEGORY_LABELS } from '../format';

interface Product {
  id: string;
  code: string;
  name: string;
  description?: string;
  basePremiumAnnual: number;
  pricePerAdditionalAdultAnnual: number;
  pricePerChildAnnual: number;
  waitingPeriodDays: number;
  globalAnnualCap?: number;
  eligibilityConditions?: string;
  guarantees: {
    annualLimit: number | null;
    rate: number | null;
    copayRate: number;
    deductibleType: string;
    deductibleValue: number;
    maxUnitPrice?: number | null;
    guarantee: { category: string; name: string };
  }[];
  exclusions: { categoryId: string; description: string }[];
}

function parseEligibility(conditions?: string): Record<string, any> {
  try { return JSON.parse(conditions ?? '{}'); } catch { return {}; }
}

function getGuarantee(product: Product, category: string) {
  return product.guarantees.find(g => g.guarantee.category === category);
}

const DISPLAY_CATEGORIES = [
  'CONSULTATION',
  'HOSPITALIZATION',
  'PHARMACY',
  'LABORATORY',
  'SPECIALIZED',
  'MATERNITY',
  'DENTAL',
  'OPTICAL',
] as const;

export default function FormulaComparisonTable({ products, selectedId, onSelect }: {
  products: Product[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 p-5 text-white">
        <h2 className="text-lg font-bold">Comparez nos formules</h2>
        <p className="mt-1 text-sm text-brand-100">
          Choisissez la couverture qui correspond à vos besoins et votre budget.
          Tous les tarifs sont en FCFA, tickets modérateurs inclus.
        </p>
      </div>

      {/* Tableau comparatif — Desktop */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 p-3 text-left font-semibold text-slate-600 min-w-[160px]">
                Garantie
              </th>
              {products.map(p => (
                <th key={p.id} className="p-3 text-center min-w-[140px]">
                  <button
                    onClick={() => onSelect(p.id)}
                    className={`w-full rounded-lg px-3 py-2 transition ${
                      selectedId === p.id
                        ? 'bg-brand-600 text-white shadow-md'
                        : 'bg-white text-slate-700 hover:bg-brand-50 border border-slate-200 hover:border-brand-300'
                    }`}
                  >
                    <div className="font-bold text-xs leading-tight">{p.name}</div>
                    <div className={`mt-1 text-lg font-extrabold ${selectedId === p.id ? 'text-white' : 'text-brand-700'}`}>
                      {fcfa(Math.round(p.basePremiumAnnual / 12))}<span className="text-xs font-normal">/mois</span>
                    </div>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Ticket modérateur */}
            <tr className="bg-slate-50/50">
              <td className="sticky left-0 z-10 bg-slate-50/95 p-3 font-semibold text-slate-700">
                🎫 Ticket modérateur
              </td>
              {products.map(p => {
                const elig = parseEligibility(p.eligibilityConditions);
                return (
                  <td key={p.id} className="p-3 text-center font-bold text-slate-800">
                    {elig.copayRate ?? 15}%
                  </td>
                );
              })}
            </tr>

            {/* Plafond annuel global */}
            <tr>
              <td className="sticky left-0 z-10 bg-white p-3 font-semibold text-slate-700">
                💰 Plafond annuel global
              </td>
              {products.map(p => (
                <td key={p.id} className="p-3 text-center font-medium text-slate-700">
                  {p.globalAnnualCap ? fcfa(p.globalAnnualCap) : '—'}
                </td>
              ))}
            </tr>

            {/* Franchise hospitalisation */}
            <tr className="bg-slate-50/50">
              <td className="sticky left-0 z-10 bg-slate-50/95 p-3 font-semibold text-slate-700">
                🏥 Franchise hospitalisation
              </td>
              {products.map(p => {
                const h = getGuarantee(p, 'HOSPITALIZATION');
                return (
                  <td key={p.id} className="p-3 text-center text-slate-600">
                    {h?.deductibleType === 'FIXED' ? fcfa(h.deductibleValue) : '—'}
                  </td>
                );
              })}
            </tr>

            {/* Délai de carence */}
            <tr>
              <td className="sticky left-0 z-10 bg-white p-3 font-semibold text-slate-700">
                ⏳ Délai de carence
              </td>
              {products.map(p => {
                const elig = parseEligibility(p.eligibilityConditions);
                const matDays = elig.waitingPeriodDays?.maternity;
                return (
                  <td key={p.id} className="p-3 text-center text-slate-600">
                    <div>{p.waitingPeriodDays} jours (soins)</div>
                    {matDays && <div className="text-xs text-amber-600 mt-0.5">Maternité : {Math.round(matDays / 30)} mois</div>}
                    {matDays === null && <div className="text-xs text-slate-400 mt-0.5">Maternité : non couverte</div>}
                  </td>
                );
              })}
            </tr>

            {/* Séparateur */}
            <tr>
              <td colSpan={products.length + 1} className="bg-brand-50 px-3 py-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-700">Détail des garanties</span>
              </td>
            </tr>

            {/* Lignes par catégorie */}
            {DISPLAY_CATEGORIES.map((cat, idx) => (
              <tr key={cat} className={idx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'}>
                <td className={`sticky left-0 z-10 p-3 font-semibold text-slate-700 ${idx % 2 === 0 ? 'bg-slate-50/95' : 'bg-white'}`}>
                  {CATEGORY_LABELS[cat] ?? cat}
                </td>
                {products.map(p => {
                  const g = getGuarantee(p, cat);
                  const isExcluded = p.exclusions.some(e => e.categoryId === cat);
                  if (isExcluded) {
                    return (
                      <td key={p.id} className="p-3 text-center">
                        <span className="inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                          Non couvert
                        </span>
                      </td>
                    );
                  }
                  if (!g) {
                    return <td key={p.id} className="p-3 text-center text-slate-300">—</td>;
                  }
                  return (
                    <td key={p.id} className="p-3 text-center">
                      <div className="font-bold text-brand-700">{g.rate ?? 100}%</div>
                      {g.annualLimit && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          Max {fcfa(g.annualLimit)}/an
                        </div>
                      )}
                      {g.copayRate > 0 && (
                        <div className="text-xs text-amber-600">
                          +{g.copayRate}% copay
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Plafond par acte */}
            <tr>
              <td colSpan={products.length + 1} className="bg-brand-50 px-3 py-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-700">Plafonds par acte (barème)</span>
              </td>
            </tr>
            {['CONSULTATION', 'HOSPITALIZATION', 'PHARMACY'].map((cat, idx) => (
              <tr key={`cap-${cat}`} className={idx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'}>
                <td className={`sticky left-0 z-10 p-3 text-sm text-slate-600 ${idx % 2 === 0 ? 'bg-slate-50/95' : 'bg-white'}`}>
                  {CATEGORY_LABELS[cat] ?? cat}
                </td>
                {products.map(p => {
                  const g = getGuarantee(p, cat);
                  return (
                    <td key={p.id} className="p-3 text-center text-sm text-slate-600">
                      {g?.maxUnitPrice ? `${fcfa(g.maxUnitPrice)}/acte` : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Ayants droit */}
            <tr className="bg-slate-50/50">
              <td className="sticky left-0 z-10 bg-slate-50/95 p-3 font-semibold text-slate-700">
                👨‍👩‍👧‍👦 Ayants droit max
              </td>
              {products.map(p => {
                const rules = typeof p.beneficiaryRules === 'string' ? JSON.parse(p.beneficiaryRules) : p.beneficiaryRules;
                return (
                  <td key={p.id} className="p-3 text-center text-slate-600">
                    {rules?.maxBeneficiaries ?? '—'}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Version mobile — cartes empilées */}
      <div className="md:hidden space-y-3">
        {products.map(p => {
          const elig = parseEligibility(p.eligibilityConditions);
          const isSel = selectedId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`card-p w-full text-left transition ${
                isSel ? 'ring-2 ring-brand-600 bg-brand-50/40' : 'hover:border-brand-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-bold">{p.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500 line-clamp-2">{p.description}</p>
                </div>
                <Badge className={isSel ? 'bg-brand-600 text-white' : ''}>
                  {fcfa(Math.round(p.basePremiumAnnual / 12))}/mois
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-slate-50 p-2">
                  <span className="text-slate-400">Copay</span>
                  <span className="ml-1 font-bold text-slate-700">{elig.copayRate ?? 15}%</span>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <span className="text-slate-400">Plafond</span>
                  <span className="ml-1 font-bold text-slate-700">
                    {p.globalAnnualCap ? fcfa(p.globalAnnualCap) : '—'}
                  </span>
                </div>
                {p.guarantees.map((g: any) => (
                  <div key={g.guarantee.category} className="rounded-lg bg-slate-50 p-2">
                    <span className="text-slate-400">{CATEGORY_LABELS[g.guarantee.category]?.split(' ')[0] ?? g.guarantee.category}</span>
                    <span className="ml-1 font-bold text-slate-700">{g.rate ?? 100}%</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className || 'bg-slate-100 text-slate-600'}`}>
      {children}
    </span>
  );
}

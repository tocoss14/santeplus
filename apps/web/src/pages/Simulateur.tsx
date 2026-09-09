import { useEffect, useState } from 'react';
import { api } from '../api';
import { fcfa, ratioPct } from '../format';
import { ErrorBanner, Field, Spinner } from '../components/ui';
import { BandBadge } from '../components/CtsCards';

export default function Simulateur() {
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState({
    productId: '', principalAge: '30', spouse: false, spouseAge: '28',
    children: '', frequency: 'ANNUAL', consumption: '50000',
  });
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<any[]>('/products?clientType=INDIVIDUAL').then(list => {
      setProducts(list);
      if (list.length && !form.productId) setForm(f => ({ ...f, productId: list[0].id }));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f: any) => {
      const v = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
      return { ...f, [k]: v };
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const childrenAges = form.children.split(/[,\s;]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => Number.isFinite(n) && n >= 0);
      const res = await api.post('/cts/simulate', {
        productId: form.productId,
        principalAge: Number(form.principalAge),
        spouseAge: form.spouse ? Number(form.spouseAge) : null,
        childrenAges,
        frequency: form.frequency,
        assumedAnnualConsumption: Number(form.consumption),
      });
      setResult(res);
    } catch (err: any) {
      setError(err?.message ?? 'Simulation impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl sm:text-3xl font-bold text-center">Simulateur commercial</h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        Estimation <b>indicative</b> — ni devis contractuel, ni certitude de projection.
      </p>
      <form onSubmit={submit} className="card-p mt-6 space-y-3">
        <ErrorBanner message={error} />
        <Field label="Formule">
          <select className="input" value={form.productId} onChange={set('productId')} required>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} — {fcfa(p.basePremiumAnnual)}/an</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Votre âge"><input className="input" type="number" min={0} max={100} value={form.principalAge} onChange={set('principalAge')} required /></Field>
          <Field label="Fréquence">
            <select className="input" value={form.frequency} onChange={set('frequency')}>
              <option value="ANNUAL">Annuelle</option>
              <option value="QUARTERLY">Trimestrielle</option>
              <option value="MONTHLY">Mensuelle</option>
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.spouse as boolean} onChange={set('spouse')} /> Conjoint(e)
        </label>
        {form.spouse && (
          <Field label="Âge du conjoint"><input className="input" type="number" min={0} max={100} value={form.spouseAge} onChange={set('spouseAge')} /></Field>
        )}
        <Field label="Âges des enfants (séparés par des virgules)" error="Laisser vide si aucun">
          <input className="input" value={form.children} onChange={set('children')} placeholder="Ex : 5, 8" />
        </Field>
        <Field label="Consommation soins annuelle supposée (FCFA)">
          <input className="input" type="number" min={0} step={5000} value={form.consumption} onChange={set('consumption')} required />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Calcul…' : 'Simuler'}</button>
      </form>

      {result && (
        <div className="card-p mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge bg-amber-100 text-amber-800">ESTIMATION</span>
            <h2 className="font-bold">{result.product?.name}</h2>
            <span className="ml-auto"><BandBadge band={result.band} /></span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-slate-400">Prime annuelle</p><p className="font-semibold">{fcfa(result.prime)}</p></div>
            <div><p className="text-xs text-slate-400">Frais de gestion</p><p className="font-semibold">{fcfa(result.fees)}</p></div>
            <div><p className="text-xs text-slate-400">Budget prestations</p><p className="font-semibold">{fcfa(result.budget)}</p></div>
            <div><p className="text-xs text-slate-400">Résultat projeté</p><p className="font-semibold">{fcfa(result.projectedResult)}</p></div>
            <div><p className="text-xs text-slate-400">Ratio projeté</p><p className="font-semibold">{ratioPct(result.projectedRatio)}</p></div>
            <div><p className="text-xs text-slate-400">Crédit renouvellement potentiel</p><p className="font-semibold">{fcfa(result.potentialCredit)}</p></div>
          </div>
          {result.exhaustionDay != null ? (
            <p className="text-sm font-medium text-red-700">⚠️ À ce rythme, épuisement potentiel vers le jour {result.exhaustionDay} — projection indicative, pas une certitude.</p>
          ) : (
            <p className="text-sm text-emerald-700">✓ Pas d'épuisement prévu à ce rythme (projection indicative).</p>
          )}
          <p className="text-xs text-slate-400">{result.disclaimer}</p>
        </div>
      )}
    </div>
  );
}

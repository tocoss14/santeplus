import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { fcfa, CATEGORY_LABELS, FREQUENCY_LABELS } from '../../format';
import { Badge, ErrorBanner, Field, Spinner } from '../../components/ui';

interface BenefDraft {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  relation: string;
}

interface SelectedGuarantee {
  categoryId: string;
  rate: number;
  annualLimit: number;
}

interface GuaranteeOption {
  categoryId: string;
  categoryName: string;
  basePrice: number;
  minRate: number;
  maxRate: number;
  minLimit: number;
  maxLimit: number;
  limitStep: number;
  mandatory: boolean;
  customizable: boolean;
}

const STEPS = ['Formule', 'Mes garanties', 'Bénéficiaires', 'Devis', 'Paiement', 'Terminé'];

function GuaranteeSlider({ option, value, onChange }: { option: GuaranteeOption; value: SelectedGuarantee; onChange: (v: SelectedGuarantee) => void }) {
  const rateSteps = Math.min(10, option.maxRate - option.minRate);
  const limitSteps = Math.floor((option.maxLimit - option.minLimit) / option.limitStep);

  return (
    <div className="card-p space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{CATEGORY_LABELS[option.categoryId] ?? option.categoryName}</p>
          <p className="text-xs text-slate-400">Coût de base : {fcfa(option.basePrice)}/an</p>
        </div>
        {option.mandatory && !option.customizable && (
          <Badge tone="bg-slate-100 text-slate-500">Inclus</Badge>
        )}
        {option.customizable && (
          <Badge tone="bg-brand-100 text-brand-700">Personnalisable</Badge>
        )}
      </div>

      {option.customizable ? (
        <>
          {/* Taux de couverture */}
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Taux de couverture</span>
              <span className="font-bold text-brand-700">{value.rate}%</span>
            </div>
            <input
              type="range"
              min={option.minRate}
              max={option.maxRate}
              step={5}
              value={value.rate}
              onChange={e => onChange({ ...value, rate: Number(e.target.value) })}
              className="w-full accent-brand-600"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>{option.minRate}% (économique)</span>
              <span>{option.maxRate}% (premium)</span>
            </div>
          </div>

          {/* Plafond annuel */}
          <div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Plafond annuel</span>
              <span className="font-bold text-brand-700">{fcfa(value.annualLimit)}</span>
            </div>
            <input
              type="range"
              min={option.minLimit}
              max={option.maxLimit}
              step={option.limitStep}
              value={value.annualLimit}
              onChange={e => onChange({ ...value, annualLimit: Number(e.target.value) })}
              className="w-full accent-brand-600"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>{fcfa(option.minLimit)}</span>
              <span>{fcfa(option.maxLimit)}</span>
            </div>
          </div>

          {/* Estimation du coût */}
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Coût estimé</span>
              <span className="font-semibold">
                {fcfa(Math.round(option.basePrice * (value.rate / 100) * (value.annualLimit / (option.minLimit || 100000))))}
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="text-sm text-slate-500">
          Taux : {option.minRate}% · Plafond : {fcfa(option.maxLimit)}
        </div>
      )}
    </div>
  );
}

export default function SubscribeWizard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [products, setProducts] = useState<any[] | null>(null);
  const [productId, setProductId] = useState<string>((location.state as any)?.productId ?? '');
  const [frequency, setFrequency] = useState('ANNUAL');
  const [selectedGuarantees, setSelectedGuarantees] = useState<SelectedGuarantee[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<BenefDraft[]>([]);
  const [quote, setQuote] = useState<any>(null);
  const [flexibleDetails, setFlexibleDetails] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [method, setMethod] = useState('');
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<any[]>('/products?clientType=INDIVIDUAL').then(setProducts).catch(() => setProducts([]));
    api.get<any[]>('/payments/methods').then(m => {
      setPaymentMethods(m);
      if (m[0]) setMethod(m[0].code);
    }).catch(() => {});
  }, []);

  const product = useMemo(() => products?.find(p => p.id === productId), [products, productId]);

  // Options de garanties pour le produit sélectionné
  const guaranteeOptions: GuaranteeOption[] = useMemo(() => {
    if (!product?.guarantees) return [];
    return product.guarantees.map((pg: any) => ({
      categoryId: pg.guarantee.category,
      categoryName: pg.guarantee.name,
      basePrice: pg.guarantee.basePrice ?? 0,
      minRate: pg.minRate ?? 50,
      maxRate: pg.maxRate ?? 95,
      minLimit: pg.minLimit ?? 0,
      maxLimit: pg.maxLimit ?? 10000000,
      limitStep: pg.limitStep ?? 50000,
      mandatory: pg.mandatory ?? true,
      customizable: pg.customizable ?? false,
    }));
  }, [product]);

  // Initialiser les garanties sélectionnées quand le produit change
  useEffect(() => {
    if (guaranteeOptions.length > 0 && selectedGuarantees.length === 0) {
      setSelectedGuarantees(guaranteeOptions.map(o => ({
        categoryId: o.categoryId,
        rate: Math.round((o.minRate + o.maxRate) / 2 / 5) * 5, // milieu de la plage, arrondi à 5
        annualLimit: o.maxLimit, // plafond max par défaut
      })));
    }
  }, [guaranteeOptions]);

  function updateGuarantee(categoryId: string, patch: Partial<SelectedGuarantee>) {
    setSelectedGuarantees(gs => gs.map(g => g.categoryId === categoryId ? { ...g, ...patch } : g));
  }

  async function computeQuote(bens: BenefDraft[], guars?: SelectedGuarantee[]) {
    setError(null);
    try {
      const res = await api.post('/subscription/quote', {
        productId,
        frequency,
        beneficiaries: bens.map(b => ({ birthDate: b.birthDate, relation: b.relation })),
        selectedGuarantees: guars,
      });
      setQuote(res.quote);
      setFlexibleDetails(res.flexibleDetails);
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Simulation impossible');
      return false;
    }
  }

  function updateBen(i: number, patch: Partial<BenefDraft>) {
    setBeneficiaries(bs => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  }

  const goStep2 = () => {
    if (!productId) return setError('Choisissez une formule');
    setStep(1);
    setError(null);
  };

  const goStep3 = () => {
    // Passer aux bénéficiaires
    setStep(2);
    setError(null);
  };

  const goStep4 = async () => {
    setBusy(true);
    const ok = await computeQuote(beneficiaries, selectedGuarantees);
    setBusy(false);
    if (ok) {
      setStep(3);
      setError(null);
    }
  };

  const subscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/subscription/subscribe', {
        productId,
        frequency,
        beneficiaries,
        selectedGuarantees,
      });
      setSubscription(res);
      setQuote(res.quote);
      setStep(4);
    } catch (e: any) {
      setError(e?.message ?? 'Souscription impossible');
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const init = await api.post<any>('/payments/initiate', {
        contractId: subscription.contractId,
        method,
        customerPhone: undefined,
      });
      if (init.initiation?.instructions?.mode === 'REDIRECT' && init.initiation.instructions.redirectUrl) {
        window.location.href = init.initiation.instructions.redirectUrl;
        return;
      }
      const conf = await api.post('/payments/mock/confirm', { paymentId: init.payment.id, outcome: 'SUCCESS' });
      if ((conf as any).status === 'SUCCEEDED') {
        setPaymentResult(init.payment);
        setStep(5);
      } else {
        setError('Le paiement a échoué. Réessayez.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Paiement impossible');
    } finally {
      setBusy(false);
    }
  };

  if (!products) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-1.5">
            <span
              className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                i <= step ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {i + 1}
            </span>
            <span className={`hidden sm:block text-xs font-medium ${i <= step ? 'text-brand-700' : 'text-slate-400'}`}>{s}</span>
            {i < STEPS.length - 1 && <span className={`h-0.5 flex-1 ${i < step ? 'bg-brand-500' : 'bg-slate-200'}`} />}
          </div>
        ))}
      </div>

      <ErrorBanner message={error} />

      {/* Étape 1 : Formule */}
      {step === 0 && (
        <div className="space-y-3">
          {products.map(p => (
            <button
              key={p.id}
              onClick={() => { setProductId(p.id); setFrequency('ANNUAL'); setSelectedGuarantees([]); }}
              className={`card-p w-full text-left transition ${productId === p.id ? 'ring-2 ring-brand-600 bg-brand-50/40' : 'hover:border-brand-300'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{p.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500 line-clamp-2">{p.description}</p>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {p.guarantees.map((g: any) => CATEGORY_LABELS[g.guarantee.category]).join(' · ')}
                  </p>
                </div>
                <Badge tone={productId === p.id ? 'bg-brand-600 text-white' : ''}>{fcfa(Math.round(p.basePremiumAnnual / 12))}/mois</Badge>
              </div>
            </button>
          ))}
          <Field label="Fréquence de paiement">
            <select className="input" value={frequency} onChange={e => setFrequency(e.target.value)}>
              <option value="ANNUAL">Annuel (meilleur tarif)</option>
              <option value="QUARTERLY">Trimestriel</option>
              <option value="MONTHLY">Mensuel</option>
            </select>
          </Field>
          <button onClick={goStep2} disabled={!productId} className="btn-primary w-full">Continuer</button>
        </div>
      )}

      {/* Étape 2 : Sélection des garanties */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">
            <p className="font-semibold">🎯 Personnalisez vos garanties</p>
            <p className="mt-1">
              Ajustez le <strong>taux de couverture</strong> et le <strong>plafond annuel</strong> pour chaque garantie.
              Plus le taux/plafond est élevé, plus la prime est élevée — mais mieux vous êtes couvert.
            </p>
          </div>

          {guaranteeOptions.map(o => {
            const sel = selectedGuarantees.find(g => g.categoryId === o.categoryId);
            if (!sel) return null;
            return (
              <GuaranteeSlider
                key={o.categoryId}
                option={o}
                value={sel}
                onChange={v => updateGuarantee(o.categoryId, v)}
              />
            );
          })}

          {/* Aperçu rapide du coût */}
          {flexibleDetails && (
            <div className="card-p bg-slate-50">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Prime estimée</span>
                <span className="font-bold text-brand-700">{fcfa(flexibleDetails.totalAnnual)}/an</span>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setStep(0)}>Retour</button>
            <button className="btn-primary flex-[2]" onClick={goStep3}>Continuer</button>
          </div>
        </div>
      )}

      {/* Étape 3 : Bénéficiaires */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Ajoutez vos ayants droit ({product?.beneficiaryRules?.maxBeneficiaries ?? 6} maximum).
            Vous pourrez les modifier plus tard.
          </p>
          {beneficiaries.map((b, i) => (
            <div key={i} className="card-p space-y-3">
              <div className="flex items-center justify-between">
                <span className="badge bg-slate-100">Ayant droit {i + 1}</span>
                <button className="text-xs text-red-600" onClick={() => setBeneficiaries(bs => bs.filter((_, j) => j !== i))}>Retirer</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nom"><input className="input" value={b.lastName} onChange={e => updateBen(i, { lastName: e.target.value })} /></Field>
                <Field label="Prénom"><input className="input" value={b.firstName} onChange={e => updateBen(i, { firstName: e.target.value })} /></Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Naissance"><input type="date" className="input" value={b.birthDate} onChange={e => updateBen(i, { birthDate: e.target.value })} /></Field>
                <Field label="Sexe">
                  <select className="input" value={b.gender} onChange={e => updateBen(i, { gender: e.target.value })}>
                    <option value="">—</option><option value="M">M</option><option value="F">F</option>
                  </select>
                </Field>
                <Field label="Lien">
                  <select className="input" value={b.relation} onChange={e => updateBen(i, { relation: e.target.value })}>
                    <option value="">—</option>
                    <option value="SPOUSE">Conjoint(e)</option>
                    <option value="CHILD">Enfant</option>
                    {product?.beneficiaryRules?.otherAllowed && <option value="OTHER">Autre</option>}
                  </select>
                </Field>
              </div>
            </div>
          ))}
          {(beneficiaries.length < (product?.beneficiaryRules?.maxBeneficiaries ?? 6)) && (
            <button
              onClick={() => setBeneficiaries(bs => [...bs, { firstName: '', lastName: '', birthDate: '', gender: '', relation: 'CHILD' }])}
              className="btn-outline w-full"
            >
              ＋ Ajouter un ayant droit
            </button>
          )}
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setStep(1)}>Retour</button>
            <button className="btn-primary flex-[2]" disabled={busy} onClick={goStep4}>{busy ? 'Calcul…' : 'Voir mon devis'}</button>
          </div>
        </div>
      )}

      {/* Étape 4 : Devis */}
      {step === 3 && quote && (
        <div className="space-y-4">
          <div className="card-p">
            <h3 className="font-semibold">Récapitulatif</h3>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {quote.lines.filter((l: any) => l.amount > 0).map((l: any) => (
                <li key={l.label} className="flex justify-between py-2">
                  <span>{l.label}</span>
                  <span>{fcfa(l.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-lg bg-brand-50 p-4">
              <div className="flex justify-between font-bold text-brand-800">
                <span>Total annuel</span><span>{fcfa(quote.totalAnnual)}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm text-brand-700">
                <span>Prélèvement {FREQUENCY_LABELS[frequency].toLowerCase()}</span>
                <span className="font-semibold">{fcfa(quote.periodicAmount)} × {quote.periods}</span>
              </div>
            </div>
          </div>

          {/* Détails des garanties sélectionnées */}
          {flexibleDetails?.guaranteeCosts?.length > 0 && (
            <div className="card-p">
              <h4 className="text-sm font-semibold text-slate-700">Vos garanties</h4>
              <div className="mt-2 space-y-2">
                {flexibleDetails.guaranteeCosts.map((gc: any) => (
                  <div key={gc.categoryId} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{gc.label}</span>
                    <span className="font-medium">{fcfa(gc.cost)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card-p text-xs text-slate-500 space-y-1.5">
            <p>• Co-paiement de 15% s'applique sur chaque prestation (part restant à votre charge).</p>
            <p>• Délai de carence éventuel : {product?.waitingPeriodDays > 0 ? `${product.waitingPeriodDays} jours` : 'aucun'} à compter de l'activation.</p>
            <p>• Contrat porté par {product?.insurerPartner?.name}. SantéPlus agit comme plateforme technologique.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setStep(2)}>Retour</button>
            <button className="btn-primary flex-[2]" disabled={busy} onClick={subscribe}>{busy ? 'Création…' : 'Valider ma souscription'}</button>
          </div>
        </div>
      )}

      {/* Étape 5 : Paiement */}
      {step === 4 && subscription && (
        <div className="space-y-4">
          <div className="card-p">
            <h3 className="font-semibold">Contrat {subscription.number} créé</h3>
            <p className="mt-1 text-sm text-slate-500">
              Réglez {fcfa(subscription.firstPayment.amount)} pour activer votre couverture.
            </p>
            <Field label="Moyen de paiement">
              <div className="grid gap-2">
                {paymentMethods.map(m => (
                  <label key={m.code} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${method === m.code ? 'border-brand-600 ring-1 ring-brand-600 bg-brand-50/50' : 'border-slate-200'}`}>
                    <input type="radio" name="method" checked={method === m.code} onChange={() => setMethod(m.code)} />
                    <span className="font-medium">{m.label}</span>
                    {!m.available && <span className="ml-auto badge bg-slate-100 text-slate-400">Bientôt</span>}
                  </label>
                ))}
              </div>
            </Field>
          </div>
          <button className="btn-primary w-full" disabled={busy || !method} onClick={pay}>
            {busy ? 'Traitement du paiement…' : `Payer ${fcfa(subscription.firstPayment.amount)}`}
          </button>
        </div>
      )}

      {/* Étape 6 : Terminé */}
      {step === 5 && (
        <div className="card-p text-center">
          <div className="text-5xl">🎉</div>
          <h2 className="mt-3 text-xl font-bold text-emerald-700">Paiement confirmé — contrat actif !</h2>
          <p className="mt-1 text-sm text-slate-500">
            Votre couverture est effective. Votre carte d'assuré numérique avec QR code est prête.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Link to="/app/carte" className="btn-primary">Ma carte d'assuré</Link>
            <Link to="/app" state={{ refresh: true }} className="btn-outline" onClick={() => navigate('/app')}>Tableau de bord</Link>
          </div>
        </div>
      )}
    </div>
  );
}

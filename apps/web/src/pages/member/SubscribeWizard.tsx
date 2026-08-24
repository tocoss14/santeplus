import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../api';
import { fcfa, fmtDate, CATEGORY_LABELS, FREQUENCY_LABELS } from '../../format';
import { Badge, ErrorBanner, Field, Spinner } from '../../components/ui';

interface BenefDraft {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  relation: string;
}

const STEPS = ['Formule', 'Bénéficiaires', 'Devis', 'Paiement', 'Terminé'];

export default function SubscribeWizard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [products, setProducts] = useState<any[] | null>(null);
  const [productId, setProductId] = useState<string>((location.state as any)?.productId ?? '');
  const [frequency, setFrequency] = useState('ANNUAL');
  const [beneficiaries, setBeneficiaries] = useState<BenefDraft[]>([]);
  const [quote, setQuote] = useState<any>(null);
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

  async function computeQuote(bens: BenefDraft[]) {
    setError(null);
    try {
      const res = await api.post('/subscription/quote', {
        productId,
        frequency,
        beneficiaries: bens.map(b => ({ birthDate: b.birthDate, relation: b.relation })),
      });
      setQuote(res.quote);
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

  const goStep3 = async () => {
    setBusy(true);
    const ok = await computeQuote(beneficiaries);
    setBusy(false);
    if (ok) {
      setStep(2);
      setError(null);
    }
  };

  const subscribe = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/subscription/subscribe', { productId, frequency, beneficiaries });
      setSubscription(res);
      setQuote(res.quote);
      setStep(3);
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
        setStep(4);
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

      {step === 0 && (
        <div className="space-y-3">
          {products.map(p => (
            <button
              key={p.id}
              onClick={() => { setProductId(p.id); setFrequency('ANNUAL'); }}
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

      {step === 1 && (
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
            <button className="btn-outline flex-1" onClick={() => setStep(0)}>Retour</button>
            <button className="btn-primary flex-[2]" disabled={busy} onClick={goStep3}>{busy ? 'Calcul…' : 'Voir mon devis'}</button>
          </div>
        </div>
      )}

      {step === 2 && quote && (
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
          <div className="card-p text-xs text-slate-500 space-y-1.5">
            <p>• Garanties et plafonds : voir la fiche formule.</p>
            <p>• Délai de carence éventuel : {product?.waitingPeriodDays > 0 ? `${product.waitingPeriodDays} jours` : 'aucun'} à compter de l’activation.</p>
            <p>• Contrat porté par {product?.insurerPartner?.name}. SantéPlus agit comme plateforme technologique.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setStep(1)}>Retour</button>
            <button className="btn-primary flex-[2]" disabled={busy} onClick={subscribe}>{busy ? 'Création…' : 'Valider ma souscription'}</button>
          </div>
        </div>
      )}

      {step === 3 && subscription && (
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

      {step === 4 && (
        <div className="card-p text-center">
          <div className="text-5xl">🎉</div>
          <h2 className="mt-3 text-xl font-bold text-emerald-700">Paiement confirmé — contrat actif !</h2>
          <p className="mt-1 text-sm text-slate-500">
            Votre couverture est effective. Votre carte d’assuré numérique avec QR code est prête.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Link to="/app/carte" className="btn-primary">Ma carte d’assuré</Link>
            <Link to="/app" state={{ refresh: true }} className="btn-outline" onClick={() => navigate('/app')}>Tableau de bord</Link>
          </div>
        </div>
      )}
    </div>
  );
}

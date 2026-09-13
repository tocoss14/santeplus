import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, fileUrl } from '../../api';
import { fcfa, CATEGORY_LABELS, FREQUENCY_LABELS } from '../../format';
import { ErrorBanner, Field, PhotoImg, Spinner } from '../../components/ui';
import FormulaComparisonTable from '../../components/FormulaComparisonTable';

interface BenefDraft {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  relation: string;
}

interface InitialProfile {
  firstName: string;
  lastName: string;
  birthDate: string;
}

interface GuaranteeOption {
  categoryId: string;
  categoryName: string;
  basePrice: number;
  rate: number;
  annualLimit: number | null;
  minRate: number;
  maxRate: number;
  minLimit: number;
  maxLimit: number;
  mandatory: boolean;
  customizable: boolean;
  copayRate: number;
}

interface GuaranteeChangeDraft {
  categoryId: string;
  categoryName: string;
  requestedRate: string;
  requestedAnnualLimit: string;
  reason: string;
}

const STEPS = ['Profil initial', 'Formule', 'Acte de naissance', 'Garanties incluses', 'Photo', 'Bénéficiaires', 'Devis', 'Paiement', 'Terminé'];

export default function SubscribeWizard() {
  const location = useLocation();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [products, setProducts] = useState<any[] | null>(null);
  const [productId, setProductId] = useState<string>(
    (location.state as any)?.productId ?? new URLSearchParams(location.search).get('productId') ?? '',
  );
  const [frequency, setFrequency] = useState('ANNUAL');
  const [riskModel, setRiskModel] = useState<'MUTUALITE' | 'INDIVIDUEL'>('MUTUALITE');
  const [beneficiaries, setBeneficiaries] = useState<BenefDraft[]>([]);
  const [initialProfile, setInitialProfile] = useState<InitialProfile>({ firstName: '', lastName: '', birthDate: '' });
  const [initialProfileError, setInitialProfileError] = useState<string | null>(null);
  const [guaranteeRequest, setGuaranteeRequest] = useState<GuaranteeChangeDraft | null>(null);
  const [guaranteeRequestResult, setGuaranteeRequestResult] = useState<any | null>(null);
  const [guaranteeRequestError, setGuaranteeRequestError] = useState<string | null>(null);
  const [guaranteeRequestBusy, setGuaranteeRequestBusy] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [flexibleDetails, setFlexibleDetails] = useState<any>(null);
  const [adhesion, setAdhesion] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [method, setMethod] = useState('');
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [methodsError, setMethodsError] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Acte de naissance
  const [birthCertFile, setBirthCertFile] = useState<File | null>(null);
  const [birthCertFileId, setBirthCertFileId] = useState<string | null>(null);
  const [birthCertPreview, setBirthCertPreview] = useState<string | null>(null);
  const [birthCertDoc, setBirthCertDoc] = useState({ firstName: '', lastName: '', birthDate: '' });
  const [birthCertAttested, setBirthCertAttested] = useState(false);
  const [birthCertResult, setBirthCertResult] = useState<any | null>(null);
  const [birthCertVerified, setBirthCertVerified] = useState(false);
  const [birthCertVerifying, setBirthCertVerifying] = useState(false);
  const [birthCertError, setBirthCertError] = useState<string | null>(null);
  const birthCertRef = useRef<HTMLInputElement>(null);

  // Charger la photo existante de l'utilisateur
  useEffect(() => {
    api.get<{ fileId: string | null }>('/users/me/photo').then(r => {
      if (r.fileId) setPhotoPreview(fileUrl(r.fileId));
    }).catch(() => {});
  }, []);

  // Poll payment status after redirect (URL has ?paiement=retour)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('paiement') === 'retour') {
      // User came back from payment provider — check contract status
      api.get<any[]>('/contracts/mine').then(async list => {
        if (list.length) {
          const contract = list[0];
          if (contract.status === 'ACTIVE') {
            setStep(8); // Go to success
            setSubscription({ contractId: contract.id, number: contract.number });
          } else {
            // Poll payment status
            const payments = await api.get<any[]>('/payments/mine').catch(() => []);
            const last = payments[0];
            if (last && last.status === 'PENDING' && last.id) {
              // Poll every 3 seconds for up to 30 seconds
              let attempts = 0;
              const poll = setInterval(async () => {
                attempts++;
                try {
                  const res = await api.get<{ status: string }>(`/payments/${last.id}/status`);
                  if (res.status === 'SUCCEEDED') {
                    clearInterval(poll);
                    setStep(8);
                    setSubscription({ contractId: contract.id, number: contract.number });
                  } else if (res.status === 'FAILED') {
                    clearInterval(poll);
                    setError('Le paiement a échoué. Réessayez.');
                    setStep(7);
} else if (attempts >= 10) {
                    clearInterval(poll);
                    setStep(7);
                    setError('Paiement en cours de traitement. Vérifiez votre contrat dans quelques minutes.');
                  }
                } catch {
                  if (attempts >= 10) clearInterval(poll);
                }
              }, 3000);
            } else if (last && last.status === 'SUCCEEDED') {
              setStep(7);
            } else {
              setStep(6);
            }
          }
        }
      }).catch(() => {});
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  useEffect(() => {
    api.get<any[]>('/products?clientType=INDIVIDUAL').then(setProducts).catch(() => setProducts([]));
    api.get<any[]>('/payments/methods').then(m => {
      setPaymentMethods(m);
      if (m[0]) setMethod(m[0].code);
    }).catch((e: any) => {
      // Sans moyens de paiement l'étape 7 est dans une impasse — l'afficher.
      setMethodsError(e?.message ?? 'Impossible de charger les moyens de paiement');
    });
  }, []);

  const product = useMemo(() => products?.find(p => p.id === productId), [products, productId]);

  // Options de garanties pour le produit sélectionné
  const guaranteeOptions: GuaranteeOption[] = useMemo(() => {
    if (!product?.guarantees) return [];
    return product.guarantees.map((pg: any) => ({
      categoryId: pg.guarantee.category,
      categoryName: pg.guarantee.name,
      basePrice: pg.guarantee.basePrice ?? 0,
      rate: pg.rate ?? pg.minRate ?? 0,
      annualLimit: pg.annualLimit ?? null,
      minRate: pg.minRate ?? 0,
      maxRate: pg.maxRate ?? 100,
      minLimit: pg.minLimit ?? 0,
      maxLimit: pg.maxLimit ?? 10000000,
      mandatory: pg.mandatory ?? true,
      customizable: pg.customizable ?? false,
      copayRate: pg.copayRate ?? 0,
    }));
  }, [product]);

  async function computeQuote(bens: BenefDraft[]) {
    setError(null);
    try {
      const res = await api.post('/subscription/quote', {
        productId,
        frequency,
        beneficiaries: bens.map(b => ({ birthDate: b.birthDate, relation: b.relation })),
        selectedGuarantees: [],
      });
      setQuote(res.quote);
      setFlexibleDetails(res.flexibleDetails);
      setAdhesion(res.adhesion ?? null);
      return true;
    } catch (e: any) {
      setError(e?.message ?? 'Simulation impossible');
      return false;
    }
  }

  function updateBen(i: number, patch: Partial<BenefDraft>) {
    setBeneficiaries(bs => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  }

  function openGuaranteeRequest(option: GuaranteeOption) {
    setGuaranteeRequest({
      categoryId: option.categoryId,
      categoryName: option.categoryName,
      requestedRate: String(option.rate),
      requestedAnnualLimit: option.annualLimit == null ? '' : String(option.annualLimit),
      reason: '',
    });
    setGuaranteeRequestResult(null);
    setGuaranteeRequestError(null);
  }

  function updateGuaranteeRequest(patch: Partial<GuaranteeChangeDraft>) {
    setGuaranteeRequest(draft => (draft ? { ...draft, ...patch } : draft));
    setGuaranteeRequestResult(null);
  }

  async function submitGuaranteeRequest() {
    if (!guaranteeRequest || !product) return;
    const requestedRate = guaranteeRequest.requestedRate.trim() === '' ? null : Number(guaranteeRequest.requestedRate);
    const requestedAnnualLimit = guaranteeRequest.requestedAnnualLimit.trim() === '' ? null : Number(guaranteeRequest.requestedAnnualLimit);
    if (guaranteeRequest.reason.trim().length < 10) {
      setGuaranteeRequestError('Expliquez votre besoin en au moins dix caractères pour le gestionnaire.');
      return;
    }
    const values = [requestedRate, requestedAnnualLimit];
    if (
      values.every(value => value == null) ||
      values.some(value => value != null && (!Number.isInteger(value) || value < 0))
    ) {
      setGuaranteeRequestError('Indiquez au moins un taux ou un plafond demandé valide.');
      return;
    }

    setGuaranteeRequestBusy(true);
    setGuaranteeRequestError(null);
    try {
      const result = await api.post('/subscription/guarantee-change-requests', {
        productId: product.id,
        categoryId: guaranteeRequest.categoryId,
        requestedRate,
        requestedAnnualLimit,
        reason: guaranteeRequest.reason.trim(),
        frequency,
        beneficiaries: beneficiaries.map(b => ({ birthDate: b.birthDate, relation: b.relation })),
      });
      setGuaranteeRequestResult(result);
    } catch (err: any) {
      setGuaranteeRequestError(err?.message ?? 'Envoi impossible');
    } finally {
      setGuaranteeRequestBusy(false);
    }
  }

  // Gestion acte de naissance
  function handleBirthCert(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setBirthCertError('Format non supporté. PDF, JPG, PNG ou WebP uniquement.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setBirthCertError('Fichier trop volumineux (max 10 Mo).');
      return;
    }
    setBirthCertFile(file);
    setBirthCertFileId(null);
    setBirthCertPreview(URL.createObjectURL(file));
    setBirthCertResult(null);
    setBirthCertVerified(false);
    setBirthCertError(null);
  }

  function updateBirthCertDoc(patch: Partial<typeof birthCertDoc>) {
    setBirthCertDoc(doc => ({ ...doc, ...patch }));
    setBirthCertResult(null);
    setBirthCertVerified(false);
  }

  async function verifyBirthCert() {
    if (!birthCertFile) {
      setBirthCertError('Ajoutez votre acte de naissance avant la vérification.');
      return;
    }
    if (!birthCertDoc.firstName.trim() || !birthCertDoc.lastName.trim() || !birthCertDoc.birthDate) {
      setBirthCertError('Recopiez le prénom, le nom et la date de naissance visibles sur l’acte.');
      return;
    }
    if (!birthCertAttested) {
      setBirthCertError('Vous devez attester avoir recopié exactement le document.');
      return;
    }
    const checkedInitialProfile = {
      firstName: initialProfile.firstName.trim(),
      lastName: initialProfile.lastName.trim(),
      birthDate: initialProfile.birthDate,
    };
    if (!checkedInitialProfile.firstName || !checkedInitialProfile.lastName || !checkedInitialProfile.birthDate) {
      setBirthCertError('Les informations saisies à la première étape sont incomplètes. Retournez à l’étape précédente et renseignez-les exactement.');
      return;
    }

    setBirthCertVerifying(true);
    setBirthCertError(null);
    try {
      let fileId = birthCertFileId;
      if (!fileId) {
        const fd = new FormData();
        fd.append('file', birthCertFile);
        const uploadRes = await api.post<{ fileId: string }>('/subscription/birth-certificate/upload', fd);
        fileId = uploadRes.fileId;
        setBirthCertFileId(fileId);
      }

      const result = await api.post<any>('/subscription/birth-certificate/verify', {
        fileId,
        firstName: birthCertDoc.firstName.trim(),
        lastName: birthCertDoc.lastName.trim(),
        birthDate: birthCertDoc.birthDate,
        initialProfile: checkedInitialProfile,
      });
      setBirthCertResult(result);

      const profileMatches = result?.match === true;
      const initialComparison = result?.initialProfile;
      const initialMatches = initialComparison?.match === true;
      if (profileMatches && initialMatches) {
        setBirthCertVerified(true);
        return;
      }

      const problems: string[] = [];
      if (!profileMatches) {
        problems.push(
          Array.isArray(result?.warnings) && result.warnings.length
            ? result.warnings.join(' ')
            : 'Les informations recopiées ne correspondent pas à votre profil.',
        );
      }
      if (initialComparison && !initialMatches) {
        const initialWarnings = Array.isArray(initialComparison.warnings) && initialComparison.warnings.length
          ? ` ${initialComparison.warnings.join(' ')}`
          : '';
        problems.push(
          'Les informations saisies au début ne correspondent pas à l’acte de naissance vérifié. ' +
          'Retournez à la première étape et renseignez exactement le prénom, le nom et la date figurant sur votre acte de naissance ou votre carte d’identité.' +
          initialWarnings,
        );
      } else if (!initialComparison) {
        problems.push('La comparaison avec les informations saisies au début est impossible. Relancez la vérification.');
      }
      setBirthCertVerified(false);
      setBirthCertError(problems.join(' '));
    } catch (err: any) {
      setBirthCertError(err?.message ?? 'Erreur lors de la vérification');
    } finally {
      setBirthCertVerifying(false);
    }
  }

  const goStep2 = () => {
    if (!productId) return setError('Choisissez une formule');
    setStep(2); // Acte de naissance
    setError(null);
  };

  const goStep1 = () => {
    if (!initialProfile.firstName.trim() || !initialProfile.lastName.trim() || !initialProfile.birthDate) {
      setInitialProfileError('Tous les champs sont obligatoires.');
      return;
    }
    setStep(1); // Goes to formula selection
    setInitialProfileError(null);
    setError(null);
  };

  const goStep3 = () => {
    if (!birthCertVerified) {
      setError('Vous devez d\'abord vérifier votre acte de naissance.');
      return;
    }
    // Passer aux garanties (now step 3)
    setStep(3);
    setError(null);
  };

  const goStep4 = () => {
    // La photo n'est pas bloquante : l'envoyer lorsqu'elle est fournie, puis passer aux bénéficiaires.
    if (photoFile) {
      const fd = new FormData();
      fd.append('photo', photoFile);
      api.post('/users/me/photo', fd).catch((e: any) => {
        // La photo n'est pas bloquante pour la souscription, mais ne pas la
        // perdre en silence — l'utilisateur devra la renvoyer depuis son profil.
        setError(`Photo non enregistrée (${e?.message ?? 'erreur inconnue'}) — vous pourrez la renvoyer depuis votre profil.`);
      });
    }
    setStep(5);
    setError(null);
  };

  const goStep5 = async () => {
    // Passer au devis
    setBusy(true);
    const ok = await computeQuote(beneficiaries);
    setBusy(false);
    if (ok) {
      setStep(6);
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
        selectedGuarantees: [],
        riskModel,
      });
      setSubscription(res);
      setQuote(res.quote);
      setStep(7);
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
        setStep(8);
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
      <p className="mb-2 text-xs font-semibold text-brand-700 sm:hidden" aria-live="polite">
        Étape {step + 1} sur {STEPS.length} : {STEPS[step]}
      </p>
      <div className="mb-6 flex items-center gap-1.5 overflow-x-auto pb-1" role="list" aria-label="Progression de la souscription">
        {STEPS.map((s, i) => (
          <div key={s} className="flex min-w-[48px] flex-1 items-center gap-1.5" role="listitem" aria-current={i === step ? 'step' : undefined}>
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

      {/* Étape 0 : Profil initial — Saisie exacte selon acte de naissance */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-brand-700 flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Informations d'identité — À saisir exactement comme sur votre acte de naissance ou carte d'identité
            </h3>
            <p className="text-sm text-brand-600 mb-4">
              Ces informations seront comparées à celles extraites de votre acte de naissance lors de la vérification.
              Toute différence bloquera la souscription. Merci de recopier <strong>exactement</strong> : prénom(s), nom(s) et date de naissance.
            </p>
          </div>

          <Field label="Prénom(s) *">
            <input
              type="text"
              value={initialProfile.firstName}
              onChange={e => { setInitialProfile(p => ({ ...p, firstName: e.target.value })); setInitialProfileError(null); }}
              className="input"
              placeholder="Ex: Jean-Pierre"
              required
              autoComplete="given-name"
            />
          </Field>

          <Field label="Nom(s) *">
            <input
              type="text"
              value={initialProfile.lastName}
              onChange={e => { setInitialProfile(p => ({ ...p, lastName: e.target.value })); setInitialProfileError(null); }}
              className="input"
              placeholder="Ex: AGOSSOU"
              required
              autoComplete="family-name"
            />
          </Field>

          <Field label="Date de naissance *">
            <input
              type="date"
              value={initialProfile.birthDate}
              onChange={e => { setInitialProfile(p => ({ ...p, birthDate: e.target.value })); setInitialProfileError(null); }}
              className="input"
              max={new Date().toISOString().split('T')[0]}
              required
            />
          </Field>

          {initialProfileError && <ErrorBanner message={initialProfileError} />}

          <button
            type="button"
            onClick={goStep1}
            disabled={busy || !initialProfile.firstName.trim() || !initialProfile.lastName.trim() || !initialProfile.birthDate}
            className="btn-primary w-full"
          >
            {busy ? <Spinner /> : 'Continuer vers le choix de la formule'}
          </button>
        </div>
      )}

      {/* Étape 1 : Formule — Tableau comparatif */}
      {step === 1 && (
        <div className="space-y-4">
          <FormulaComparisonTable
            products={products}
            selectedId={productId}
            onSelect={id => {
              setProductId(id);
              setGuaranteeRequest(null);
              setGuaranteeRequestResult(null);
              setGuaranteeRequestError(null);
            }}
          />
          <Field label="Fréquence de paiement">
            <select className="input" value={frequency} onChange={e => setFrequency(e.target.value)}>
              <option value="ANNUAL">Annuel (meilleur tarif)</option>
              <option value="QUARTERLY">Trimestriel</option>
              <option value="MONTHLY">Mensuel</option>
            </select>
          </Field>
          <div className="grid gap-2">
            <button className="btn-outline w-full" onClick={() => setStep(0)}>Modifier mes informations d’identité</button>
            <button onClick={goStep2} disabled={!productId} className="btn-primary w-full">
              {productId ? `Choisir ${products.find(p => p.id === productId)?.name ?? ''}` : 'Sélectionnez une formule ci-dessus'}
            </button>
          </div>
        </div>
      )}

      {/* Étape 2 : Acte de naissance */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">📄 Acte de naissance obligatoire</p>
            <p className="mt-1">
              Téléversez votre acte de naissance, puis recopiez exactement le prénom, le nom et la date
              de naissance visibles sur le document. Le système compare ensuite ces informations à votre
              profil et à l’identité saisie à la première étape avant d’autoriser la suite.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Identité saisie à la première étape</p>
            <p className="mt-1">
              {initialProfile.firstName} {initialProfile.lastName} — né(e) le {initialProfile.birthDate || '—'}.
            </p>
            <button type="button" className="mt-1 font-medium text-brand-700 hover:underline" onClick={() => setStep(0)}>
              Corriger cette identité
            </button>
          </div>

          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={() => birthCertRef.current?.click()}
              className="relative flex h-36 w-36 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-brand-400 hover:bg-brand-50 transition"
            >
              {birthCertPreview ? (
                <div className="h-full w-full rounded-xl bg-slate-100 flex items-center justify-center">
                  <span className="text-4xl">📄</span>
                </div>
              ) : (
                <div className="text-center text-sm leading-tight">
                  <div className="text-3xl mb-1">📄</div>
                  Ajouter l'acte de naissance
                </div>
              )}
            </button>
            <input
              ref={birthCertRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleBirthCert}
            />
            {birthCertPreview && !birthCertVerified && (
              <button
                type="button"
                onClick={() => {
                  setBirthCertFile(null);
                  setBirthCertFileId(null);
                  setBirthCertPreview(null);
                  setBirthCertDoc({ firstName: '', lastName: '', birthDate: '' });
                  setBirthCertAttested(false);
                  setBirthCertResult(null);
                  setBirthCertError(null);
                }}
                className="text-xs text-red-500 hover:underline"
              >
                Retirer le fichier
              </button>
            )}
            <p className="text-xs text-slate-400">PDF, JPG, PNG ou WebP — max 10 Mo</p>
          </div>

          {birthCertFile && !birthCertVerified && (
            <div className="card-p bg-amber-50 border-amber-200 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">⚠️</span>
                <div>
                  <p className="font-semibold text-amber-800">Vérification requise</p>
                  <p className="text-xs text-amber-700">Recopiez fidèlement les données visibles sur le document téléversé.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prénom sur l’acte">
                  <input
                    className="input"
                    value={birthCertDoc.firstName}
                    onChange={e => updateBirthCertDoc({ firstName: e.target.value })}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Nom sur l’acte">
                  <input
                    className="input"
                    value={birthCertDoc.lastName}
                    onChange={e => updateBirthCertDoc({ lastName: e.target.value })}
                    autoComplete="off"
                  />
                </Field>
              </div>
              <Field label="Date de naissance sur l’acte">
                <input
                  type="date"
                  className="input"
                  value={birthCertDoc.birthDate}
                  onChange={e => updateBirthCertDoc({ birthDate: e.target.value })}
                />
              </Field>
              <label className="flex items-start gap-2 text-xs text-amber-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={birthCertAttested}
                  onChange={e => setBirthCertAttested(e.target.checked)}
                />
                <span>J’atteste avoir recopié exactement le document téléversé. Une fausse déclaration peut entraîner le rejet de la souscription.</span>
              </label>
              <button
                className="btn-primary w-full"
                disabled={birthCertVerifying}
                onClick={verifyBirthCert}
              >
                {birthCertVerifying ? 'Vérification en cours…' : 'Lancer la vérification'}
              </button>
              {birthCertError && (
                <p className="text-sm text-red-600">{birthCertError}</p>
              )}
            </div>
          )}

          {birthCertVerified && (
            <div className="card-p bg-emerald-50 border-emerald-200 space-y-3">
              <div className="flex items-center gap-2 text-emerald-800">
                <span className="text-2xl">✅</span>
                <div>
                  <p className="font-semibold">Vérification réussie</p>
                  <p className="text-xs">L’acte vérifié correspond à votre profil et à l’identité saisie au début.</p>
                </div>
              </div>
              <p className="text-xs text-emerald-700">
                Correspondance : {birthCertResult ? `${Math.round(birthCertResult.confidence * 100)} %` : '100 %'}.
                Vous pouvez maintenant continuer.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setStep(1)}>Retour</button>
            <button className="btn-primary flex-[2]" disabled={!birthCertVerified} onClick={goStep3}>Continuer</button>
          </div>
        </div>
      )}

      {/* Étape 3 : Garanties incluses dans la formule */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">
            <p className="font-semibold">Garanties incluses — formule figée</p>
            <p className="mt-1">
              Ces garanties sont fixées par la formule sélectionnée et ne peuvent pas être modifiées directement ici.
              Si vous souhaitez un taux ou un plafond différent, envoyez une demande motivée à un gestionnaire.
            </p>
          </div>

          {guaranteeOptions.length === 0 && (
            <p className="text-sm text-slate-500">Aucune garantie n’est configurée pour cette formule.</p>
          )}

          {guaranteeOptions.map(option => (
            <div key={option.categoryId} className="card-p space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{CATEGORY_LABELS[option.categoryId] ?? option.categoryName}</p>
                  <p className="text-xs text-slate-400">Coût de base : {fcfa(option.basePrice)}/an</p>
                </div>
                <span className="badge bg-slate-100 text-slate-600">Formule figée</span>
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Taux de couverture</dt>
                  <dd className="font-semibold">{option.rate}%</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Plafond annuel</dt>
                  <dd className="font-semibold">
                    {option.annualLimit == null ? 'Selon conditions de la formule' : fcfa(option.annualLimit)}
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">Co-paiement</dt>
                  <dd className="font-semibold">{option.copayRate}%</dd>
                </div>
              </dl>
              {option.customizable && (
                <button type="button" className="btn-outline w-full" onClick={() => openGuaranteeRequest(option)}>
                  Demander une modification
                </button>
              )}
            </div>
          ))}

          {guaranteeRequest && (() => {
            const selectedOption = guaranteeOptions.find(option => option.categoryId === guaranteeRequest.categoryId);
            if (!selectedOption) return null;
            return (
              <div className="card-p space-y-3 border-brand-200">
                <h3 className="font-semibold">
                  Demande de modification — {CATEGORY_LABELS[selectedOption.categoryId] ?? selectedOption.categoryName}
                </h3>
                <p className="text-xs text-slate-500">
                  Garantie actuelle : {selectedOption.rate}% · {selectedOption.annualLimit == null ? 'plafond selon conditions' : fcfa(selectedOption.annualLimit)}.
                  Cette demande n’applique aucune modification immédiate : un gestionnaire l’examine et vous répond.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`Taux demandé (${selectedOption.minRate}–${selectedOption.maxRate} %)`}>
                    <input
                      type="number"
                      className="input"
                      min={selectedOption.minRate}
                      max={selectedOption.maxRate}
                      value={guaranteeRequest.requestedRate}
                      onChange={e => updateGuaranteeRequest({ requestedRate: e.target.value })}
                    />
                  </Field>
                  <Field label={`Plafond demandé (${fcfa(selectedOption.minLimit)}–${fcfa(selectedOption.maxLimit)})`}>
                    <input
                      type="number"
                      className="input"
                      min={selectedOption.minLimit}
                      max={selectedOption.maxLimit}
                      value={guaranteeRequest.requestedAnnualLimit}
                      onChange={e => updateGuaranteeRequest({ requestedAnnualLimit: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Motif de la demande">
                  <textarea
                    className="input min-h-20"
                    value={guaranteeRequest.reason}
                    onChange={e => updateGuaranteeRequest({ reason: e.target.value })}
                    placeholder="Expliquez votre besoin médical ou familial en au moins dix caractères."
                  />
                </Field>
                {guaranteeRequestError && <ErrorBanner message={guaranteeRequestError} />}
                {guaranteeRequestResult && (
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                    <p className="font-semibold">Demande {guaranteeRequestResult.reference} transmise</p>
                    <p className="mt-1">
                      Prime estimée : {fcfa(guaranteeRequestResult.baselineAnnual)}/an → {fcfa(guaranteeRequestResult.projectedAnnual)}/an
                      ({guaranteeRequestResult.deltaAnnual >= 0 ? '+' : ''}{fcfa(guaranteeRequestResult.deltaAnnual)}).
                      {guaranteeRequestResult.managersNotified} gestionnaire(s) notifié(s).
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <button type="button" className="btn-outline flex-1" onClick={() => { setGuaranteeRequest(null); setGuaranteeRequestResult(null); setGuaranteeRequestError(null); }}>
                    Fermer
                  </button>
                  <button type="button" className="btn-primary flex-[2]" disabled={guaranteeRequestBusy} onClick={submitGuaranteeRequest}>
                    {guaranteeRequestBusy ? 'Envoi…' : 'Envoyer au gestionnaire'}
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setStep(2)}>Retour</button>
            <button className="btn-primary flex-[2]" onClick={goStep4}>Continuer</button>
          </div>
        </div>
      )}

      {/* Étape 4 : Photo d'identité */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="rounded-lg bg-brand-50 p-4 text-sm text-brand-800">
            <p className="font-semibold">📸 Photo pour votre carte d'assuré</p>
            <p className="mt-1">
              Ajoutez une photo d'identité qui apparaîtra sur votre carte d'assuré SantéPlus.
              Elle sera visible par les prestataires lors de la vérification.
            </p>
          </div>
          <div className="flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative flex h-36 w-36 items-center justify-center rounded-full border-2 border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:border-brand-400 hover:bg-brand-50 transition"
            >
              {photoPreview ? (
                <PhotoImg src={photoPreview} alt="Photo d'identité" className="h-full w-full rounded-full object-cover" />
              ) : (
                <span className="text-center text-sm leading-tight">📸<br />Ajouter une photo</span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhoto} />
            {photoPreview && (
              <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }} className="text-xs text-red-500 hover:underline">
                Retirer la photo
              </button>
            )}
            <p className="text-xs text-slate-400">JPG, PNG ou WebP — max 5 Mo</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setStep(3)}>Retour</button>
            <button className="btn-primary flex-[2]" onClick={goStep4}>Continuer</button>
          </div>
        </div>
      )}

      {/* Étape 5 : Bénéficiaires */}
      {step === 5 && (
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
            <button className="btn-outline flex-1" onClick={() => setStep(4)}>Retour</button>
            <button className="btn-primary flex-[2]" disabled={busy} onClick={goStep5}>{busy ? 'Calcul…' : 'Voir mon devis'}</button>
          </div>
        </div>
      )}

      {/* Étape 6 : Devis */}
      {step === 6 && quote && (
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
                <span>Total annuel (cotisation)</span><span>{fcfa(quote.totalAnnual)}</span>
              </div>
              <div className="mt-1 flex justify-between text-sm text-brand-700">
                <span>Prélèvement {FREQUENCY_LABELS[frequency].toLowerCase()}</span>
                <span className="font-semibold">{fcfa(quote.periodicAmount)} × {quote.periods}</span>
              </div>
              {adhesion && (
                <div className="mt-2 flex justify-between border-t border-brand-100 pt-2 text-sm">
                  <span>Frais d'adhésion (une fois) — {adhesion.personsCount} pers. × {fcfa(adhesion.perPerson)}</span>
                  <span className="font-semibold">{fcfa(adhesion.adhesionFee)}</span>
                </div>
              )}
              {adhesion && (
                <p className="mt-1 text-xs text-brand-600">Payable une seule fois avec la 1ère cotisation</p>
              )}
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

          <div className="card-p">
            <h4 className="text-sm font-semibold text-slate-700">Modèle de gestion du risque</h4>
            <div className="mt-2 grid gap-2">
              <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${riskModel === 'MUTUALITE' ? 'border-brand-600 bg-brand-50/50' : 'border-slate-200'}`}>
                <input type="radio" name="riskModel" checked={riskModel === 'MUTUALITE'} onChange={() => setRiskModel('MUTUALITE')} className="mt-1" />
                <span><span className="font-semibold">🤝 Mutualité (recommandé)</span><br /><span className="text-xs text-slate-500">Vos excédents alimentent le Fonds de solidarité ; vos déficits peuvent être couverts. Garanties et tarifs identiques.</span></span>
              </label>
              <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${riskModel === 'INDIVIDUEL' ? 'border-brand-600 bg-brand-50/50' : 'border-slate-200'}`}>
                <input type="radio" name="riskModel" checked={riskModel === 'INDIVIDUEL'} onChange={() => setRiskModel('INDIVIDUEL')} className="mt-1" />
                <span><span className="font-semibold">👤 Individuel</span><br /><span className="text-xs text-slate-500">Excédents intégralement conservés, déficits sans recours au fonds. Sortie de mutualité définitive après 24 mois seulement.</span></span>
              </label>
            </div>
          </div>

          <div className="card-p text-xs text-slate-500 space-y-1.5">
            <p>• Co-paiement de 15% s'applique sur chaque prestation (part restant à votre charge).</p>
            <p>• Délai de carence éventuel : {product?.waitingPeriodDays > 0 ? `${product.waitingPeriodDays} jours` : 'aucun'} à compter de l'activation.</p>
            <p>• Contrat porté par {product?.insurerPartner?.name}. SantéPlus agit comme plateforme technologique.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => setStep(5)}>Retour</button>
            <button className="btn-primary flex-[2]" disabled={busy} onClick={subscribe}>{busy ? 'Création…' : 'Valider ma souscription'}</button>
          </div>
        </div>
      )}

      {/* Étape 7 : Paiement */}
      {step === 7 && subscription && (
        <div className="space-y-4">
          <div className="card-p">
            <h3 className="font-semibold">Contrat {subscription.number} créé</h3>
            {subscription.adhesion && (
              <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-600">Cotisation 1ère échéance</span><span className="font-medium">{fcfa(subscription.firstPayment.amount)}</span></div>
                <div className="flex justify-between"><span className="text-slate-600">Frais d'adhésion ({subscription.adhesion.personsCount} pers. × {fcfa(subscription.adhesion.perPerson)}) — une fois</span><span className="font-medium">{fcfa(subscription.adhesion.adhesionFee)}</span></div>
                <div className="mt-2 flex justify-between border-t border-amber-200 pt-2 font-bold text-amber-800"><span>Total à régler</span><span>{fcfa(subscription.firstPayment.totalFirstPayment ?? subscription.firstPayment.amount + (subscription.adhesion.adhesionFee ?? 0))}</span></div>
              </div>
            )}
            {!subscription.adhesion && (
              <p className="mt-1 text-sm text-slate-500">Réglez {fcfa(subscription.firstPayment.amount)} pour activer votre couverture.</p>
            )}
            <Field label="Moyen de paiement">
              {methodsError && <ErrorBanner message={methodsError} />}
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
            {busy ? 'Traitement du paiement…' : `Payer ${fcfa(subscription.firstPayment.totalFirstPayment ?? subscription.firstPayment.amount + (subscription.adhesion?.adhesionFee ?? 0))}`}
          </button>
        </div>
      )}

      {/* Étape 8 : Terminé */}
      {step === 8 && (
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

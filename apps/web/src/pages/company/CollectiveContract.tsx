import { useEffect, useState } from 'react';
import { api, getToken } from '../../api';
import { fcfa, fmtDate, FREQUENCY_LABELS, statusLabel, statusStyle } from '../../format';
import { ErrorBanner, Field, Spinner, StatusBadge } from '../../components/ui';

export default function CollectiveContract() {
  const [contract, setContract] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [mode, setMode] = useState<'view' | 'subscribe'>('view');
  const [productId, setProductId] = useState('');
  const [employeesCount, setEmployeesCount] = useState(10);
  const [frequency, setFrequency] = useState('QUARTERLY');
  const [quote, setQuote] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get('/company/me/group-contract')
      .then(c => {
        setContract(c);
        setMode(c ? 'view' : 'subscribe');
      })
      .catch(() => {
        setContract(null);
        setMode('subscribe');
      });
  };

  useEffect(() => {
    load();
    api.get<any[]>('/products?clientType=COMPANY').then(setProducts).catch(() => {});
  }, []);

  const [method, setMethod] = useState('MOCK_MOMO');
  const [methods, setMethods] = useState<any[]>([]);

  useEffect(() => {
    api.get<any[]>('/payments/methods')
      .then(m => {
        setMethods(m);
        const available = m.find(x => x.available);
        if (available) setMethod(available.code);
      })
      .catch(() => {});
  }, []);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/subscription/subscribe-company', { productId, employeesCount, frequency });
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Souscription impossible');
    } finally {
      setBusy(false);
    }
  }

  async function payNextDue() {
    if (!contract) return;
    setBusy(true);
    try {
      const init = await api.post<any>('/payments/initiate', { contractId: contract.id, method });
      if (init.initiation?.instructions?.mode === 'REDIRECT' && init.initiation.instructions.redirectUrl) {
        window.location.href = init.initiation.instructions.redirectUrl;
        return;
      }
      await api.post('/payments/mock/confirm', { paymentId: init.payment.id, outcome: 'SUCCESS' });
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Paiement impossible');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'view' && !products.length && !contract) return <Spinner />;

  if (mode === 'subscribe') {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <h1 className="text-xl font-bold">Souscrire le contrat collectif</h1>
        <ErrorBanner message={error} />
        {products.length === 0 ? (
          <div className="card-p text-sm text-slate-500">Aucun produit collectif disponible actuellement.</div>
        ) : (
          <>
            <Field label="Formule collective">
              <select className="input" value={productId} onChange={e => setProductId(e.target.value)}>
                <option value="">Choisir…</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nombre de salariés à couvrir">
                <input type="number" min={1} className="input" value={employeesCount} onChange={e => setEmployeesCount(Number(e.target.value))} />
              </Field>
              <Field label="Fréquence de paiement">
                <select className="input" value={frequency} onChange={e => setFrequency(e.target.value)}>
                  <option value="ANNUAL">{FREQUENCY_LABELS.ANNUAL}</option>
                  <option value="QUARTERLY">{FREQUENCY_LABELS.QUARTERLY}</option>
                  <option value="MONTHLY">{FREQUENCY_LABELS.MONTHLY}</option>
                </select>
              </Field>
            </div>
            {productId && (
              <div className="card-p text-sm">
                <p className="font-medium">Estimation</p>
                <p className="mt-1 text-slate-500">
                  {fcfa(products.find(p => p.id === productId)?.pricePerAdditionalAdultAnnual ?? 0)} / salarié / an
                </p>
              </div>
            )}
            <button className="btn-primary w-full" disabled={!productId || busy} onClick={subscribe}>
              {busy ? 'Création…' : 'Créer le contrat collectif'}
            </button>
            <p className="text-xs text-slate-400">Le contrat sera créé en attente de paiement. Vous pourrez ensuite importer vos salariés.</p>
          </>
        )}
      </div>
    );
  }

  if (!contract) return <Spinner />;
  void quote;

  const nextDue = contract.contributions.find((c: any) => ['PENDING', 'OVERDUE'].includes(c.status));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Contrat collectif</h1>
      <ErrorBanner message={error} />

      <div className="card-p">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={contract.status} />
          <span className="font-semibold">{contract.product.name}</span>
          <span className="text-sm text-slate-400">{contract.number}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><p className="label">Validité</p>{fmtDate(contract.startDate)} → {fmtDate(contract.endDate)}</div>
          <div><p className="label">Cotisation annuelle</p>{fcfa(contract.premiumAnnual)}</div>
          <div><p className="label">Fréquence</p>{FREQUENCY_LABELS[contract.frequency]}</div>
          <div><p className="label">Porté par</p>{contract.product.insurerPartner?.name ?? '—'}</div>
        </div>
        {nextDue && (
          <button className="btn-primary mt-4 btn-sm" disabled={busy} onClick={payNextDue}>
            Payer l’échéance de {fmtDate(nextDue.dueDate)} ({fcfa(nextDue.amount)})
          </button>
        )}
        {contract.status === 'ACTIVE' && (
          <a
            href={`/api/company/me/attestation?token=${getToken() ?? ''}`}
            target="_blank"
            rel="noreferrer"
            className="btn-outline btn-sm ml-2 mt-4"
          >
            📄 Attestation collective (PDF)
          </a>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className="th">#</th><th className="th">Échéance</th><th className="th">Montant</th><th className="th">Statut</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {contract.contributions.map((c: any) => (
              <tr key={c.id}>
                <td className="td">{c.sequence}</td>
                <td className="td">{fmtDate(c.dueDate)}</td>
                <td className="td font-medium">{fcfa(c.amount)}</td>
                <td className="td"><span className={`badge ${statusStyle(c.status)}`}>{statusLabel(c.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-p bg-slate-50 border-dashed text-xs text-slate-500">
        Chaque salarié importé reçoit son propre compte assuré et sa carte numérique. L’entreprise ne consulte que des données agrégées
        de sinistralité, jamais les détails médicaux individuels.
      </div>
    </div>
  );
}

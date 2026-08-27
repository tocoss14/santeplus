import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, API_BASE, getToken } from '../../api';
import { fcfa, fmtDate, FREQUENCY_LABELS, statusLabel, statusStyle } from '../../format';
import { ErrorBanner, Spinner } from '../../components/ui';

export default function MyContract() {
  const [contracts, setContracts] = useState<any[] | null>(null);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    api.get<any[]>('/contracts/mine').then(async list => {
      setContracts(list);
      if (list.length) {
        const d = await api.get(`/contracts/${list[0].id}`);
        setDetail(d);
      }
    }).catch(() => setContracts([]));
  }, []);

  if (!contracts) return <Spinner />;
  if (!contracts.length)
    return (
      <div className="card-p text-center">
        <p className="text-lg font-semibold">Aucun contrat pour le moment</p>
        <Link to="/app/souscrire" className="btn-primary mt-4">Souscrire une formule</Link>
      </div>
    );

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Mon contrat</h1>
      {detail && detail.status === 'PENDING_PAYMENT' && (
        <PendingPaymentCard contract={detail} onPaid={() => window.location.reload()} />
      )}
      {detail && ['ACTIVE', 'SUSPENDED'].includes(detail.status) && (
        <>
          <ContractSummary detail={detail} />
          <CapsList caps={detail.caps} />
        </>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className="th">Échéance</th><th className="th">Montant</th><th className="th">Statut</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {detail?.contributions?.map((c: any) => (
              <tr key={c.id}>
                <td className="td">{fmtDate(c.dueDate)}</td>
                <td className="td font-medium">{fcfa(c.amount)}</td>
                <td className="td"><span className={`badge ${statusStyle(c.status)}`}>{statusLabel(c.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContractSummary({ detail }: { detail: any }) {
  return (
    <div className="card-p">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`badge ${statusStyle(detail.status)}`}>{statusLabel(detail.status)}</span>
        <h2 className="font-bold">{detail.product.name}</h2>
        <span className="text-sm text-slate-400">{detail.number}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><p className="label">Validité</p>{fmtDate(detail.startDate)} → {fmtDate(detail.endDate)}</div>
        <div><p className="label">Cotisation</p>{fcfa(detail.premiumAnnual)}/an</div>
        <div><p className="label">Fréquence</p>{FREQUENCY_LABELS[detail.frequency]}</div>
        <div><p className="label">Porté par</p>{detail.product.insurerPartner?.name ?? '—'}</div>
      </div>
      <a
        href={`${API_BASE}/api/contracts/${detail.id}/certificate?token=${getToken() ?? ''}`}
        target="_blank"
        rel="noreferrer"
        className="btn-outline btn-sm mt-4"
      >
        📄 Télécharger le certificat d’adhésion (PDF)
      </a>
    </div>
  );
}

function CapsList({ caps }: { caps: any[] }) {
  return (
    <div className="card-p">
      <h2 className="font-semibold mb-1">Plafonds & garanties</h2>
      <p className="text-xs text-slate-400">Consommation depuis la date d’anniversaire du contrat.</p>
      <ul className="mt-3 space-y-3">
        {caps.map(c => {
          const pct = c.annualLimit ? Math.min(100, Math.round((c.used / c.annualLimit) * 100)) : 0;
          return (
            <li key={c.categoryId}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-slate-500">
                  taux {c.rate}% · reste {c.remaining == null ? 'illimité' : fcfa(c.remaining)}
                  {c.annualLimit != null && ` / ${fcfa(c.annualLimit)}`}
                </span>
              </div>
              {c.annualLimit != null && (
                <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                  <div className={`h-1.5 rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-400' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PendingPaymentCard({ contract, onPaid }: { contract: any; onPaid: () => void }) {
  const next = contract.contributions.find((c: any) => ['PENDING', 'OVERDUE'].includes(c.status));
  const [methods, setMethods] = useState<any[]>([]);
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<any[]>('/payments/methods')
      .then(m => {
        setMethods(m);
        if (m[0]) setMethod(m[0].code);
      })
      .catch(() => {});
  }, []);

  if (!next) return null;

  return (
    <div className="card-p border-amber-300 bg-amber-50">
      <p className="font-semibold text-amber-800">Paiement en attente — {fcfa(next.amount)} à régler pour activer votre contrat.</p>
      {error && <ErrorBanner message={error} />}
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <select className="input sm:w-64" value={method} onChange={e => setMethod(e.target.value)}>
          {methods.map(m => <option key={m.code} value={m.code}>{m.label}</option>)}
        </select>
        <button
          className="btn-primary"
          disabled={busy || !method}
          onClick={async () => {
            setBusy(true);
            try {
              const init = await api.post<any>('/payments/initiate', { contractId: contract.id, method });
              if (init.initiation?.instructions?.mode === 'REDIRECT' && init.initiation.instructions.redirectUrl) {
                window.location.href = init.initiation.instructions.redirectUrl;
                return;
              }
              await api.post('/payments/mock/confirm', { paymentId: init.payment.id, outcome: 'SUCCESS' });
              onPaid();
            } catch (e: any) {
              setError(e?.message ?? 'Paiement impossible');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Traitement…' : 'Payer maintenant'}
        </button>
      </div>
    </div>
  );
}

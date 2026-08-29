import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Link } from 'react-router-dom';
import { api, API_BASE, getToken } from '../../api';
import { fcfa, fmtDate, FREQUENCY_LABELS, statusLabel, statusStyle } from '../../format';
import { ErrorBanner, Field, Spinner, StatusBadge } from '../../components/ui';

type Tab = 'contrat' | 'paiements' | 'carte';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'contrat', label: 'Contrat', icon: '📄' },
  { key: 'paiements', label: 'Échéancier', icon: '💳' },
  { key: 'carte', label: 'Carte', icon: '🪪' },
];

export default function MyContractUnified() {
  const [tab, setTab] = useState<Tab>('contrat');
  const [contracts, setContracts] = useState<any[] | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => {
    api.get<any[]>('/contracts/mine').then(async list => {
      setContracts(list);
      if (list.length) {
        const d = await api.get(`/contracts/${list[0].id}`);
        setDetail(d);
        const pmts = await api.get<any[]>('/payments/mine').catch(() => []);
        setPayments(pmts);
      }
    }).catch(() => setContracts([]));
  }, []);

  if (!contracts) return <Spinner />;

  if (!contracts.length)
    return (
      <div className="card-p text-center py-12">
        <p className="text-3xl mb-3">📄</p>
        <p className="text-lg font-semibold">Aucun contrat</p>
        <Link to="/app/souscrire" className="btn-primary mt-4">Souscrire une formule</Link>
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Onglets */}
      <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition ${
              tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {tab === 'contrat' && detail && <ContractTab detail={detail} />}
      {tab === 'paiements' && detail && <PaymentsTab detail={detail} payments={payments} />}
      {tab === 'carte' && detail && <CardTab detail={detail} />}
    </div>
  );
}

function ContractTab({ detail }: { detail: any }) {
  const daysLeft = detail.endDate
    ? Math.ceil((new Date(detail.endDate).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="space-y-4">
      {detail.status === 'PENDING_PAYMENT' && (
        <PendingPaymentCard contract={detail} onPaid={() => window.location.reload()} />
      )}

      {['ACTIVE', 'SUSPENDED'].includes(detail.status) && (
        <>
          <div className="card-p">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={detail.status} />
              <h2 className="font-bold">{detail.product.name}</h2>
              <span className="text-sm text-slate-400">{detail.number}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><p className="text-xs text-slate-400">Validité</p>{fmtDate(detail.startDate)} → {fmtDate(detail.endDate)}</div>
              <div><p className="text-xs text-slate-400">Cotisation</p>{fcfa(detail.premiumAnnual)}/an</div>
              <div><p className="text-xs text-slate-400">Fréquence</p>{FREQUENCY_LABELS[detail.frequency]}</div>
              <div><p className="text-xs text-slate-400">Porté par</p>{detail.product.insurerPartner?.name ?? '—'}</div>
            </div>
            {daysLeft != null && daysLeft <= 30 && (
              <div className="mt-3 rounded-lg bg-orange-50 border border-orange-200 px-3 py-2">
                <p className="text-sm font-medium text-orange-800">⚠️ Expire dans {daysLeft} jours</p>
                <button
                  className="btn-primary btn-sm mt-2"
                  onClick={async () => { await api.post(`/contracts/${detail.id}/renew`); window.location.reload(); }}
                >
                  Renouveler
                </button>
              </div>
            )}
          </div>

          {/* Plafonds */}
          <div className="card-p">
            <h3 className="font-semibold mb-3">Plafonds & garanties</h3>
            <ul className="space-y-3">
              {detail.caps?.map((c: any) => {
                const pct = c.annualLimit ? Math.min(100, Math.round((c.used / c.annualLimit) * 100)) : 0;
                return (
                  <li key={c.categoryId ?? c.label}>
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

          {/* Ayants droit */}
          {detail.beneficiaries?.length > 0 && (
            <div className="card-p">
              <h3 className="font-semibold mb-2">Ayants droit ({detail.beneficiaries.length})</h3>
              <ul className="divide-y divide-slate-100">
                {detail.beneficiaries.map((b: any) => (
                  <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{b.firstName} {b.lastName}</span>
                    <span className="text-xs text-slate-400">{b.memberNumber}</span>
                  </li>
                ))}
              </ul>
              <Link to="/app/beneficiaires" className="btn-outline btn-sm mt-3 w-full">Gérer les ayants droit</Link>
            </div>
          )}

          {/* PDF */}
          <a
            href={`${API_BASE}/api/contracts/${detail.id}/certificate?token=${getToken() ?? ''}`}
            target="_blank"
            rel="noreferrer"
            className="btn-outline w-full"
          >
            📄 Télécharger le certificat d'adhésion (PDF)
          </a>
        </>
      )}
    </div>
  );
}

function PaymentsTab({ detail, payments }: { detail: any; payments: any[] }) {
  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead><tr><th className="th">Échéance</th><th className="th">Montant</th><th className="th">Statut</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {detail.contributions?.map((c: any) => (
              <tr key={c.id}>
                <td className="td">{fmtDate(c.dueDate)}</td>
                <td className="td font-medium">{fcfa(c.amount)}</td>
                <td className="td"><span className={`badge ${statusStyle(c.status)}`}>{statusLabel(c.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {payments.length > 0 && (
        <div className="card-p">
          <h3 className="font-semibold mb-2">Historique des paiements</h3>
          <ul className="divide-y divide-slate-100">
            {payments.map(p => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium">{fcfa(p.amount)}</span>
                  <span className="text-xs text-slate-400 ml-2">{p.method}</span>
                </div>
                <div className="text-right">
                  <span className={`badge ${statusStyle(p.status)}`}>{statusLabel(p.status)}</span>
                  {p.contract && <p className="text-[10px] text-slate-400">{p.contract.number}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CardTab({ detail }: { detail: any }) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  // QR code generated client-side via qrcode.react

  return (
    <div className="space-y-4">
      <div className="card-p bg-gradient-to-br from-slate-900 to-slate-800 text-white border-slate-900 text-center py-8">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-2xl mb-3">🪪</div>
        <h2 className="text-lg font-bold">Carte d'assuré numérique</h2>
        <p className="text-sm text-slate-300 mt-1">{detail.product.name}</p>
        <p className="text-xs text-slate-400 mt-0.5">{detail.number}</p>
      </div>

      <div className="card-p text-center">
        <div className="flex justify-center">
          <QRCodeSVG value={JSON.stringify({ card: detail.cardToken })} size={180} />
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-400">
          Présentez ce QR chez un prestataire partenaire
        </p>
        <p className="mt-1 text-[10px] text-slate-300 font-mono break-all">Token : {detail.cardToken}</p>
      </div>

      <div className="card-p">
        <h3 className="font-semibold mb-1">Comment ça marche ?</h3>
        <ol className="text-sm text-slate-600 space-y-2 list-decimal pl-5">
          <li>Présentez ce QR code ou votre numéro assuré au prestataire.</li>
          <li>Le prestataire vérifie vos droits et plafonds en temps réel.</li>
          <li>Pour les soins couverts par le tiers payant, aucune avance n'est nécessaire.</li>
          <li>Vous ne payez que le reste à charge.</li>
        </ol>
      </div>
    </div>
  );
}

function PendingPaymentCard({ contract, onPaid }: { contract: any; onPaid: () => void }) {
  const next = contract.contributions?.find((c: any) => ['PENDING', 'OVERDUE'].includes(c.status));
  const [methods, setMethods] = useState<any[]>([]);
  const [method, setMethod] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<any[]>('/payments/methods').then(m => { setMethods(m); if (m[0]) setMethod(m[0].code); }).catch(() => {});
  }, []);

  if (!next) return null;

  return (
    <div className="card-p border-amber-300 bg-amber-50">
      <p className="font-semibold text-amber-800">⏳ Paiement en attente — {fcfa(next.amount)} à régler</p>
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
            } finally { setBusy(false); }
          }}
        >
          {busy ? 'Traitement…' : 'Payer maintenant'}
        </button>
      </div>
    </div>
  );
}

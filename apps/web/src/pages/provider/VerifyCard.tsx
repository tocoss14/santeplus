import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate, CATEGORY_LABELS } from '../../format';
import { ErrorBanner, Field, Spinner } from '../../components/ui';
import QrScanner from '../../components/QrScanner';
import { printDocument, escapeHtml } from '../../print';

export default function VerifyCard() {
  const [token, setToken] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function verify(rawToken?: string) {
    const value = (rawToken ?? token).trim().replace(/^"|"$/g, '');
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<any>('/provider/verify', { cardToken: value });
      setResult(res);
    } catch (e: any) {
      setError(e?.message ?? 'Vérification impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Vérification carte d’assuré</h1>
        <p className="mt-0.5 text-sm text-slate-500">Scannez le QR code de la carte ou saisissez le jeton.</p>
      </div>

      <div className="card-p">
        <ErrorBanner message={error} />
        <Field label="Jeton de vérification">
          <input
            className="input font-mono"
            placeholder="tok_xxxxxxxxxxxx"
            value={token}
            onChange={e => setToken(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !busy && token.length >= 10 && verify()}
            autoFocus
          />
        </Field>
        <div className="flex gap-2">
          <button className="btn-primary flex-[2]" disabled={busy || token.length < 10} onClick={() => verify()}>
            {busy ? 'Vérification…' : '🔎 Vérifier la couverture'}
          </button>
          <button className="btn-outline flex-1" onClick={() => setScanning(true)}>📷 Scanner</button>
        </div>
      </div>

      {scanning && (
        <QrScanner
          onDetected={(text) => {
            setScanning(false);
            let value = text.trim();
            try {
              const parsed = JSON.parse(value);
              const candidate = parsed?.t ?? parsed?.token;
              if (typeof candidate === 'string' && candidate.length >= 8) value = candidate;
            } catch {
              const match = value.match(/"(?:t|token)"\s*:\s*"([^"]+)"/);
              if (match) value = match[1];
            }
            setToken(value);
            void verify(value);
          }}
          onClose={() => setScanning(false)}
        />
      )}

      {result && (
        <VerifyResult
          r={result}
          scannedToken={token.trim().replace(/^"|"$/g, '')}
          onNew={() => { setResult(null); setToken(''); }}
        />
      )}
    </div>
  );
}

function VerifyResult({ r, scannedToken, onNew }: { r: any; scannedToken: string; onNew: () => void }) {
  const [tpOpen, setTpOpen] = useState(false);
  if (!r.contract) return <Spinner />;
  const active = r.contract.status === 'ACTIVE' && r.warnings.length === 0;

  return (
    <div className={`card overflow-hidden ${active ? 'ring-2 ring-emerald-400' : 'ring-2 ring-amber-400'}`}>
      <div className={`px-5 py-3 font-semibold ${active ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-amber-900'}`}>
        {active ? '✅ Couverture valide — prise en charge possible' : '⚠️ Vérification requise'}
      </div>
      <div className="card-p space-y-4">
        <div>
          <p className="text-lg font-bold">{r.contract.holder}</p>
          <p className="text-sm text-slate-500">{r.contract.productName} · contrat {r.contract.number}</p>
          <p className="text-xs text-slate-400">
            N° assuré {r.contract.memberNumber} · validité {fmtDate(r.contract.startDate)} → {fmtDate(r.contract.endDate)}
          </p>
        </div>

        {r.warnings.length > 0 && (
          <ul className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 list-disc pl-6">
            {r.warnings.map((w: string) => <li key={w}>{w}</li>)}
          </ul>
        )}

        <div>
          <p className="label mb-1.5">Plafonds restants</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {r.caps.map((c: any) => (
                <tr key={c.category}>
                  <td className="td py-2">{c.label}</td>
                  <td className="td py-2 text-right text-xs text-slate-500">taux {c.rate}%</td>
                  <td className="td py-2 text-right font-medium whitespace-nowrap">
                    {c.remaining == null ? 'Illimité' : fcfa(c.remaining)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {r.beneficiariesCount > 0 && (
          <p className="text-xs text-slate-500">+ {r.beneficiariesCount} ayant(s) droit couvert(s)</p>
        )}

        {active && (
          <button className="btn-primary w-full" onClick={() => setTpOpen(o => !o)}>
            🧾 Nouvelle prise en charge (tiers payant)
          </button>
        )}
        <button className="btn-outline w-full" onClick={onNew}>Vérifier un autre assuré</button>
      </div>

      {tpOpen && active && (
        <ThirdPartyFlow contractToken={scannedToken} beneficiaries={r.beneficiaries ?? []} caps={r.caps} onClose={() => setTpOpen(false)} />
      )}
    </div>
  );
}

function ThirdPartyFlow({ contractToken, beneficiaries, caps, onClose }: { contractToken: string; beneficiaries: any[]; caps: any[]; onClose: () => void }) {
  void onClose;
  void caps;
  const [providers, setProviders] = useState<any[]>([]);
  const [establishmentId, setEstablishmentId] = useState('');
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [items, setItems] = useState([{ categoryId: '', amountRequested: '' }]);
  const [categories, setCategories] = useState<any[]>([]);
  const [quote, setQuote] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<any[]>('/providers').then(p => setProviders(p.slice(0, 100))).catch(() => {});
    api.get<any[]>('/claims/categories').then(setCategories).catch(() => {});
  }, []);

  function calculate() {
    setQuote(null); setReceipt(null); setError(null);
    const payload = {
      cardToken: contractToken,
      beneficiaryId: beneficiaryId || undefined,
      providerId: establishmentId || undefined,
      items: items.filter(i => i.categoryId && Number(i.amountRequested) > 0)
        .map(i => ({ categoryId: i.categoryId, amountRequested: Number(i.amountRequested) })),
    };
    if (!payload.items.length) return setError('Ajoutez au moins un acte');
    setBusy(true);
    api.post<any>('/provider/thirdparty/initiate', payload)
      .then(setQuote)
      .catch(e => setError(e?.message ?? 'Calcul impossible'))
      .finally(() => setBusy(false));
  }

  function confirm() {
    if (!quote) return;
    setBusy(true); setError(null);
    api.post<any>(`/provider/thirdparty/${quote.id}/confirm`)
      .then(res => { if (res.receipt) setReceipt(res.receipt); })
      .catch(e => setError(e?.message ?? 'Confirmation impossible'))
      .finally(() => setBusy(false));
  }

  function printReceiptDoc() {
    if (!receipt) return;
    const establishment = providers.find(pr => pr.id === establishmentId)?.name ?? 'Établissement partenaire';
    const rows = receipt.items.map((i: any) => `
      <tr>
        <td>${escapeHtml(CATEGORY_LABELS[i.label] ?? i.label)}</td>
        <td class="num">${fcfa(i.requested)}</td>
        <td class="num">− ${fcfa(i.covered)}</td>
      </tr>`).join('');
    printDocument(
      `Reçu ${receipt.reference}`,
      `
      <div class="band">
        <div>
          <div class="brand">SantéPlus Bénin</div>
          <div class="tag">Votre santé. Votre couverture. Simplement.</div>
        </div>
        <div style="text-align:right;font-size:11px">
          <div><b>${escapeHtml(establishment)}</b></div>
          <div>Reçu de prise en charge</div>
        </div>
      </div>
      <h1>Tiers payant — ${escapeHtml(receipt.reference)}</h1>
      <div class="meta">Émis le ${new Date(receipt.date).toLocaleString('fr-FR')}</div>
      <div class="info"><b>Patient</b> ${escapeHtml(receipt.patient)}${receipt.beneficiary ? ` — ${escapeHtml(receipt.beneficiary)}` : ''}</div>
      <div class="info"><b>Formule</b> ${escapeHtml(receipt.product)}</div>
      <table>
        <thead><tr><th>Prestation</th><th class="num">Montant</th><th class="num">Pris en charge</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>Total des actes</span><span>${fcfa(receipt.requested)}</span></div>
        <div class="row big"><span>Pris en charge par l’assurance</span><span>${fcfa(receipt.covered)}</span></div>
        <div class="row amber"><span>À payer par le patient</span><span>${fcfa(receipt.patientDue)}</span></div>
      </div>
      <div class="legal">
        Ce reçu atteste de la prise en charge de la part assurée par le partenaire assureur via la plateforme SantéPlus.
        Le patient a réglé la somme indiquée « à payer par le patient » au moment de la prestation.
        Conservez ce document. SantéPlus agit en qualité d’intermédiaire technologique — les garanties sont portées par l’assureur partenaire.
      </div>
      `,
    );
  }

  if (receipt) {
    return (
      <div className="border-t border-slate-200 bg-brand-50/50 p-5">
        <h3 className="font-bold text-brand-800">✅ Prise en charge enregistrée — {receipt.reference}</h3>
        <div id="tp-receipt" className="mt-3 bg-white rounded-lg border border-slate-200 p-4 text-sm space-y-2">
          <p><b>Patient :</b> {receipt.patient}{receipt.beneficiary ? ` (${receipt.beneficiary})` : ''}</p>
          <p><b>Formule :</b> {receipt.product}</p>
          <table className="w-full mt-2">
            <tbody className="divide-y divide-slate-100">
              {receipt.items.map((i: any) => (
                <tr key={i.label}>
                  <td className="py-1">{CATEGORY_LABELS[i.label] ?? i.label}</td>
                  <td className="py-1 text-right text-xs text-slate-400">{fcfa(i.requested)}</td>
                  <td className="py-1 text-right font-medium">−{fcfa(i.covered)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between border-t pt-2 font-bold text-emerald-700"><span>Pris en charge</span><span>{fcfa(receipt.covered)}</span></div>
          <div className="flex justify-between font-bold"><span>À payer par le patient maintenant</span><span>{fcfa(receipt.patientDue)}</span></div>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-outline flex-1 btn-sm" onClick={printReceiptDoc}>🖨️ Imprimer le reçu</button>
          <button className="btn-primary flex-1 btn-sm" onClick={() => { setReceipt(null); setQuote(null); setItems([{ categoryId: '', amountRequested: '' }]); }}>Nouvelle prise en charge</button>
        </div>
      </div>
    );
  }

  const est = quote?.estimation?.totals;
  const estItems = quote?.estimation?.items ?? [];

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-5 space-y-3">
      <h3 className="font-semibold">Saisie des actes</h3>
      <ErrorBanner message={error} />

      <Field label="Votre établissement (pour le dossier)">
        <select className="input" value={establishmentId} onChange={e => setEstablishmentId(e.target.value)}>
          <option value="">—</option>
          {providers.map(pr => <option key={pr.id} value={pr.id}>{pr.name} ({pr.city})</option>)}
        </select>
      </Field>

      {beneficiaries.length > 0 && (
        <Field label="Patient concerné">
          <select className="input" value={beneficiaryId} onChange={e => setBeneficiaryId(e.target.value)}>
            <option value="">Assuré principal</option>
            {beneficiaries.map(b => <option key={b.memberNumber} value={b.memberNumber}>{b.firstName} {b.lastName}</option>)}
          </select>
        </Field>
      )}

      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="flex gap-2">
            <select
              className="input flex-1"
              value={it.categoryId}
              onChange={e => setItems(a => a.map((x, j) => j === idx ? { ...x, categoryId: e.target.value } : x))}
            >
              <option value="">Acte…</option>
              {categories.map(c => <option key={c.category} value={c.category}>{CATEGORY_LABELS[c.category] ?? c.name}</option>)}
            </select>
            <input
              type="number" min={1} placeholder="Montant" className="input w-32"
              value={it.amountRequested}
              onChange={e => setItems(a => a.map((x, j) => j === idx ? { ...x, amountRequested: e.target.value } : x))}
            />
            {items.length > 1 && <button onClick={() => setItems(a => a.filter((_, j) => j !== idx))} className="px-1 text-red-500">✕</button>}
          </div>
        ))}
        <button onClick={() => setItems(a => [...a, { categoryId: '', amountRequested: '' }])} className="text-xs font-semibold text-brand-700 hover:underline">＋ Ajouter un acte</button>
      </div>

      {!quote && (
        <button className="btn-primary w-full" disabled={busy} onClick={calculate}>
          {busy ? 'Calcul…' : '🧮 Calculer la prise en charge'}
        </button>
      )}

      {est && quote && !receipt && (
        <div className="rounded-xl border border-brand-200 bg-white p-4 space-y-2">
          <p className="label mb-0">Calcul instantané — {quote.reference}</p>
          <Row label="Montant total des actes" value={fcfa(est.requested)} />
          <Row label="Couvert par l’assurance" value={fcfa(est.approved)} strong />
          <Row label="Franchises déduites" value={fcfa(estItems.reduce((s: number, i: any) => s + (i.deductibleApplied ?? 0), 0))} />
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 flex justify-between font-bold text-amber-900">
            <span>À payer par le patient</span><span>{fcfa(est.outOfPocket)}</span>
          </div>
          {quote.authRequired ? (
            <div className="rounded-lg bg-orange-50 border border-orange-300 px-3 py-2.5 text-sm text-orange-800">
              ⏳ <b>Autorisation préalable requise</b> (montant au-delà du seuil configuré).
              Le gestionnaire doit approuver avant confirmation.
            </div>
          ) : null}
          <div className="flex gap-2 pt-1">
            <button className="btn-outline flex-1 btn-sm" disabled={busy} onClick={() => setQuote(null)}>Modifier les actes</button>
            <button className="btn-primary flex-[2] btn-sm" disabled={busy || quote.authRequired} onClick={confirm}>
              ✅ Confirmer la prestation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${strong ? 'font-bold text-emerald-700' : ''}`}>
      <span className={strong ? '' : 'text-slate-500'}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

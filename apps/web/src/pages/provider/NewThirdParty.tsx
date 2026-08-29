import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { fcfa, CATEGORY_LABELS } from '../../format';
import { ErrorBanner, Field, Spinner } from '../../components/ui';

// Task 10 — Tiers payant PHARMACY : le circuit direct "legacy" sans ordonnance
// a été supprimé côté API (provider-portal.controller.ts). Pour PHARMACY ou
// tout acte avec requiresPrescription==true, l'API exige une prescription
// valide (400 sinon). Le circuit direct reste autorisé uniquement pour les
// actes sans prescription (ex: CONSULTATION). Côté UI, la délivrance PHARMACY
// passe exclusivement par ProviderDeliveries (scan ordonnance d'abord).

interface Act { id: string; code: string; name: string; categoryId: string; referencePrice: number }
interface Line { actId?: string; code: string; label: string; categoryId: string; quantity: number; unitPrice: number; practitioner: string }
interface VerifyResult { contract: any; beneficiaries: any[]; caps: any[]; warnings: string[] }

export default function NewThirdParty() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [query, setQuery] = useState('');
  const [verified, setVerified] = useState<VerifyResult | null>(null);
  const [beneficiaryMn, setBeneficiaryMn] = useState('');
  const [acts, setActs] = useState<Act[]>([]);
  const [actQuery, setActQuery] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState('');
  const [certified, setCertified] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [confirmed, setConfirmed] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Act[]>('/provider/acts').then(setActs).catch(() => {});
  }, []);

  const filteredActs = useMemo(() => {
    const q = actQuery.trim().toLowerCase();
    if (!q) return acts.slice(0, 12);
    return acts.filter(a => a.name.toLowerCase().includes(q) || a.code.toLowerCase().includes(q)).slice(0, 12);
  }, [acts, actQuery]);

  async function identify() {
    setBusy(true); setError(null); setVerified(null);
    try {
      let value = query.trim();
      if (value.startsWith('{')) { try { value = JSON.parse(value)?.t ?? value; } catch { /* brut */ } }
      const payload: Record<string, string> = /^CTR-/.test(value)
        ? { contractNumber: value }
        : value.startsWith('tok_') || value.length >= 20 ? { cardToken: value } : { memberNumber: value };
      const res = await api.post<VerifyResult>('/provider/verify', payload);
      setVerified(res);
      setStep(2);
    } catch (e: any) {
      setError(e?.message ?? 'Assuré introuvable');
    } finally {
      setBusy(false);
    }
  }

  function addAct(act: Act) {
    setLines(ls => [...ls, {
      actId: act.id, code: act.code, label: act.name, categoryId: act.categoryId,
      quantity: 1, unitPrice: act.referencePrice, practitioner: '',
    }]);
    setActQuery('');
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  const total = lines.reduce((a, l) => a + l.quantity * l.unitPrice, 0);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const payload = {
        cardToken: verified?.contract ? undefined : undefined,
        memberNumber: verified?.contract?.memberNumber,
        beneficiaryMemberNumber: beneficiaryMn || undefined,
        note: note || undefined,
        items: lines.map(l => ({
          actId: l.actId, code: l.code, label: l.label, categoryId: l.categoryId,
          quantity: l.quantity, unitPrice: l.unitPrice, practitioner: l.practitioner || undefined,
        })),
      };
      const fd = new FormData();
      fd.append('payload', JSON.stringify(payload));
      for (const f of files) fd.append('documents', f);
      const res = await api.post<any>('/provider/thirdparty/initiate', fd);
      setResult(res);
      setStep(4);
    } catch (e: any) {
      setError(e?.message ?? 'Soumission impossible');
    } finally {
      setBusy(false);
    }
  }

  async function confirmNow() {
    if (!result) return;
    setBusy(true); setError(null);
    try {
      const res = await api.post<any>(`/provider/thirdparty/${result.id}/confirm`);
      setConfirmed(res);
    } catch (e: any) {
      setError(e?.message ?? 'Confirmation impossible');
    } finally {
      setBusy(false);
    }
  }

  if (step === 4 && result) {
    const est = result.estimation?.totals;
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-xl font-bold">Prise en charge {result.reference}</h1>

        {result.authRequired ? (
          <div className="card-p border-orange-300 bg-orange-50">
            <p className="font-semibold text-orange-800 text-lg">⏳ En attente de validation</p>
            <p className="mt-1 text-sm text-orange-700">
              Le montant dépasse le seuil d'autorisation préalable. Le gestionnaire assurance doit valider
              ce dossier. Vous serez notifié de la décision.
            </p>
            <div className="mt-3 text-sm text-slate-700">
              <p>Montant couvert estimé : <b>{fcfa(est?.approved ?? 0)}</b></p>
              <p>Reste à charge patient : <b>{fcfa(est?.outOfPocket ?? 0)}</b></p>
            </div>
            <p className="mt-3 text-xs text-orange-600">Ne réalisez les soins qu'après réception de l'autorisation.</p>
          </div>
        ) : (
          <div className="card-p border-emerald-300 bg-emerald-50">
            <p className="font-semibold text-emerald-800 text-lg">✅ Demande acceptée — prise en charge en temps réel</p>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt>Montant des actes</dt><dd>{fcfa(est?.requested ?? 0)}</dd></div>
              <div className="flex justify-between"><dt>Couvert par l'assurance</dt><dd className="font-bold text-emerald-700">{fcfa(est?.approved ?? 0)}</dd></div>
              <div className="flex justify-between"><dt>Reste à charge patient</dt><dd className="font-bold">{fcfa(est?.outOfPocket ?? 0)}</dd></div>
            </dl>
            <button className="btn-primary w-full mt-4" disabled={busy} onClick={confirmNow}>
              ✅ Confirmer — soins réalisés, patient a payé son reste à charge
            </button>
          </div>
        )}

        {confirmed && (
          <div className="card-p border-brand-300 bg-brand-50">
            <p className="font-semibold text-brand-800">✅ Soins confirmés — {confirmed.reference}</p>
            <p className="text-sm text-slate-600 mt-1">
              La prise en charge est enregistrée. Facturez-la depuis
              la <Link className="font-semibold text-brand-700 underline" to={`/prestataire/prises/${result.id}`}>fiche du dossier</Link>.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Link to="/prestataire/prises" className="btn-outline flex-1">Voir mes prises en charge</Link>
          <button className="btn-primary flex-1" onClick={() => { setStep(1); setVerified(null); setLines([]); setResult(null); setConfirmed(null); setFiles([]); setCertified(false); setQuery(''); }}>
            Nouvelle prise en charge
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">Nouvelle prise en charge</h1>
      <ErrorBanner message={error} />

      {step === 1 && (
        <div className="card-p space-y-4">
          <p className="text-sm text-slate-500">Identifiez le patient : QR de la carte, n° assuré (MEM-…) ou n° de contrat (CTR-…).</p>
          <input
            className="input font-mono text-base"
            placeholder="tok / MEM-A00001 / CTR-2026-"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !busy && query.length >= 4 && identify()}
            autoFocus
          />
          <div className="flex gap-2">
            <Link to="/prestataire/verifier" className="btn-outline flex-1">📷 Scanner la carte</Link>
            <button className="btn-primary flex-[2]" disabled={busy || query.length < 4} onClick={identify}>
              {busy ? 'Vérification…' : 'Vérifier les droits'}
            </button>
          </div>
        </div>
      )}

      {step >= 2 && verified && (
        <div className="card-p">
          <div className="flex flex-wrap items-center gap-2">
            {(verified.contract.status === 'ACTIVE') ? (
              <span className="badge bg-emerald-100 text-emerald-800">CONTRAT ACTIF ✅</span>
            ) : (
              <span className="badge bg-red-100 text-red-700">CONTRAT INACTIF ❌ — {verified.contract.status}</span>
            )}
            <span className="font-bold">{verified.contract.holder}</span>
            <span className="text-xs text-slate-400">{verified.contract.memberNumber}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {verified.contract.productName}
            {verified.contract.insurer ? ` · ${verified.contract.insurer}` : ''}
            {verified.contract.companyName ? ` · ${verified.contract.companyName}` : ''}
          </p>
          {verified.warnings.length > 0 && (
            <ul className="mt-2 text-sm text-amber-700 list-disc pl-5">
              {verified.warnings.map((w: string) => <li key={w}>{w}</li>)}
            </ul>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {verified.caps.map((c: any) => (
              <div key={c.category} className="rounded-lg border border-slate-100 px-3 py-2 flex items-baseline justify-between text-sm">
                <span>{c.label}</span>
                <span className="text-xs text-slate-500">{c.rate} % · dispo {c.remaining == null ? 'illimité' : fcfa(c.remaining)}</span>
              </div>
            ))}
          </div>
          {verified.beneficiaries.length > 0 && (
            <Field label="Patient concerné">
              <select className="input" value={beneficiaryMn} onChange={e => setBeneficiaryMn(e.target.value)}>
                <option value="">Assuré principal</option>
                {verified.beneficiaries.map((b: any) => (
                  <option key={b.memberNumber} value={b.memberNumber}>{b.firstName} {b.lastName} ({b.memberNumber})</option>
                ))}
              </select>
            </Field>
          )}
          {step === 2 && (
            <button className="btn-primary w-full mt-3" onClick={() => setStep(3)}>Continuer — saisir les actes →</button>
          )}
        </div>
      )}

      {step >= 3 && verified && (
        <>
          <div className="card-p space-y-3">
            <h2 className="font-semibold">Actes et prestations</h2>
            <div className="relative">
              <input
                className="input"
                placeholder="Rechercher un acte du catalogue (code ou nom)…"
                value={actQuery}
                onChange={e => setActQuery(e.target.value)}
              />
              {actQuery && (
                <div className="absolute z-10 mt-1 w-full card max-h-64 overflow-y-auto">
                  {filteredActs.map(a => (
                    <button key={a.id} onClick={() => addAct(a)} className="w-full text-left px-3 py-2 hover:bg-brand-50 flex justify-between gap-3">
                      <span><b className="font-mono text-xs text-brand-700">{a.code}</b> {a.name}</span>
                      <span className="text-xs text-slate-400 whitespace-nowrap">{fcfa(a.referencePrice)}</span>
                    </button>
                  ))}
                  {filteredActs.length === 0 && <p className="px-3 py-2 text-sm text-slate-400">Aucun acte — saisissez une ligne libre ci-dessous</p>}
                </div>
              )}
            </div>

            {lines.length === 0 && (
              <button className="btn-outline btn-sm" onClick={() => setLines([{ code: '', label: '', categoryId: 'CONSULTATION', quantity: 1, unitPrice: 0, practitioner: '' }])}>
                ＋ Ligne libre (hors catalogue)
              </button>
            )}

            {lines.map((l, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="badge bg-slate-100">Acte {i + 1} {l.code && <span className="font-mono ml-1">{l.code}</span>}</span>
                  <button onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-xs text-red-600">Retirer</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Désignation">
                    <input className="input" value={l.label} onChange={e => updateLine(i, { label: e.target.value })} />
                  </Field>
                  <Field label="Catégorie">
                    <select className="input" value={l.categoryId} onChange={e => updateLine(i, { categoryId: e.target.value })}>
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </Field>
                  <Field label="Quantité">
                    <input type="number" min={1} className="input" value={l.quantity} onChange={e => updateLine(i, { quantity: Math.max(1, Number(e.target.value) || 1) })} />
                  </Field>
                  <Field label="Prix unitaire (FCFA)">
                    <input type="number" min={1} className="input" value={l.unitPrice} onChange={e => updateLine(i, { unitPrice: Math.max(0, Number(e.target.value) || 0) })} />
                  </Field>
                  <Field label="Praticien (optionnel)">
                    <input className="input" value={l.practitioner} onChange={e => updateLine(i, { practitioner: e.target.value })} placeholder="Dr …" />
                  </Field>
                  <div className="flex items-end pb-3.5 text-sm font-semibold text-slate-600">
                    Total : {fcfa(l.quantity * l.unitPrice)}
                  </div>
                </div>
              </div>
            ))}

            <div className="rounded-lg bg-brand-50 border border-brand-200 px-4 py-3 flex justify-between font-bold text-brand-800">
              <span>Total des actes</span><span>{fcfa(total)}</span>
            </div>
          </div>

          <div className="card-p">
            <Field label="Justificatifs (ordonnance, compte rendu, devis…) — recommandé si autorisation requise">
              <label className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center hover:border-brand-400">
                <span className="text-2xl">📎</span>
                <span className="text-xs text-slate-500 mt-1">PDF, JPEG, PNG — 8 Mo max par fichier</span>
                <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
                  onChange={e => setFiles(Array.from(e.target.files ?? []))} />
              </label>
            </Field>
            {files.length > 0 && (
              <ul className="text-xs text-slate-500 space-y-0.5">
                {files.map(f => <li key={f.name}>📎 {f.name} ({Math.round(f.size / 1024)} Ko)</li>)}
              </ul>
            )}
            <Field label="Observation / motif (optionnel)">
              <textarea rows={2} className="input" value={note} onChange={e => setNote(e.target.value)} />
            </Field>
          </div>

          <div className="card-p">
            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" checked={certified} onChange={e => setCertified(e.target.checked)} className="mt-0.5" />
              <span>Je certifie que les informations saisies correspondent aux prestations demandées/réalisées.</span>
            </label>
            <div className="mt-3 flex gap-2">
              <button className="btn-outline flex-1" onClick={() => setStep(2)}>← Patient</button>
              <button className="btn-primary flex-[2]" disabled={!certified || busy || lines.length === 0} onClick={submit}>
                {busy ? 'Envoi…' : 'ENVOYER LA DEMANDE'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

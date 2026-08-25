import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fileUrl } from '../../api';
import { fcfa, fmtDate, fmtDateTime, statusLabel, statusStyle, CATEGORY_LABELS } from '../../format';
import { ErrorBanner, Spinner } from '../../components/ui';
import { printDocument, escapeHtml } from '../../print';

export default function TpDetail() {
  const { id } = useParams();
  const [claim, setClaim] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<Record<string, { quantity: number; unitPrice: number }>>({});
  const [realizeNote, setRealizeNote] = useState('');
  const [showRealize, setShowRealize] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => api.get(`/provider/thirdparty/${id}`).then(c => {
    setClaim(c);
    setEdits(Object.fromEntries(c.items.map((i: any) => [i.id, { quantity: i.quantity ?? 1, unitPrice: i.unitPrice ?? 0 }])));
  }).catch(e => setError(e?.message ?? 'Erreur'));

  useEffect(() => { if (id) void load(); }, [id]);

  if (error && !claim) return <ErrorBanner message={error} />;
  if (!claim) return <Spinner />;

  const est: any = claim.estimation ? JSON.parse(claim.estimation) : null;
  const canConfirm = ['PENDING_CONFIRMATION', 'AUTHORIZED'].includes(claim.status);
  const canRealize = claim.status === 'CONFIRMED';
  const covered = claim.items.reduce((a: number, i: any) => a + (i.amountApproved ?? 0), 0);
  const editedTotal = claim.items.reduce((a: number, i: any) => {
    const e = edits[i.id];
    return a + (e ? e.quantity * e.unitPrice : i.amountRequested);
  }, 0);

  async function action(path: string, body?: any) {
    setBusy(true); setError(null); setMessage(null);
    try {
      const res = await api.post<any>(`/provider/thirdparty/${id}/${path}`, body ?? {});
      setMessage(res.message ?? res.status ?? 'OK');
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  function printInvoice() {
    const establishment = claim.provider?.name ?? 'Établissement partenaire';
    const rows = claim.items.map((i: any) => `
      <tr>
        <td>${escapeHtml(i.code ?? '—')}</td>
        <td>${escapeHtml(i.label ?? CATEGORY_LABELS[i.categoryLabel] ?? i.categoryLabel)}${i.practitioner ? `<br><span style="font-size:10px;color:#64748b">Praticien : ${escapeHtml(i.practitioner)}</span>` : ''}</td>
        <td class="num">${i.quantity ?? 1}</td>
        <td class="num">${fcfa(i.unitPrice ?? 0)}</td>
        <td class="num">${fcfa(i.amountRequested)}</td>
      </tr>`).join('');
    printDocument(
      `Facture ${claim.invoiceNumber ?? claim.reference}`,
      `
      <div class="band">
        <div>
          <div class="brand">SantéPlus Bénin</div>
          <div class="tag">Votre santé. Votre couverture. Simplement.</div>
        </div>
        <div style="text-align:right;font-size:11px">
          <div><b>${escapeHtml(establishment)}</b></div>
          <div>Facture de soins</div>
        </div>
      </div>
      <h1>Facture ${escapeHtml(claim.invoiceNumber ?? '(à générer)')}</h1>
      <div class="meta">Référence prise en charge : ${escapeHtml(claim.reference)} — émise le ${new Date().toLocaleString('fr-FR')}</div>
      <div class="info"><b>Patient</b> ${escapeHtml(claim.beneficiary ? `${claim.beneficiary.firstName} ${claim.beneficiary.lastName} (${claim.beneficiary.memberNumber})` : `${claim.claimantUser.firstName} ${claim.claimantUser.lastName} (${claim.claimantUser.memberNumber})`)}</div>
      <div class="info"><b>Contrat</b> ${escapeHtml(claim.contract.number)} — ${escapeHtml(claim.contract.product.name)}</div>
      <table>
        <thead><tr><th>Code</th><th>Prestation</th><th class="num">Qté</th><th class="num">P.U.</th><th class="num">Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">
        <div class="row"><span>Total des soins</span><span>${fcfa(claim.totalRequested)}</span></div>
        <div class="row big"><span>Pris en charge assurance</span><span>${fcfa(covered)}</span></div>
        <div class="row amber"><span>Reste à charge patient</span><span>${fcfa(claim.totalRequested - covered)}</span></div>
      </div>
      <div class="legal">
        Facture relative à la prise en charge ${escapeHtml(claim.reference)}.
        SantéPlus agit en qualité d’intermédiaire technologique — les garanties sont portées par l’assureur partenaire du contrat.
      </div>
      `,
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/prestataire/prises" className="btn-outline btn-sm">← Retour</Link>
        <h1 className="text-xl font-bold mr-auto">{claim.reference}</h1>
        <span className={`badge ${statusStyle(claim.status)}`}>{statusLabel(claim.status)}</span>
      </div>
      <ErrorBanner message={error} />
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{message}</div>}

      <div className="card-p grid gap-3 sm:grid-cols-2 text-sm">
        <div>
          <p className="label">Patient</p>
          {claim.beneficiary
            ? `${claim.beneficiary.firstName} ${claim.beneficiary.lastName} (${claim.beneficiary.memberNumber})`
            : `${claim.claimantUser.firstName} ${claim.claimantUser.lastName} (${claim.claimantUser.memberNumber})`}
        </div>
        <div><p className="label">Contrat</p>{claim.contract.number} · {claim.contract.product.name}</div>
        <div><p className="label">Date des soins</p>{fmtDate(claim.careDate)}</div>
        <div><p className="label">Créée le</p>{fmtDateTime(claim.createdAt)}</div>
        {claim.decisionNote && <div className="sm:col-span-2"><p className="label">Note du gestionnaire</p>{claim.decisionNote}</div>}
        {claim.realizationNote && <div className="sm:col-span-2"><p className="label">Observation de réalisation</p>{claim.realizationNote}</div>}
      </div>

      {claim.status === 'AUTH_REQUIRED' && (
        <div className="card-p border-orange-300 bg-orange-50">
          <p className="font-semibold text-orange-800">⏳ Autorisation préalable en attente du gestionnaire assurance</p>
          <p className="text-sm text-orange-700 mt-1">Vous pourrez confirmer les soins une fois l'autorisation accordée.</p>
        </div>
      )}

      <div className="card-p">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Actes</h2>
          {canRealize && (
            <button className="btn-outline btn-sm" onClick={() => setShowRealize(s => !s)}>✏️ Ajuster les actes réels</button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr><th className="th">Code</th><th className="th">Désignation</th><th className="th">Qté</th><th className="th">P.U.</th><th className="th">Montant</th><th className="th">Couvert</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {claim.items.map((it: any) => {
              const e = edits[it.id];
              return (
                <tr key={it.id}>
                  <td className="td font-mono text-xs">{it.code ?? '—'}</td>
                  <td className="td">
                    {it.label ?? CATEGORY_LABELS[it.categoryLabel] ?? it.categoryLabel}
                    {it.practitioner && <p className="text-[11px] text-slate-400">Praticien : {it.practitioner}</p>}
                  </td>
                  <td className="td">
                    {showRealize && e ? (
                      <input type="number" min={1} className="input py-1 w-16" value={e.quantity}
                        onChange={ev => setEdits(o => ({ ...o, [it.id]: { ...e, quantity: Math.max(1, Number(ev.target.value) || 1) } }))} />
                    ) : (it.quantity ?? 1)}
                  </td>
                  <td className="td">
                    {showRealize && e ? (
                      <input type="number" min={0} className="input py-1 w-24 text-right" value={e.unitPrice}
                        onChange={ev => setEdits(o => ({ ...o, [it.id]: { ...e, unitPrice: Math.max(0, Number(ev.target.value) || 0) } }))} />
                    ) : fcfa(it.unitPrice ?? 0)}
                  </td>
                  <td className="td font-medium">{fcfa(showRealize && e ? e.quantity * e.unitPrice : it.amountRequested)}</td>
                  <td className="td text-right">{fcfa(it.amountApproved ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Total {showRealize ? 'réel' : 'des actes'}</span><span className="font-medium">{fcfa(showRealize ? editedTotal : claim.totalRequested)}</span></div>
          <div className="flex justify-between font-bold text-emerald-700"><span>Pris en charge</span><span>{fcfa(covered)}</span></div>
          <div className="flex justify-between font-bold"><span>Reste à charge patient</span><span>{fcfa((showRealize ? editedTotal : claim.totalRequested) - covered)}</span></div>
        </div>

        {showRealize && (
          <div className="mt-3 space-y-2">
            <input className="input" placeholder="Observation (optionnel)" value={realizeNote} onChange={e => setRealizeNote(e.target.value)} />
            <p className="text-xs text-slate-400">Si les actes réels dépassent l'autorisation de plus de 10 %, une nouvelle validation du gestionnaire sera demandée.</p>
            <button className="btn-primary btn-sm" disabled={busy}
              onClick={() => action('realize', {
                note: realizeNote || undefined,
                items: claim.items.map((i: any) => ({ id: i.id, quantity: edits[i.id]?.quantity, unitPrice: edits[i.id]?.unitPrice })),
              })}>
              ✓ Enregistrer les actes réellement réalisés
            </button>
          </div>
        )}
      </div>

      {claim.documents.length > 0 && (
        <div className="card-p">
          <p className="label">Pièces jointes</p>
          <ul className="flex flex-wrap gap-2">
            {claim.documents.map((d: any) => (
              <li key={d.id}>
                <a href={fileUrl(d.fileId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs hover:border-brand-300">📄 {d.fileName}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-p flex flex-wrap gap-2">
        {canConfirm && (
          <button className="btn-primary" disabled={busy} onClick={() => action('confirm')}>✅ Confirmer — soins réalisés</button>
        )}
        {canRealize && !claim.invoiceNumber && (
          <button className="btn-outline" disabled={busy} onClick={() => action('invoice')}>🧾 Générer la facture</button>
        )}
        {(canRealize || claim.invoiceNumber) && (
          <button className="btn-outline" onClick={printInvoice}>🖨️ Imprimer la facture</button>
        )}
        {claim.status === 'PAID' && (
          <span className="badge bg-emerald-100 text-emerald-700 self-center">Payée{claim.paidRef ? ` — réf. ${claim.paidRef}` : ''} le {fmtDate(claim.paidAt)}</span>
        )}
        {claim.status === 'REJECTED' && (
          <span className="badge bg-red-100 text-red-700 self-center">Refusée — {claim.decisionNote}</span>
        )}
      </div>
    </div>
  );
}

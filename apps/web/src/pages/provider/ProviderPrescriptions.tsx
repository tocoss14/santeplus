import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../api';
import { fcfa, fmtDate, statusLabel, statusStyle } from '../../format';
import { ErrorBanner, Field, Modal, Spinner, StatusBadge } from '../../components/ui';
import { printDocument, escapeHtml } from '../../print';

export default function ProviderPrescriptions() {
  const [items, setItems] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<any | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [scanQuery, setScanQuery] = useState('');
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    memberNumber: '', lines: [{ code: 'MED-AMOX', name: 'Amoxicilline 500mg', categoryId: 'PHARMACY', quantity: 1, unitPrice: 3500, posology: '', duration: '' }] as any[],
    validDays: 30, renewalsAllowed: 0, note: '',
  });

  const load = () => {
    const params = q ? `?q=${encodeURIComponent(q)}` : '';
    api.get(`/provider/prescriptions${params}`).then(setItems).catch(() => setItems([]));
  };
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [q]);

  async function create() {
    setError(null);
    try {
      await api.post('/provider/prescriptions', {
        memberNumber: form.memberNumber,
        lines: form.lines,
        validDays: form.validDays,
        renewalsAllowed: form.renewalsAllowed,
        note: form.note || undefined,
      });
      setNewOpen(false);
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur');
    }
  }

  async function scanOrdonnance() {
    setError(null);
    try {
      const res = await api.post('/provider/prescriptions/scan', scanQuery.startsWith('{') ? { qrToken: JSON.parse(scanQuery).prescription ?? scanQuery } : scanQuery.startsWith('ORD-') ? { number: scanQuery } : { qrToken: scanQuery });
      setScanResult(res);
      setDetail(res);
    } catch (e: any) {
      setError(e?.message ?? 'Ordonnance introuvable');
    }
  }

  const printOrdonnance = (p: any) => {
    const rows = p.lines.map((l: any) => `<tr><td>${escapeHtml(l.name)}</td><td>${l.quantity}</td><td>${fcfa(l.unitPrice)}</td><td>${escapeHtml(l.posology ?? '')}</td><td>${l.deliveredQty}/${l.quantity}</td></tr>`).join('');
    printDocument(
      `Ordonnance ${p.number}`,
      `<div style="background:#0f766e;color:#fff;padding:14px 18px;border-radius:8px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:18px;font-weight:700">SantéPlus Bénin</div><div style="font-size:10px;color:#ccfbf1">Votre santé. Votre couverture. Simplement.</div></div><div style="text-align:right;font-size:11px"><div><b>Ordonnance ${escapeHtml(p.number)}</b></div><div>QR : ${escapeHtml(p.qrToken.slice(0, 16))}…</div></div></div>
       <h1 style="color:#0f766e;margin:16px 0 4px;font-size:16px">Ordonnance — ${escapeHtml(p.number)}</h1>
       <div style="font-size:11px;color:#64748b">Délivrée le ${fmtDate(p.validFrom)} par ${escapeHtml(p.prescriberName)} — valide jusqu'au ${fmtDate(p.validUntil)} · ${p.renewalsUsed}/${p.renewalsAllowed} renouvellements</div>
       <table style="width:100%;border-collapse:collapse;margin:12px 0"><thead><tr><th>Produit</th><th>Qté</th><th>Prix</th><th>Posologie</th><th>Délivré</th></tr></thead><tbody>${rows}</tbody></table>
       <div style="margin-top:18px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:9.5px;color:#94a3b8">QR = jeton sécurisé, aucune donnée médicale exposée. Renouvellements restants : ${p.renewalsAllowed - p.renewalsUsed}.</div>
      `,
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Ordonnances</h1>
        <input className="input w-56" placeholder="Scanner une ordonnance (QR/n°)" value={scanQuery} onChange={e => setScanQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && scanOrdonnance()} />
        <button className="btn-outline btn-sm" onClick={scanOrdonnance}>Scanner</button>
        <input className="input w-48" placeholder="Rechercher…" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn-primary btn-sm" onClick={() => setNewOpen(true)}>＋ Nouvelle ordonnance</button>
      </div>
      <ErrorBanner message={error} />
      {scanResult && (
        <div className="card-p border-brand-200 bg-brand-50">
          <p className="font-semibold">Ordonnance trouvée — {scanResult.number}</p>
          <p className="text-sm text-slate-600">{scanResult.lines.length} ligne(s) · reste à délivrer : {scanResult.remainingLines.filter((r: any) => r.remaining > 0).length}</p>
          <button className="btn-primary btn-sm mt-2" onClick={() => setDetail(scanResult)}>Ouvrir</button>
        </div>
      )}

      {!items ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead><tr><th className="th">Numéro</th><th className="th">Patient</th><th className="th">Lignes</th><th className="th">Validité</th><th className="th">Renouv.</th><th className="th">Statut</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(p => (
                <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={async () => {
                  const d = await api.get(`/provider/prescriptions/${p.id}`); setDetail(d);
                }}>
                  <td className="td font-medium">{p.number}</td>
                  <td className="td text-sm">{p.patientUser.firstName} {p.patientUser.lastName}</td>
                  <td className="td text-xs">{p.lines.length} produit(s)</td>
                  <td className="td text-xs">{fmtDate(p.validFrom)} → {fmtDate(p.validUntil)}</td>
                  <td className="td text-xs">{p.renewalsUsed}/{p.renewalsAllowed}</td>
                  <td className="td"><StatusBadge status={p.status} /></td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} className="td py-8 text-center text-slate-400">Aucune ordonnance</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Ordonnance ${detail.number}` : ''} wide>
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Patient">{detail.patientUser.firstName} {detail.patientUser.lastName}</Field>
              <Field label="Prescripteur">{detail.prescriberName}</Field>
              <Field label="Validité">{fmtDate(detail.validFrom)} → {fmtDate(detail.validUntil)}</Field>
              <Field label="Renouvellements">{detail.renewalsUsed}/{detail.renewalsAllowed}</Field>
            </div>
            {detail.isExpired && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">Ordonnance expirée</div>}
            <div className="grid place-items-center rounded-xl bg-white p-3 border border-slate-200">
              <QRCodeSVG value={JSON.stringify({ prescription: detail.qrToken })} size={130} />
              <p className="mt-1 text-[10px] font-semibold text-slate-400">QR ordonnance — à présenter en pharmacie</p>
            </div>
            <table className="w-full">
              <thead><tr><th className="th">Produit</th><th className="th">Qté</th><th className="th">Prix</th><th className="th">Posologie</th><th className="th">Délivré</th><th className="th">Restant</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {detail.lines.map((l: any) => <tr key={l.id}><td className="td">{l.name}</td><td className="td text-center">{l.quantity}</td><td className="td text-right">{fcfa(l.unitPrice)}</td><td className="td text-xs">{l.posology ?? '—'}</td><td className="td text-center">{l.deliveredQty}/{l.quantity}</td><td className="td text-center font-semibold">{l.quantity - l.deliveredQty}</td></tr>)}
              </tbody>
            </table>
            <div className="flex gap-2">
              <button className="btn-outline flex-1" onClick={() => printOrdonnance(detail)}>🖨️ Imprimer</button>
              {detail.status === 'ACTIVE' && detail.renewalsUsed < detail.renewalsAllowed && (
                <button className="btn-outline flex-1" onClick={async () => {
                  await api.post(`/provider/prescriptions/${detail.id}/renew`); setDetail(null); load();
                }}>🔄 Renouveler</button>
              )}
              {detail.status === 'ACTIVE' && (
                <button className="btn-danger flex-1" onClick={async () => {
                  await api.post(`/provider/prescriptions/${detail.id}/cancel`); setDetail(null); load();
                }}>Annuler</button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Nouvelle ordonnance">
        <ErrorBanner message={error} />
        <Field label="N° assuré / contrat / QR du patient"><input className="input font-mono" placeholder="MEM-A00001" value={form.memberNumber} onChange={e => setForm(f => ({ ...f, memberNumber: e.target.value }))} /></Field>
        {form.lines.map((l, i) => (
          <div key={i} className="rounded-lg border border-slate-200 p-3 space-y-2">
            <div className="flex justify-between items-center"><span className="badge bg-slate-100">Ligne {i + 1}</span><button onClick={() => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))} className="text-xs text-red-600">Retirer</button></div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Code produit"><input className="input" value={l.code} onChange={e => setForm(f => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, code: e.target.value } : x) }))} /></Field>
              <Field label="Nom"><input className="input" value={l.name} onChange={e => setForm(f => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, name: e.target.value } : x) }))} /></Field>
              <Field label="Quantité"><input type="number" min={1} className="input" value={l.quantity} onChange={e => setForm(f => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x) }))} /></Field>
              <Field label="Prix unitaire"><input type="number" min={1} className="input" value={l.unitPrice} onChange={e => setForm(f => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, unitPrice: Number(e.target.value) || 0 } : x) }))} /></Field>
              <Field label="Posologie"><input className="input" value={l.posology} onChange={e => setForm(f => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, posology: e.target.value } : x) }))} /></Field>
              <Field label="Catégorie"><select className="input" value={l.categoryId} onChange={e => setForm(f => ({ ...f, lines: f.lines.map((x, j) => j === i ? { ...x, categoryId: e.target.value } : x) }))}>
                <option value="PHARMACY">Pharmacie</option><option value="LABORATORY">Analyses</option><option value="SPECIALIZED">Spécialisé</option><option value="CONSULTATION">Consultation</option>
              </select></Field>
            </div>
          </div>
        ))}
        <button className="btn-outline btn-sm" onClick={() => setForm(f => ({ ...f, lines: [...f.lines, { code: '', name: '', categoryId: 'PHARMACY', quantity: 1, unitPrice: 0, posology: '', duration: '' }] }))}>＋ Ligne</button>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Field label="Validité (jours)"><input type="number" min={1} max={365} className="input" value={form.validDays} onChange={e => setForm(f => ({ ...f, validDays: Number(e.target.value) || 30 }))} /></Field>
          <Field label="Renouvellements"><input type="number" min={0} max={10} className="input" value={form.renewalsAllowed} onChange={e => setForm(f => ({ ...f, renewalsAllowed: Number(e.target.value) || 0 }))} /></Field>
        </div>
        <button className="btn-primary w-full mt-3" disabled={!form.memberNumber || form.lines.length === 0} onClick={create}>Créer l'ordonnance</button>
      </Modal>
    </div>
  );
}

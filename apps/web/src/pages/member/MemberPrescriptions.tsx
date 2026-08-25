import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../api';
import { fcfa, fmtDate, fmtDateTime, statusLabel, statusStyle, CATEGORY_LABELS } from '../../format';
import { ErrorBanner, Field, Modal, Spinner, StatusBadge } from '../../components/ui';
import { printDocument, escapeHtml } from '../../print';

export default function MemberPrescriptions() {
  const [items, setItems] = useState<any[] | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const load = () => { api.get('/prescriptions/mine').then(setItems).catch(() => setItems([])); };
  useEffect(() => { load(); }, []);

  if (!items) return <Spinner />;

  const printOrdonnance = (p: any) => {
    const rows = p.lines.map((l: any) => `<tr><td>${escapeHtml(l.name)}</td><td>${l.quantity}</td><td>${fcfa(l.unitPrice)}</td><td>${escapeHtml(l.posology ?? '')}</td><td>${l.deliveredQty}/${l.quantity}</td></tr>`).join('');
    const qrValue = JSON.stringify({ prescription: p.qrToken });
    printDocument(
      `Ordonnance ${p.number}`,
      `<div style="background:#0f766e;color:#fff;padding:14px 18px;border-radius:8px;display:flex;justify-content:space-between;align-items:center"><div><div style="font-size:18px;font-weight:700">SantéPlus Bénin</div><div style="font-size:10px;color:#ccfbf1">Votre santé. Votre couverture. Simplement.</div></div><div style="text-align:right;font-size:11px"><div><b>Ordonnance ${escapeHtml(p.number)}</b></div><div>QR : ${escapeHtml(p.qrToken.slice(0, 16))}…</div></div></div>
       <h1 style="color:#0f766e;margin:16px 0 4px;font-size:16px">Ordonnance — ${escapeHtml(p.number)}</h1>
       <div style="font-size:11px;color:#64748b">Délivrée le ${fmtDate(p.validFrom)} par ${escapeHtml(p.prescriberName)} — valide jusqu'au ${fmtDate(p.validUntil)}</div>
       <table style="width:100%;border-collapse:collapse;margin:12px 0"><thead><tr><th>Produit / acte</th><th>Qté</th><th>Prix</th><th>Posologie</th><th>Délivré</th></tr></thead><tbody>${rows}</tbody></table>
       <div style="margin-top:18px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:9.5px;color:#94a3b8">SantéPlus — intermédiaire technologique. QR = jeton sécurisé, aucune donnée médicale exposée.</div>
      `,
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Mes ordonnances</h1>
      {items.length === 0 ? (
        <div className="card-p text-center text-sm text-slate-500">Aucune ordonnance.</div>
      ) : (
        <ul className="space-y-3">
          {items.map(p => (
            <li key={p.id} className="card-p cursor-pointer hover:border-brand-300" onClick={() => setDetail(p)}>
              <div className="flex flex-wrap items-center gap-2" onClick={() => setDetail(p)}>
                <span className="font-semibold">{p.number}</span>
                <StatusBadge status={p.status} />
                <span className="ml-auto text-xs text-slate-400">{fmtDate(p.validFrom)} → {fmtDate(p.validUntil)}</span>
              </div>
              <p className="text-xs text-slate-500">{p.prescriberName} · {p.provider?.name ?? ''}</p>
              <p className="text-sm mt-1">{p.lines.length} produit(s) — {p.lines.map((l: any) => l.name).join(', ').slice(0, 60)}</p>
              <div className="mt-2 flex gap-2">
                <button className="btn-outline btn-sm" onClick={e => { e.stopPropagation(); setDetail(p); }}>Détail & QR</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Ordonnance ${detail.number}` : ''} wide>
        {detail && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Patient">{detail.patientUser.firstName} {detail.patientUser.lastName}</Field>
              <Field label="Prescripteur">{detail.prescriberName}{detail.specialty ? ` — ${detail.specialty}` : ''}</Field>
              <Field label="Validité">{fmtDate(detail.validFrom)} → {fmtDate(detail.validUntil)}</Field>
              <Field label="Renouvellements">{detail.renewalsUsed}/{detail.renewalsAllowed}</Field>
            </div>
            <div className="grid place-items-center rounded-xl bg-white p-3 border border-slate-200">
              <QRCodeSVG value={JSON.stringify({ prescription: detail.qrToken })} size={130} />
              <p className="mt-1 text-[10px] font-semibold text-slate-400">À présenter en pharmacie / laboratoire</p>
            </div>
            <table className="w-full">
              <thead><tr><th className="th">Produit</th><th className="th">Qté</th><th className="th">Prix</th><th className="th">Délivré</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {detail.lines.map((l: any) => <tr key={l.id}><td className="td">{l.name}</td><td className="td text-center">{l.quantity}</td><td className="td text-right">{fcfa(l.unitPrice)}</td><td className="td text-center">{l.deliveredQty}/{l.quantity}</td></tr>)}
              </tbody>
            </table>
            <button className="btn-outline w-full" onClick={() => printOrdonnance(detail)}>🖨️ Imprimer l'ordonnance</button>
          </div>
        )}
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate, fmtDateTime, statusLabel } from '../../format';
import { ErrorBanner, Field, Spinner, StatusBadge } from '../../components/ui';

export default function ProviderDeliveries() {
  const [prescriptionInput, setPrescriptionInput] = useState('');
  const [prescription, setPrescription] = useState<any | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = () => api.get('/provider/deliveries').then(setDeliveries).catch(() => setDeliveries([]));
  useEffect(() => { load(); }, []);

  async function scan() {
    setError(null); setMessage(null);
    try {
      const value = prescriptionInput.trim();
      const payload = value.startsWith('{') ? { qrToken: JSON.parse(value).prescription ?? value }
        : value.startsWith('ORD-') ? { number: value } : { qrToken: value };
      const res = await api.post('/provider/prescriptions/scan', payload);
      setPrescription(res);
      setLines(res.remainingLines.filter((r: any) => r.remaining > 0).map((r: any) => ({ lineId: r.lineId, quantity: r.remaining, unitPrice: r.unitPrice, substitutionNote: '' })));
      if (res.remainingLines.every((r: any) => r.remaining <= 0)) {
        setError('Ordonnance entièrement exécutée — plus rien à délivrer.');
      }
    } catch (e: any) {
      setError(e?.message ?? 'Ordonnance introuvable');
      setPrescription(null);
    }
  }

  async function deliver() {
    setBusy(true); setError(null);
    try {
      const dto = {
        prescriptionNumber: prescription.number,
        lines: lines.map(l => ({ lineId: l.lineId, quantity: l.quantity, substitutionNote: l.substitutionNote || undefined })),
      };
      const payload = JSON.stringify(dto);
      const fd = new FormData();
      fd.append('payload', payload);
      const res = await api.post<any>('/provider/deliveries', fd);
      setMessage(`Délivrance ${res.reference ?? 'enregistrée'} — prise en charge ${fcfa(res.estimation?.totals?.approved ?? 0)}`);
      setPrescription(null);
      setLines([]);
      setPrescriptionInput('');
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Délivrance impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Délivrer une ordonnance</h1>
      <div className="card-p space-y-3">
        <Field label="Scanner l'ordonnance (QR ou n° ORD-…)">
          <div className="flex gap-2">
            <input className="input flex-1 font-mono" placeholder='ORD-2026-XXXXXX ou QR JSON' value={prescriptionInput} onChange={e => setPrescriptionInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && scan()} />
            <button className="btn-primary btn-sm" disabled={!prescriptionInput.trim()} onClick={scan}>Charger</button>
          </div>
        </Field>
        <ErrorBanner message={error} />
        {message && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700">{message}</div>}

        {prescription && (
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{prescription.number}</span>
              <StatusBadge status={prescription.computedStatus ?? prescription.status} />
              <span className="text-xs text-slate-400">{prescription.patientUser.firstName} {prescription.patientUser.lastName} · {fmtDate(prescription.validFrom)} → {fmtDate(prescription.validUntil)}</span>
            </div>
            {prescription.isExpired && <p className="text-sm text-red-600">Ordonnance expirée — délivrance bloquée.</p>}
            {prescription.remainingLines.filter((r: any) => r.remaining > 0).length === 0 ? (
              <p className="text-sm text-slate-500">Toutes les lignes ont été délivrées.</p>
            ) : (
              <>
                {prescription.remainingLines.filter((r: any) => r.remaining > 0).map((r: any) => {
                  const idx = lines.findIndex(l => l.lineId === r.lineId);
                  return (
                    <div key={r.lineId} className="rounded-lg border border-slate-200 p-3">
                      <p className="font-medium text-sm">{r.name}</p>
                      <p className="text-xs text-slate-500">Prescrit : {r.quantity} — déjà délivré : {r.deliveredQty} — reste : <b>{r.remaining}</b> · prix {fcfa(r.unitPrice)}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <Field label="Quantité à délivrer">
                          <input type="number" min={1} max={r.remaining} className="input py-1.5"
                            value={idx >= 0 ? lines[idx].quantity : r.remaining}
                            onChange={e => {
                              const v = Math.max(1, Math.min(r.remaining, Number(e.target.value) || 1));
                              if (idx >= 0) {
                                setLines(ls => ls.map((l, j) => j === idx ? { ...l, quantity: v } : l));
                              } else {
                                setLines(ls => [...ls, { lineId: r.lineId, quantity: v, unitPrice: r.unitPrice, substitutionNote: '' }]);
                              }
                            }} />
                        </Field>
                        <Field label="Produit délivré = prescrit ?">
                          <input className="input py-1.5" placeholder="note de substitution si différent"
                            value={idx >= 0 ? lines[idx].substitutionNote : ''}
                            onChange={e => {
                              if (idx >= 0) setLines(ls => ls.map((l, j) => j === idx ? { ...l, substitutionNote: e.target.value } : l));
                            }} />
                        </Field>
                      </div>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={idx >= 0}
                          onChange={e => {
                            if (e.target.checked) setLines(ls => [...ls, { lineId: r.lineId, quantity: r.remaining, unitPrice: r.unitPrice, substitutionNote: '' }]);
                            else setLines(ls => ls.filter(l => l.lineId !== r.lineId));
                          }} />
                        Délivrer cette ligne
                      </label>
                    </div>
                  );
                })}
                <button className="btn-primary w-full mt-2" disabled={busy || lines.length === 0} onClick={deliver}>
                  {busy ? 'Enregistrement…' : 'Confirmer la délivrance'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <h2 className="font-semibold">Historique des délivrances</h2>
      {!deliveries ? <Spinner /> : deliveries.length === 0 ? (
        <div className="card-p text-center text-sm text-slate-500">Aucune délivrance.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead><tr><th className="th">Référence</th><th className="th">Ordonnance</th><th className="th">Patient</th><th className="th">Montant</th><th className="th">Couvert</th><th className="th">Date</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {deliveries.map((d: any) => (
                <tr key={d.id}>
                  <td className="td font-medium">{d.reference}</td>
                  <td className="td text-xs">{d.prescription?.number ?? '—'}</td>
                  <td className="td text-sm">{d.patientUser.firstName} {d.patientUser.lastName}</td>
                  <td className="td">{fcfa(d.totalAmount)}</td>
                  <td className="td font-medium">{fcfa(d.coveredAmount)}</td>
                  <td className="td text-xs">{fmtDateTime(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

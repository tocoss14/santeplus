import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ErrorBanner, Field, Spinner } from '../../components/ui';
import { fmtDate } from '../../format';

export default function HospitalEntente() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [form, setForm] = useState({ contractId: '', diagnostic: '', diseaseCode: '', estimatedAmount: 150000, hospitalizationType: 'MEDECINE', expectedDays: 3 });
  const [list, setList] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    api.get('/hospital/ententes').then(setList).catch(() => {});
  }, []);

  const submit = async () => {
    setError(null); setOk(null);
    try {
      // Need providerId — fetch from profile or use first provider
      const providers = await api.get<any[]>('/providers');
      const providerId = providers[0]?.id;
      if (!providerId) throw new Error('Aucun prestataire');
      await api.post('/hospital/entente', { ...form, providerId, estimatedAmount: Number(form.estimatedAmount), expectedDays: Number(form.expectedDays) });
      setOk('Demande d’entente créée — en attente d’autorisation');
      const updated = await api.get('/hospital/ententes');
      setList(updated);
    } catch (e: any) { setError(e?.message ?? 'Erreur'); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Entente préalable — Hospitalisation</h1>
      <ErrorBanner message={error} />
      {ok && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{ok}</div>}
      <div className="card-p space-y-3">
        <Field label="Contrat (ID) *"><input className="input" value={form.contractId} onChange={e => setForm(f => ({ ...f, contractId: e.target.value }))} placeholder="CTR-... ou ID contrat" /></Field>
        <Field label="Diagnostic *"><textarea className="input min-h-[80px]" value={form.diagnostic} onChange={e => setForm(f => ({ ...f, diagnostic: e.target.value }))} placeholder="Ex: Appendicite aiguë, asthénie..." /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Code CIM10"><input className="input" value={form.diseaseCode} onChange={e => setForm(f => ({ ...f, diseaseCode: e.target.value.toUpperCase() }))} placeholder="K35" /></Field>
          <Field label="Montant estimé (FCFA)"><input type="number" className="input" value={form.estimatedAmount} onChange={e => setForm(f => ({ ...f, estimatedAmount: Number(e.target.value) }))} /></Field>
          <Field label="Type"><select className="input" value={form.hospitalizationType} onChange={e => setForm(f => ({ ...f, hospitalizationType: e.target.value }))}><option value="MEDECINE">Médecine</option><option value="CHIRURGIE">Chirurgie</option><option value="MATERNITE">Maternité</option><option value="SOINS_INTENSIFS">Soins intensifs</option></select></Field>
        </div>
        <Field label="Jours prévus"><input type="number" className="input w-32" value={form.expectedDays} onChange={e => setForm(f => ({ ...f, expectedDays: Number(e.target.value) }))} /></Field>
        <button className="btn-primary" onClick={submit}>Demander entente</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead><tr><th className="th">Réf</th><th className="th">Contrat</th><th className="th">Montant</th><th className="th">Statut</th><th className="th">Date</th></tr></thead>
          <tbody className="divide-y">
            {list?.items?.map((c: any) => (
              <tr key={c.id}><td className="td font-mono text-xs">{c.reference}</td><td className="td text-xs">{c.contract?.number ?? c.contractId.slice(0,8)}</td><td className="td">{c.totalRequested} FCFA</td><td className="td"><span className="badge bg-slate-100">{c.status}</span></td><td className="td text-xs">{fmtDate(c.createdAt)}</td></tr>
            ))}
            {(!list || list.items.length===0) && <tr><td colSpan={5} className="td text-center py-6 text-slate-400">Aucune demande</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

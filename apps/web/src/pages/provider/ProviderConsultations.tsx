import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fmtDate, fmtDateTime } from '../../format';
import { Field, Modal, Spinner, ErrorBanner } from '../../components/ui';

export default function ProviderConsultations() {
  const [items, setItems] = useState<any[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ memberNumber: '', motif: '', diagnostic: '', practitioner: 'Dr X', specialty: '' });

  const load = () => api.get('/provider/consultations').then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  async function create() {
    setError(null);
    try {
      await api.post('/provider/consultations', {
        memberNumber: form.memberNumber,
        motif: form.motif,
        diagnostic: form.diagnostic || undefined,
        practitioner: form.practitioner,
        specialty: form.specialty || undefined,
      });
      setAddOpen(false);
      setForm({ memberNumber: '', motif: '', diagnostic: '', practitioner: 'Dr X', specialty: '' });
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Consultations</h1>
        <button className="btn-primary btn-sm" onClick={() => setAddOpen(true)}>＋ Enregistrer une consultation</button>
      </div>
      <ErrorBanner message={error} />
      {!items ? <Spinner /> : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead><tr><th className="th">Référence</th><th className="th">Patient</th><th className="th">Praticien</th><th className="th">Motif</th><th className="th">Diagnostic</th><th className="th">Date</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(c => (
                <tr key={c.id}>
                  <td className="td font-medium">{c.reference}</td>
                  <td className="td text-sm">{c.patientUser?.firstName} {c.patientUser?.lastName}</td>
                  <td className="td text-xs">{c.practitionerName}{c.specialty ? ` — ${c.specialty}` : ''}</td>
                  <td className="td text-sm">{c.motif}</td>
                  <td className="td text-xs text-slate-500">{c.diagnostic ?? '—'}</td>
                  <td className="td text-xs">{fmtDateTime(c.careDate)}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} className="td py-8 text-center text-slate-400">Aucune consultation</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Enregistrer une consultation">
        <ErrorBanner message={error} />
        <Field label="N° assuré / contrat / QR du patient"><input className="input font-mono" placeholder="MEM-A00001" value={form.memberNumber} onChange={e => setForm(f => ({ ...f, memberNumber: e.target.value }))} /></Field>
        <Field label="Motif"><input className="input" value={form.motif} onChange={e => setForm(f => ({ ...f, motif: e.target.value }))} /></Field>
        <Field label="Diagnostic"><input className="input" value={form.diagnostic} onChange={e => setForm(f => ({ ...f, diagnostic: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Praticien"><input className="input" value={form.practitioner} onChange={e => setForm(f => ({ ...f, practitioner: e.target.value }))} /></Field>
          <Field label="Spécialité"><input className="input" value={form.specialty} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} /></Field>
        </div>
        <button className="btn-primary w-full" disabled={!form.memberNumber || !form.motif} onClick={create}>Enregistrer</button>
      </Modal>
    </div>
  );
}

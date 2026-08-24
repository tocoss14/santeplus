import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { fcfa, CATEGORY_LABELS, PROVIDER_TYPES } from '../../format';
import { ErrorBanner, Field } from '../../components/ui';

export default function NewClaim() {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<any[]>([]);
  const [form, setForm] = useState({ contractId: '', beneficiaryId: '', providerId: '', careDate: new Date().toISOString().slice(0, 10) });
  const [items, setItems] = useState([{ categoryId: '', amountRequested: '' }]);
  const [files, setFiles] = useState<File[]>([]);
  const [docType, setDocType] = useState('INVOICE');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<any[]>('/contracts/mine').then(list => {
      const active = list.find(c => c.status === 'ACTIVE');
      if (!active) throw new Error('Vous devez avoir un contrat actif pour déclarer une dépense');
      setForm(f => ({ ...f, contractId: active.id }));
      return api.get(`/contracts/${active.id}/beneficiaries`).then(setBeneficiaries);
    }).catch(e => setError(e?.message));
    api.get<any[]>('/claims/categories').then(setCategories).catch(() => {});
    api.get<any[]>('/providers').then(p => setProviders(p.slice(0, 50))).catch(() => {});
  }, []);

  async function submit(submitAfter: boolean) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({
        contractId: form.contractId,
        beneficiaryId: form.beneficiaryId || undefined,
        providerId: form.providerId || undefined,
        careDate: form.careDate,
        items: items.filter(i => i.categoryId && Number(i.amountRequested) > 0)
          .map(i => ({ categoryId: i.categoryId, amountRequested: Number(i.amountRequested) })),
      }));
      for (const f of files) fd.append('documents', f);
      const res = await api.post<any>('/claims', fd);
      if (submitAfter) {
        await api.post(`/claims/${res.id}/submit`);
        navigate(`/app/remboursements/${res.id}`, { state: { justSubmitted: true } });
      } else {
        navigate(`/app/remboursements/${res.id}`);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Envoi impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Déclarer une dépense médicale</h1>
      <ErrorBanner message={error} />

      <div className="card-p space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date des soins"><input type="date" className="input" value={form.careDate} max={new Date().toISOString().slice(0, 10)} onChange={e => setForm(f => ({ ...f, careDate: e.target.value }))} /></Field>
          <Field label="Bénéficiaire">
            <select className="input" value={form.beneficiaryId} onChange={e => setForm(f => ({ ...f, beneficiaryId: e.target.value }))}>
              <option value="">Moi-même</option>
              {beneficiaries.filter(b => b.status === 'COVERED').map(b => (
                <option key={b.id} value={b.id}>{b.firstName} {b.lastName}</option>
              ))}
            </select>
          </Field>
          <Field label="Établissement (optionnel)">
            <select className="input" value={form.providerId} onChange={e => setForm(f => ({ ...f, providerId: e.target.value }))}>
              <option value="">—</option>
              {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>

        <div>
          <label className="label">Prestations</label>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className="input flex-1"
                  value={it.categoryId}
                  onChange={e => setItems(arr => arr.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))}
                >
                  <option value="">Type de prestation…</option>
                  {categories.map(c => <option key={c.category} value={c.category}>{CATEGORY_LABELS[c.category] ?? c.name}</option>)}
                </select>
                <input
                  className="input w-36"
                  type="number"
                  min={1}
                  placeholder="Montant"
                  value={it.amountRequested}
                  onChange={e => setItems(arr => arr.map((x, j) => (j === i ? { ...x, amountRequested: e.target.value } : x)))}
                />
                {items.length > 1 && (
                  <button onClick={() => setItems(arr => arr.filter((_, j) => j !== i))} className="px-2 text-red-500">✕</button>
                )}
              </div>
            ))}
          </div>
          <button onClick={() => setItems(a => [...a, { categoryId: '', amountRequested: '' }])} className="mt-2 text-sm font-semibold text-brand-700 hover:underline">
            ＋ Ajouter une ligne
          </button>
        </div>

        <div>
          <label className="label">Justificatifs — facture obligatoire</label>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-brand-400 hover:bg-brand-50/40 transition">
            <span className="text-3xl">📸</span>
            <span className="mt-2 text-sm font-medium text-slate-600">Photographier ou importer la facture</span>
            <span className="text-xs text-slate-400">JPEG, PNG ou PDF · 8 Mo max</span>
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={e => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {files.map(f => <li key={f.name}>📎 {f.name} ({Math.round(f.size / 1024)} Ko)</li>)}
            </ul>
          )}
          <Field label="Type du premier document">
            <select className="input" value={docType} onChange={e => setDocType(e.target.value)}>
              <option value="INVOICE">Facture</option>
              <option value="PRESCRIPTION">Ordonnance</option>
              <option value="OTHER">Autre justificatif</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="flex gap-2">
        <button className="btn-outline flex-1" disabled={busy} onClick={() => submit(false)}>Enregistrer en brouillon</button>
        <button
          className="btn-primary flex-[2]"
          disabled={busy || !files.some(() => docType === 'INVOICE') && files.length === 0}
          onClick={() => submit(true)}
        >
          {busy ? 'Envoi…' : 'Soumettre ma demande'}
        </button>
      </div>
    </div>
  );
}

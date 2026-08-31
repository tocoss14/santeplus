import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ErrorBanner, Field, Spinner } from '../../components/ui';

export default function AdminBranches() {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [error, setError] = useState<string | null>(null);
  const load = () => api.get<any[]>('/branches').then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);
  const create = async () => {
    setError(null);
    try {
      await api.post('/admin/branches', form);
      setForm({ code: '', name: '', description: '' });
      load();
    } catch (e: any) { setError(e?.message ?? 'Erreur'); }
  };
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Branches</h1>
      <ErrorBanner message={error} />
      <div className="card-p">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Code *"><input className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="MAL" /></Field>
          <Field label="Nom *"><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Maladie" /></Field>
          <Field label="Description"><input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></Field>
        </div>
        <button className="btn-primary btn-sm mt-3" onClick={create}>Créer branche</button>
      </div>
      {!items.length ? <p className="text-sm text-slate-400">Chargement…</p> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Code</th><th className="th">Nom</th><th className="th">Description</th></tr></thead>
            <tbody className="divide-y">
              {items.map((b: any) => <tr key={b.id}><td className="td font-mono">{b.code}</td><td className="td">{b.name}</td><td className="td text-sm text-slate-500">{b.description ?? '—'}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

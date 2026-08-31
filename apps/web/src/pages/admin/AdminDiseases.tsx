import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ErrorBanner, Field, Spinner } from '../../components/ui';
import Pagination from '../../components/Pagination';

export default function AdminDiseases() {
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({ code: '', name: '', category: '' });
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    qs.set('page', String(page));
    api.get(`/diseases?${qs.toString()}`).then(setData).catch(() => {});
  };
  useEffect(() => { load(); }, [q, page]);
  const create = async () => {
    setError(null);
    try {
      await api.post('/admin/diseases', form);
      setForm({ code: '', name: '', category: '' });
      load();
    } catch (e: any) { setError(e?.message ?? 'Erreur'); }
  };
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Maladies (CIM-10)</h1>
      <ErrorBanner message={error} />
      <div className="card-p">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Code CIM *"><input className="input" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="B54" /></Field>
          <Field label="Nom *"><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Paludisme" /></Field>
          <Field label="Catégorie"><input className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Infectieux" /></Field>
        </div>
        <button className="btn-primary btn-sm mt-3" onClick={create}>Créer maladie</button>
      </div>
      <div className="flex gap-2">
        <input className="input flex-1" placeholder="Rechercher code/nom…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {!data ? <Spinner /> : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">Code</th><th className="th">Nom</th><th className="th">Catégorie</th></tr></thead>
              <tbody className="divide-y">
                {data.items.map((d: any) => <tr key={d.id}><td className="td font-mono">{d.code}</td><td className="td">{d.name}</td><td className="td text-sm">{d.category ?? '—'}</td></tr>)}
                {data.items.length === 0 && <tr><td colSpan={3} className="td text-center text-slate-400 py-6">Aucune maladie</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

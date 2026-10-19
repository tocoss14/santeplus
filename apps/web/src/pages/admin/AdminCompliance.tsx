import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ErrorBanner, SkeletonCards } from '../../components/ui';

export default function AdminCompliance() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get('/admin/compliance/ratios').then(setData).catch(e => setErr(e?.message ?? 'Erreur'));
  }, []);

  if (err) return <ErrorBanner message={err} />;
  if (!data) return <SkeletonCards rows={4} />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Conformité ARSS — ratios prudentiels</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.ratios.map((r: any) => (
          <div key={r.code} className="card-p">
            <p className="text-xs uppercase tracking-wider text-stone">{r.label}</p>
            <p className="mt-2 text-2xl font-bold">{r.value ?? '—'} <span className="text-sm font-normal text-slate-500">{r.unit}</span></p>
            <p className="text-xs text-slate-500">Cible : {r.target} — {r.status}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">{data.note}</p>
    </div>
  );
}

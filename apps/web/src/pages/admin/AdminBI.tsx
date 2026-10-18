import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ErrorBanner, SkeletonCards } from '../../components/ui';

export default function AdminBI() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get('/admin/bi/indicators').then(setData).catch((e: any) => setErr(e?.message ?? 'Erreur'));
  }, []);

  if (err) return <ErrorBanner message={err} />;
  if (!data) return <SkeletonCards rows={4} />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Pilotage & BI v1</h1>
      <p className="text-sm text-slate-500">Généré le {new Date(data.generatedAt).toLocaleString('fr-FR')}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.indicators.map((ind: any) => (
          <div key={ind.code} className="card-p">
            <p className="text-xs uppercase tracking-wider text-stone">{ind.label}</p>
            {ind.code === 'MIX_FORMULE' ? (
              <ul className="mt-2 text-sm">
                {ind.value.map((m: any) => <li key={m.code}>{m.label} : {m.value}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-2xl font-bold">{ind.value ?? '—'} <span className="text-sm font-normal text-slate-500">{ind.unit}</span></p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

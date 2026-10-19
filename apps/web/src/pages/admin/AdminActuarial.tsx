import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ErrorBanner, SkeletonCards } from '../../components/ui';

export default function AdminActuarial() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get('/admin/actuarial/ibnr').then(setData).catch(e => setErr(e?.message ?? 'Erreur'));
  }, []);

  if (err) return <ErrorBanner message={err} />;
  if (!data) return <SkeletonCards rows={3} />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Actuarial — IBNR / SAP</h1>
      <div className="card-p">
        <p className="text-sm">Méthode : {data.method}</p>
        <p className="text-sm">Sinistres en base : {data.claimsCount}</p>
        <p className="text-sm">IBNR estimé : {data.ibnrEstimate ?? '—'}</p>
        <p className="text-sm">SAP estimé : {data.sapEstimate ?? '—'}</p>
        <p className="mt-2 text-xs text-slate-500">{data.note}</p>
      </div>
    </div>
  );
}

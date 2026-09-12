import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { fcfa, fmtDate } from '../../format';
import { ErrorBanner, Spinner, StatusBadge } from '../../components/ui';

const STATUSES = ['OPEN', 'REVIEWING', 'CONFIRMED', 'DISMISSED'] as const;

function qs(obj: Record<string, any>) {
  return new URLSearchParams(
    Object.entries(obj).filter(([, value]) => value !== '' && value != null) as Array<[string, string]>,
  ).toString();
}

export default function AdminFraud() {
  const navigate = useNavigate();
  const [data, setData] = useState<{ items: any[]; total: number; page: number; pages: number } | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [status, q]);

  useEffect(() => {
    api
      .get(`/admin/fraud?${qs({ status: status || undefined, q: q || undefined, page })}`)
      .then(setData)
      .catch((err: any) => setError(err?.message ?? 'Chargement impossible'));
  }, [status, q, page]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-xl font-bold">Dossiers fraude ({data?.total ?? '…'})</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-64"
            placeholder="Recherche (type, contrat, prestataire…)"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select className="input w-44" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Tous statuts</option>
            {STATUSES.map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="card-p">
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Aucun dossier pour ces critères.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th text-left">Dossier</th>
                  <th className="th text-left">Type</th>
                  <th className="th text-left">Contrat / prestataire</th>
                  <th className="th text-left">Statut</th>
                  <th className="th text-left">Créé</th>
                  <th className="th text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map(item => (
                  <tr key={item.id}>
                    <td className="td font-mono text-xs">{item.caseNumber}</td>
                    <td className="td">{item.kind}</td>
                    <td className="td text-xs">
                      <p className="font-medium">{item.contract?.number ?? item.provider?.name ?? '—'}</p>
                      <p className="text-slate-400">{item.contract?.holder ?? ''}</p>
                    </td>
                    <td className="td"><StatusBadge status={item.status} /></td>
                    <td className="td text-xs text-slate-500">{fmtDate(item.createdAt)}</td>
                    <td className="td">
                      <button className="btn-outline btn-sm" onClick={() => navigate(`/admin/fraud/${item.id}`)}>
                        Ouvrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.pages > 1 && (
          <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
            <span>Page {data.page} / {data.pages} · {data.total} dossier(s)</span>
            <div className="flex gap-2">
              <button className="btn-outline btn-sm" disabled={page === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>
                Précédent
              </button>
              <button className="btn-outline btn-sm" disabled={page === data.pages} onClick={() => setPage(value => value + 1)}>
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ErrorBanner, SkeletonCards } from '../../components/ui';

export default function AdminMedicalReview() {
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<any[]>('/admin/medical-review/queue').then(setItems).catch(e => setErr(e?.message ?? 'Erreur'));
  }, []);

  if (err) return <ErrorBanner message={err} />;
  if (!items) return <SkeletonCards rows={4} />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Contrôle médical — file d'attente</h1>
      {items.length === 0 ? <p className="text-sm text-slate-500">Aucun dossier à contrôler.</p> : (
        <div className="card-p overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-stone"><th className="py-2">Référence</th><th>Adhérent</th><th>Contrat</th><th>Demandé</th><th>Approuvé</th><th>Statut</th></tr></thead>
            <tbody>
              {items.map((it: any) => (
                <tr key={it.id} className="border-t border-mist">
                  <td className="py-2">{it.reference}</td>
                  <td>{it.claimant} ({it.memberNumber})</td>
                  <td>{it.contractNumber}</td>
                  <td>{it.totalRequested}</td>
                  <td>{it.totalApproved}</td>
                  <td>{it.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ErrorBanner, SkeletonCards } from '../../components/ui';

export default function AdminImpayes() {
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<any[]>('/admin/impayes').then(setItems).catch(e => setErr(e?.message ?? 'Erreur'));
  }, []);

  if (err) return <ErrorBanner message={err} />;
  if (!items) return <SkeletonCards rows={4} />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Impayés et relances</h1>
      {items.length === 0 ? <p className="text-sm text-slate-500">Aucun impayé.</p> : (
        <div className="card-p overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wider text-stone"><th className="py-2">Contrat</th><th>Adhérent</th><th>Produit</th><th>Montant</th><th>Échéance</th><th>Retard</th><th>Palier</th></tr></thead>
            <tbody>
              {items.map((it: any) => (
                <tr key={it.contributionId} className="border-t border-mist">
                  <td className="py-2">{it.contractNumber}</td>
                  <td>{it.adherent} ({it.memberNumber})</td>
                  <td>{it.product}</td>
                  <td>{it.amount}</td>
                  <td>{new Date(it.dueDate).toLocaleDateString('fr-FR')}</td>
                  <td className="text-red-600 font-semibold">{it.daysOverdue} j</td>
                  <td>{it.bucket}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

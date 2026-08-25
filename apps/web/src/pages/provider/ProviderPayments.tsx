import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { fcfa, fmtDate, statusLabel, statusStyle } from '../../format';
import { Spinner, StatCard } from '../../components/ui';

export default function ProviderPayments() {
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    api.get('/provider/thirdparty').then((d: any) => setItems(d.items)).catch(() => setItems([]));
  }, []);

  if (!items) return <Spinner />;

  const invoiced = items.filter(c => c.invoiceNumber && !c.paidAt);
  const paid = items.filter(c => c.paidAt);
  const due = invoiced.reduce((a, c) => a + (c.totalApproved ?? 0), 0);
  const received = paid.reduce((a, c) => a + (c.totalApproved ?? 0), 0);

  const rows = [...invoiced, ...paid];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Mes paiements</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="En attente de règlement" value={fcfa(due)} sub={`${invoiced.length} facture(s)`} accent />
        <StatCard label="Encaissé" value={fcfa(received)} sub={`${paid.length} règlement(s)`} />
        <StatCard label="À facturer" value={fcfa(items.filter(c => !c.invoiceNumber && c.status === 'CONFIRMED').reduce((a, c) => a + (c.totalApproved ?? 0), 0))} sub="prises en charge confirmées non facturées" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr><th className="th">Référence</th><th className="th">Patient</th><th className="th">Date soins</th><th className="th">Montant couvert</th><th className="th">Facture</th><th className="th">Statut</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="td">
                  <Link to={`/prestataire/prises/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.reference}</Link>
                </td>
                <td className="td text-sm">{c.patient}</td>
                <td className="td text-xs">{fmtDate(c.careDate)}</td>
                <td className="td text-sm font-medium">{fcfa(c.totalApproved ?? 0)}</td>
                <td className="td text-xs">{c.invoiceNumber ?? '—'}</td>
                <td className="td">
                  <span className={`badge ${c.paidAt ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                    {c.paidAt ? `Payée ${c.paidRef ? '· ' + c.paidRef : ''}` : 'En attente de paiement'}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="td py-8 text-center text-slate-400">Aucune facture — confirmez et facturez des prises en charge</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        Les règlements de l'assureur/mutuelle partenaire sont enregistrés par la plateforme.
        Un dossier passe en « Payée » dès confirmation du règlement (référence de virement visible).
      </p>
    </div>
  );
}

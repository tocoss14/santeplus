import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { fcfa, fmtDateTime, statusLabel, statusStyle } from '../../format';
import { ErrorBanner, Spinner, StatCard } from '../../components/ui';

export default function ProviderDashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get('/provider/dashboard').then(setData).catch(e => setError(e?.message ?? 'Erreur'));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Spinner />;

  const authRequired = data.statusCounts?.AUTH_REQUIRED ?? 0;
  const pendingConfirm = (data.statusCounts?.PENDING_CONFIRMATION ?? 0) + (data.statusCounts?.AUTHORIZED ?? 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold mr-auto">Tableau de bord</h1>
        <Link to="/prestataire/verifier" className="btn-outline btn-sm">🪪 Vérifier un assuré</Link>
        <Link to="/prestataire/nouvelle" className="btn-primary btn-sm">＋ Nouvelle prise en charge</Link>
      </div>

      {authRequired > 0 && (
        <Link to="/prestataire/prises?status=AUTH_REQUIRED" className="block card-p border-orange-300 bg-orange-50 hover:bg-orange-100 transition">
          <p className="font-semibold text-orange-800">⏳ {authRequired} autorisation(s) préalable(s) en attente du gestionnaire</p>
          <p className="text-sm text-orange-700">Ces dossiers ne pourront être confirmés qu'après validation.</p>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Patients assurés aujourd'hui" value={data.today.patients} accent />
        <StatCard label="Soins du jour" value={fcfa(data.today.totalBilled)} />
        <StatCard label="Couvert (jour)" value={fcfa(data.today.totalCovered)} />
        <StatCard label="Reste à charge (jour)" value={fcfa(data.today.totalBilled - data.today.totalCovered)} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Facturé ce mois" value={fcfa(data.month.totalBilled)} sub={`${data.month.totalCovered ? 'dont ' + fcfa(data.month.totalCovered) + ' couverts' : ''}`} />
        <StatCard label="À recevoir" value={fcfa(data.month.pendingPayment.amount)} sub={`${data.month.pendingPayment.count} facture(s) en attente`} />
        <StatCard label="Encaissé ce mois" value={fcfa(data.month.received.amount)} sub={`${data.month.received.count} règlement(s)`} />
        <StatCard label="Reste à charge patients" value={fcfa(data.month.patientDue)} />
      </div>

      <div className="card overflow-x-auto">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-semibold">Activité récente</h2>
          <Link to="/prestataire/prises" className="text-xs font-semibold text-brand-700 hover:underline">Tout voir</Link>
        </div>
        <table className="w-full min-w-[820px] mt-2">
          <thead>
            <tr>
              <th className="th">Date</th><th className="th">Patient</th><th className="th">N° assuré</th>
              <th className="th">Acte</th><th className="th">Montant</th><th className="th">Couvert</th>
              <th className="th">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.recent.map((c: any) => (
              <tr key={c.id} className="cursor-pointer hover:bg-slate-50">
                <td className="td">
                  <Link to={`/prestataire/prises/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.reference}</Link>
                  <p className="text-[11px] text-slate-400">{fmtDateTime(c.createdAt)}</p>
                </td>
                <td className="td text-sm">{c.patient}</td>
                <td className="td text-xs">{c.memberNumber}</td>
                <td className="td text-xs">{c.actLabel}</td>
                <td className="td text-sm">{fcfa(c.totalRequested)}</td>
                <td className="td text-sm font-medium">{fcfa(c.totalApproved ?? 0)}</td>
                <td className="td"><span className={`badge ${statusStyle(c.status)}`}>{statusLabel(c.status)}</span></td>
              </tr>
            ))}
            {data.recent.length === 0 && (
              <tr><td colSpan={7} className="td py-8 text-center text-slate-400">Aucune prise en charge — commencez par vérifier un assuré</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

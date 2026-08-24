import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { fcfa, fmtDate, statusLabel, statusStyle } from '../../format';
import { EmptyState, Spinner, StatCard, StatusBadge } from '../../components/ui';

export default function CompanyDashboard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get('/company/me/dashboard').then(setData).catch(() => setData({ error: true }));
  }, []);

  if (!data) return <Spinner />;
  if (data.error) return <ErrorBanner message="Espace entreprise indisponible" />;
  void EmptyState;

  const s = data.stats;
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">{data.company.name}</h1>

      {!data.groupContract ? (
        <div className="card-p bg-gradient-to-br from-brand-600 to-brand-700 text-white border-brand-600 text-center">
          <h2 className="text-lg font-bold">Aucun contrat collectif actif</h2>
          <p className="mt-1 text-sm text-brand-100">Souscrivez le contrat collectif pour couvrir vos salariés.</p>
          <Link to="/entreprise/contrat" className="btn mt-4 bg-white text-brand-800">Souscrire maintenant</Link>
        </div>
      ) : (
        <>
          <div className="card-p flex flex-wrap items-center gap-3">
            <span className={`badge ${statusStyle(data.groupContract.status)}`}>{statusLabel(data.groupContract.status)}</span>
            <span className="font-semibold">{data.groupContract.product.name}</span>
            <span className="text-sm text-slate-400">{data.groupContract.number}</span>
            <span className="ml-auto text-sm text-slate-500">
              Validité : {fmtDate(data.groupContract.startDate)} → {fmtDate(data.groupContract.endDate)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Salariés" value={s.employeesActive} sub={`${s.employeesTotal} enregistrés`} accent />
            <StatCard label="Contrats actifs" value={s.employeeContractsActive} />
            <StatCard label="Échéances à payer" value={s.pendingContributions} sub={s.nextDueAmount ? `Prochaine : ${fcfa(s.nextDueAmount)}` : undefined} />
            {s.claims && <StatCard label="Sinistralité" value={fcfa(s.claims.totalApproved)} sub={`${s.claims.count} demandes`} />}
          </div>

          {s.claims && (
            <div className="card-p">
              <h2 className="font-semibold">Suivi des remboursements salariés</h2>
              <div className="mt-3 h-2.5 rounded-full bg-slate-100">
                <div
                  className="h-2.5 rounded-full bg-brand-500"
                  style={{ width: `${s.claims.totalRequested ? Math.round((s.claims.totalApproved / s.claims.totalRequested) * 100) : 0}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {fcfa(s.claims.totalApproved)} approuvés sur {fcfa(s.claims.totalRequested)} demandés — données agrégées, sans détail médical.
              </p>
            </div>
          )}
        </>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/entreprise/salaries" className="card-p hover:border-brand-300">
          <p className="font-semibold">👥 Gérer les salariés</p>
          <p className="mt-1 text-sm text-slate-500">Ajout individuel ou import CSV avec détection de doublons</p>
        </Link>
        <Link to="/entreprise/contrat" className="card-p hover:border-brand-300">
          <p className="font-semibold">📄 Contrat & cotisations</p>
          <p className="mt-1 text-sm text-slate-500">Échéancier, paiement et renouvellement du contrat collectif</p>
        </Link>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>;
}

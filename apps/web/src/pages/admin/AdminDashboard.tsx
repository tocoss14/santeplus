import { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api';
import { fcfa } from '../../format';
import { Spinner, StatCard } from '../../components/ui';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.get('/stats/admin/dashboard').then(setStats).catch(() => setStats({ error: true }));
  }, []);

  if (!stats) return <Spinner />;
  if (stats.error) return <div className="card-p text-sm text-red-600">Statistiques indisponibles.</div>;

  const c = stats.cards;
  const adhesions = stats.series.monthlyAdhesions.map((x: any) => ({ ...x, label: x.month.slice(2) }));
  const cotisations = stats.series.monthlyCotisations.map((x: any) => ({ ...x, label: x.month.slice(2), total: Number(x.total) }));

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Tableau de bord administrateur</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Assurés" value={c.membersTotal} sub={`${c.membersActive} actifs`} accent />
        <StatCard label="Entreprises" value={c.companiesTotal} />
        <StatCard label="Contrats actifs" value={c.contractsActive} sub={`${c.contractsExpired} expirés · ${c.contractsPendingPayment} en attente`} />
        <StatCard label="Prestataires" value={c.providersActive} />
        <StatCard label="Cotisations encaissées" value={fcfa(c.cotisationsCollectedYear)} sub="année en cours" />
        <StatCard label="Remboursements" value={fcfa(c.remboursementsYear)} sub="année en cours" />
        <StatCard label="Ratio sinistres/cotisations" value={c.lossRatio != null ? `${c.lossRatio}%` : '—'} sub={c.lossRatio != null && c.lossRatio > 80 ? '⚠️ au-dessus de la cible' : undefined} />
        <StatCard label="Demandes en attente" value={c.claimsPending} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-p">
          <h2 className="mb-3 font-semibold">Évolution des adhésions</h2>
          {adhesions.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Pas encore de données</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={adhesions}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="count" name="Adhésions" stroke="#0d9488" fill="#99f6e4" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="card-p">
          <h2 className="mb-3 font-semibold">Cotisations encaissées</h2>
          {cotisations.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">Pas encore de données</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cotisations}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => fcfa(v)} />
                <Bar dataKey="total" name="Encaissé" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card-p">
        <h2 className="mb-3 font-semibold">Contrats actifs par produit</h2>
        <ul className="space-y-3">
          {stats.byProduct.map((p: any) => {
            const max = Math.max(1, ...stats.byProduct.map((x: any) => x.activeContracts));
            return (
              <li key={p.code}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{p.name}</span>
                  <span className="font-semibold">{p.activeContracts}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-brand-500 transition-all" style={{ width: `${(p.activeContracts / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api';
import { fcfa } from '../../format';
import { Spinner, StatCard } from '../../components/ui';

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [anomalies, setAnomalies] = useState<any[] | null>(null);
  const [anomaliesError, setAnomaliesError] = useState(false);

  useEffect(() => {
    api.get('/stats/admin/dashboard').then(setStats).catch(() => setStats({ error: true }));
  }, []);

  useEffect(() => {
    api.get('/admin/anomalies').then((res: any) => setAnomalies(res.items ?? res ?? [])).catch(() => setAnomaliesError(true));
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

      {/*
        Rétention/purge (Task 9) — désactivé par défaut, requiert validation juridique.
        Configurer via PATCH /admin/config avec les clés SystemConfig:
          retention.enabled (boolean), retention.careRecordDays, retention.invoiceDays, retention.auditDays (jours, >0).
        Tant qu'aucune durée >0 ou enabled=true n'est définie, le job quotidien 03:00 ne fait rien.
        Voir apps/api/src/domain/retention.ts et jobs/retention.job.ts.
      */}
      <div className="card-p">
        <h2 className="mb-3 font-semibold">Rétention / purge</h2>
        <p className="text-sm text-slate-600">
          Mécanisme désactivé par défaut. Nécessite une durée légale validée (CIMA/Bénin) avant activation.
          Configurer via <code className="rounded bg-slate-100 px-1">PATCH /admin/config</code> — clés&nbsp;:
          <code className="rounded bg-slate-100 px-1 ml-1">retention.careRecordDays</code>,
          <code className="rounded bg-slate-100 px-1">retention.invoiceDays</code>,
          <code className="rounded bg-slate-100 px-1">retention.auditDays</code>
          {' '}ou <code className="rounded bg-slate-100 px-1">retention.enabled</code>. Job quotidien à 03:00.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          MVP&nbsp;: anonymise les <em>CareRecord</em> (beneficiaryId/providerId → null, status ANONYMIZED) et supprime les <em>AuditLog</em> expirés. Factures non purgées en MVP.
        </p>
      </div>

      <div className="card-p">
        <h2 className="mb-3 font-semibold">Anomalies</h2>
        {anomaliesError ? (
          <p className="text-sm text-slate-400">Alertes indisponibles.</p>
        ) : anomalies === null ? (
          <p className="text-sm text-slate-400">Chargement…</p>
        ) : anomalies.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune anomalie détectée sur les 30 derniers jours.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Prestataire / Contrat</th>
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium">Z-score / Raison</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a: any) => {
                  const meta = a.meta ?? {};
                  const isCumul = meta.type === 'CUMUL';
                  const providerLabel = meta.providerName ?? meta.providerId ?? a.entityId ?? '—';
                  const contractLabel = isCumul ? (meta.contractId ?? a.entityId) : providerLabel;
                  const date = a.createdAt ? new Date(a.createdAt).toLocaleDateString('fr-FR') : '—';
                  const reason = isCumul
                    ? `Cumul suspect — ${meta.code ?? '?'} le ${meta.date ?? date} (${meta.count ?? '?'} bénéficiaires)`
                    : `${meta.metric === 'both' ? 'Montant + volume' : meta.metric === 'count' ? 'Volume' : 'Montant'} — Z avg ${meta.zAvg != null ? Number(meta.zAvg).toFixed(2) : '—'}, Z count ${meta.zCount != null ? Number(meta.zCount).toFixed(2) : '—'}`;
                  return (
                    <tr key={a.id} className="border-t">
                      <td className="py-2 text-slate-600">{date}</td>
                      <td className="py-2 font-medium">{isCumul ? contractLabel : providerLabel}</td>
                      <td className="py-2">
                        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${isCumul ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                          {isCumul ? 'CUMUL' : 'Z-SCORE'}
                        </span>
                      </td>
                      <td className="py-2 text-slate-700">{reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api';
import { fcfa, fmtDate } from '../../format';
import { Spinner } from '../../components/ui';
import DateRangeFilter from '../../components/DateRangeFilter';
import { printReport, exportCsv } from '../../printReport';

/**
 * Position technique consolidée du portefeuille V2 — et uniquement V2.
 * Les chiffres V1 (modèle gelé) ne sont jamais fondus ici : la consolidation
 * inter-modèle est interdite sans règles explicites (cf.
 * docs/financial-model-versioning.md).
 */
export default function AdminPositionV2() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    api.get(`/admin/financial-models/position-v2${qs ? `?${qs}` : ''}`)
      .then(setData)
      .catch((err: any) => setError(err?.message ?? 'Position V2 indisponible'));
  };

  // Débounce façon AdminContracts : la requête suit la période de 250 ms.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  if (error) return <div className="card-p text-sm text-red-600">{error}</div>;
  if (!data) return <Spinner />;

  const a = data.aggregates;
  const sol = data.solvency;
  const ratio = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '∞' : `${(v * 100).toFixed(1)} %`);
  const months = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '∞' : v.toFixed(1));
  const periodLabel = [from && `du ${new Date(from).toLocaleDateString('fr-FR')}`, to && `au ${new Date(to).toLocaleDateString('fr-FR')}`]
    .filter(Boolean)
    .join(' ') || 'Toutes périodes';

  const contractColumns = [
    { label: 'N° contrat', key: 'number' },
    { label: 'Statut', key: 'status' },
    { label: 'Cotisations', key: 'contributions', align: 'right' as const, format: (v: number) => v?.toLocaleString('fr-FR') + ' F' },
    { label: 'Engagé', key: 'engagedClaims', align: 'right' as const, format: (v: number) => v?.toLocaleString('fr-FR') + ' F' },
    { label: 'Payé', key: 'paidClaims', align: 'right' as const, format: (v: number) => v?.toLocaleString('fr-FR') + ' F' },
    { label: 'Position', key: 'position', align: 'right' as const, format: (v: number) => v?.toLocaleString('fr-FR') + ' F' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Position technique V2</h1>
        <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <button
          className="btn-outline btn-sm"
          onClick={() =>
            printReport({
              title: 'Position technique — V2 Mutualiste',
              subtitle: `${data.contractsCount} contrat(s) V2`,
              filters: `Période : ${periodLabel}`,
              columns: contractColumns,
              rows: data.contracts,
              summary: [
                { label: 'Cotisations encaissées', value: fcfa(a.contributions) },
                { label: 'Prestations engagées', value: fcfa(a.engagedClaims) },
                { label: 'Prestations payées', value: fcfa(a.paidClaims) },
                { label: 'Provisions (RBNS + IBNR)', value: fcfa(a.rbns + a.ibnr) },
                { label: 'Position technique', value: fcfa(data.position.position), accent: true },
                { label: 'Marge de solvabilité', value: ratio(sol.solvencyRatio) },
              ],
            })
          }
        >
          🖨️ Imprimer
        </button>
        <button
          className="btn-outline btn-sm"
          onClick={() => exportCsv('position-technique-v2.csv', contractColumns, data.contracts)}
        >
          📊 CSV
        </button>
      </div>

      <p className="text-sm text-slate-500">
        Portefeuille V2 uniquement ({data.contractsCount} contrat{data.contractsCount > 1 ? 's' : ''}) — {periodLabel}.
        Aucune consolidation avec le portefeuille V1 (modèle gelé) — les deux modèles ne mesurent pas les mêmes économies.
      </p>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card-p">
          <p className="text-xs text-slate-500">Cotisations encaissées</p>
          <p className="mt-1 text-lg font-bold">{fcfa(a.contributions)}</p>
        </div>
        <div className="card-p">
          <p className="text-xs text-slate-500">Prestations engagées</p>
          <p className="mt-1 text-lg font-bold">{fcfa(a.engagedClaims)}</p>
        </div>
        <div className="card-p">
          <p className="text-xs text-slate-500">Prestations payées</p>
          <p className="mt-1 text-lg font-bold">{fcfa(a.paidClaims)}</p>
        </div>
        <div className="card-p" data-testid="position-v2-total">
          <p className="text-xs text-slate-500">Position technique</p>
          <p className={`mt-1 text-lg font-bold ${data.position.position >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {fcfa(data.position.position)}
          </p>
        </div>
      </div>

      {data.solvencySeries && (
        <div className="card-p">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Évolution de la solvabilité V2 (flux cumulés)</h2>
            <p className="text-xs text-slate-400">
              {data.solvencySeries.months.length > 0 &&
                `${data.solvencySeries.months[0].label} → ${data.solvencySeries.months[data.solvencySeries.months.length - 1].label}`}
              {' · '}
              Ligne pointillée : seuil d'alerte ({(data.solvencySeries.threshold * 100).toFixed(0)} %)
              {data.solvencySeries.months.length > 12 && ' · historique persisté inclus'}
            </p>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={data.solvencySeries.months} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" fontSize={11} tickLine={false} />
              <YAxis yAxisId="fcfa" fontSize={11} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} tickLine={false} />
              <YAxis
                yAxisId="ratio"
                orientation="right"
                fontSize={11}
                tickFormatter={(v: number) => `${Math.round(v * 100)} %`}
                tickLine={false}
                domain={[0, (dataMax: number) => Math.max(1, dataMax)]}
              />
              <Tooltip
                formatter={(value: any, name: string) =>
                  name === 'Marge de solvabilité'
                    ? [`${(Number(value) * 100).toFixed(1)} %`, name]
                    : [fcfa(Number(value)), name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="fcfa" dataKey="contributions" name="Cotisations cumulées" fill="#0d9488" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="fcfa" dataKey="claims" name="Prestations cumulées" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              <Line
                yAxisId="ratio"
                type="monotone"
                dataKey="solvencyRatio"
                name="Marge de solvabilité"
                stroke="#4f46e5"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
              <Line
                yAxisId="ratio"
                type="monotone"
                dataKey={() => data.solvencySeries.threshold}
                name="Seuil d'alerte"
                stroke="#ef4444"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                dot={false}
                activeDot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-p">
          <h2 className="mb-3 font-semibold">Provisions & réserves</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Provision RBNS (sinistres survenus, non déclarés)</dt><dd className="font-medium">{fcfa(a.rbns)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Provision IBNR</dt><dd className="font-medium">{fcfa(a.ibnr)}</dd></div>
            <div className="flex justify-between border-t pt-2"><dt className="text-slate-600">Dotation de réserve recommandée</dt><dd className="font-semibold">{fcfa(data.reserveAllocation)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Cession réassurance (quota-share)</dt><dd className="font-medium">{fcfa(data.position.reinsuranceCeded)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Recouvrements</dt><dd className="font-medium">{fcfa(a.recoveries)}</dd></div>
          </dl>
        </div>
        <div className="card-p">
          <h2 className="mb-3 font-semibold">Résultat & indicateurs prudentiels</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Résultat technique</dt><dd className={`font-semibold ${data.result.technicalResult >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fcfa(data.result.technicalResult)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Affectation Fonds de solidarité</dt><dd className="font-medium">{fcfa(data.result.solidarityAllocation)}</dd></div>
            <div className="flex justify-between border-t pt-2"><dt className="text-slate-600">Marge de solvabilité</dt><dd className="font-semibold">{ratio(sol.solvencyRatio)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Taux de sinistralité</dt><dd className="font-medium">{ratio(sol.lossRatio)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Taux de charges</dt><dd className="font-medium">{ratio(sol.expenseRatio)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Couverture des provisions</dt><dd className="font-medium">{ratio(sol.provisionCoverage)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Mois de charges couverts</dt><dd className="font-medium">{months(sol.monthsOfCoverage)}</dd></div>
          </dl>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              <th className="th">Contrat</th>
              <th className="th">Statut</th>
              <th className="th">Créé le</th>
              <th className="th">Cotisations</th>
              <th className="th">Engagé</th>
              <th className="th">Payé</th>
              <th className="th">Position</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.contracts.map((c: any) => (
              <tr key={c.contractId}>
                <td className="td font-medium">{c.number}</td>
                <td className="td text-xs">{c.status}</td>
                <td className="td text-xs whitespace-nowrap">{fmtDate(c.createdAt)}</td>
                <td className="td text-sm">{fcfa(c.contributions)}</td>
                <td className="td text-sm">{fcfa(c.engagedClaims)}</td>
                <td className="td text-sm">{fcfa(c.paidClaims)}</td>
                <td className={`td text-sm font-semibold ${c.position >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fcfa(c.position)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.contracts.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-400">Aucun contrat V2 sur la période sélectionnée</p>
        )}
      </div>
    </div>
  );
}

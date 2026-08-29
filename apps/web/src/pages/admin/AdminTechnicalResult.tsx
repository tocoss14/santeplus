import { useEffect, useState } from 'react';
import { api } from '../../api';

interface ProductAnalysis {
  product: { id: string; name: string; code: string };
  activeContracts: number;
  basePremium: number;
  globalCap: number;
  estimatedRevenue: number;
  claimsCount: number;
  claimsTotalApproved: number;
  lossRatio: number | null;
  margin: number;
  ageLoadings: { minAge: number; maxAge: number; factor: number }[];
}

interface TechResult {
  summary: {
    totalCollected: number;
    totalClaimsPaid: number;
    totalRequested: number;
    technicalResult: number;
    technicalResultMargin: number | null;
    lossRatio: number | null;
    claimsCount: number;
    avgClaimAmount: number;
  };
  emergencyOverrides: {
    count: number;
    totalApproved: number;
    percentageOfTotal: number;
  };
  feeScheduleAlerts: number;
  byProduct: ProductAnalysis[];
  alerts: { level: string; message: string }[];
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR') + ' FCFA';
}

function fmtPct(n: number | null) {
  return n !== null ? n.toFixed(1) + '%' : '—';
}

function LossRatioBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-gray-400">—</span>;
  const color = value > 80 ? 'bg-red-500' : value > 65 ? 'bg-yellow-500' : value > 50 ? 'bg-orange-400' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 h-3 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className={`text-sm font-bold ${value > 80 ? 'text-red-600' : value > 65 ? 'text-yellow-600' : 'text-gray-700'}`}>{fmtPct(value)}</span>
    </div>
  );
}

export default function AdminTechnicalResult() {
  const [data, setData] = useState<TechResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get('/stats/admin/technical-result')
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message ?? 'Erreur de chargement'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-center text-gray-500">Chargement du résultat technique…</div>;
  if (error) return <div className="p-6 text-center text-red-500">{error}</div>;
  if (!data) return null;

  const { summary, emergencyOverrides, feeScheduleAlerts, byProduct, alerts } = data;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">📊 Résultat Technique</h1>

      {/* Alertes */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`p-3 rounded-lg text-sm font-medium ${
              a.level === 'CRITICAL' ? 'bg-red-100 text-red-800 border border-red-300' :
              'bg-yellow-100 text-yellow-800 border border-yellow-300'
            }`}>
              {a.level === 'CRITICAL' ? '🔴' : '🟡'} {a.message}
            </div>
          ))}
        </div>
      )}

      {/* KPIs globaux */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-500">Cotisations perçues</div>
          <div className="text-xl font-bold text-green-600">{fmt(summary.totalCollected)}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-500">Remboursements payés</div>
          <div className="text-xl font-bold text-red-600">{fmt(summary.totalClaimsPaid)}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-500">Résultat technique</div>
          <div className={`text-xl font-bold ${summary.technicalResult >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {summary.technicalResult >= 0 ? '+' : ''}{fmt(summary.technicalResult)}
          </div>
          <div className="text-xs text-gray-400">Marge : {fmtPct(summary.technicalResultMargin)}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-500">Loss Ratio global</div>
          <LossRatioBar value={summary.lossRatio} />
        </div>
      </div>

      {/* KPIs secondaires */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-500">Nombre de sinistres</div>
          <div className="text-lg font-bold">{summary.claimsCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-500">Montant moyen / sinistre</div>
          <div className="text-lg font-bold">{fmt(summary.avgClaimAmount)}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-500">Dérogations urgence</div>
          <div className="text-lg font-bold">{emergencyOverrides.count}</div>
          <div className="text-xs text-gray-400">{fmtPct(emergencyOverrides.percentageOfTotal)} des remboursements</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-500">Alertes barème médical</div>
          <div className="text-lg font-bold">{feeScheduleAlerts}</div>
        </div>
      </div>

      {/* Analyse par produit */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Analyse par produit</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left">Produit</th>
                <th className="px-4 py-3 text-right">Contrats</th>
                <th className="px-4 py-3 text-right">Prime/base</th>
                <th className="px-4 py-3 text-right">Revenu estimé</th>
                <th className="px-4 py-3 text-right">Sinistres</th>
                <th className="px-4 py-3 text-right">Payé</th>
                <th className="px-4 py-3 text-center">Loss Ratio</th>
                <th className="px-4 py-3 text-right">Marge</th>
                <th className="px-4 py-3 text-center">Chargement âge</th>
              </tr>
            </thead>
            <tbody>
              {byProduct.map(p => (
                <tr key={p.product.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.product.name}</td>
                  <td className="px-4 py-3 text-right">{p.activeContracts}</td>
                  <td className="px-4 py-3 text-right">{fmt(p.basePremium)}</td>
                  <td className="px-4 py-3 text-right">{fmt(p.estimatedRevenue)}</td>
                  <td className="px-4 py-3 text-right">{p.claimsCount}</td>
                  <td className="px-4 py-3 text-right">{fmt(p.claimsTotalApproved)}</td>
                  <td className="px-4 py-3 text-center"><LossRatioBar value={p.lossRatio} /></td>
                  <td className={`px-4 py-3 text-right font-medium ${p.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {p.margin >= 0 ? '+' : ''}{fmt(p.margin)}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">
                    {p.ageLoadings.length > 0 ? (
                      <span title={JSON.stringify(p.ageLoadings)}>
                        {p.ageLoadings.length} tranches
                      </span>
                    ) : 'Aucun'}
                  </td>
                </tr>
              ))}
              {byProduct.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">Aucun produit actif</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Guide des Loss Ratios */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-semibold text-blue-800 mb-3">📈 Guide du Résultat Technique</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <span className="text-green-600 font-bold">●</span>
            <div>
              <div className="font-medium">Sain (&lt;65%)</div>
              <div className="text-gray-600">Les cotisations couvrent largement les sinistres. Marge de sécurité confortable.</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-yellow-500 font-bold">●</span>
            <div>
              <div className="font-medium">Alerte (65-80%)</div>
              <div className="text-gray-600">Zone de vigilance. Envisagez d'ajuster les primes ou les taux de couverture.</div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-500 font-bold">●</span>
            <div>
              <div className="font-medium">Critique (&gt;80%)</div>
              <div className="text-gray-600">Risque de déficit. Augmentation des primes ou réduction des taux nécessaire.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, ratioPct } from '../../format';
import { ErrorBanner, Spinner, StatCard } from '../../components/ui';

export default function AdminAnalytics() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/kpis'),
      api.get('/analytics/loss-ratio?months=12'),
      api.get('/analytics/technical-reserves'),
      api.get('/analytics/product-profitability'),
      api.get('/analytics/provider-performance'),
      api.get('/analytics/portfolio-evolution?months=12'),
    ])
      .then(([kpis, lossRatio, reserves, products, providers, evolution]) => {
        setData({ kpis, lossRatio, reserves, products, providers, evolution });
      })
      .catch((err: any) => setError(err?.message ?? 'Chargement impossible'));
  }, []);

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Analytique portefeuille</h1>
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!data) return <Spinner />;

  const topProviders = [...(data.providers ?? [])]
    .sort((a: any, b: any) => (b.totalAmount ?? 0) - (a.totalAmount ?? 0))
    .slice(0, 10);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Analytique portefeuille</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Contrats actifs" value={data.kpis.activeContracts} />
        <StatCard label="Assurés actifs" value={data.kpis.activeMembers} />
        <StatCard label="Sinistralité YTD" value={ratioPct(data.kpis.lossRatioYTD)} />
        <StatCard label="Réserves techniques" value={fcfa(data.kpis.technicalReserves)} />
      </div>

      <div className="card-p">
        <h2 className="font-semibold">Sinistralité mensuelle</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr><th className="th text-left">Période</th><th className="th text-right">Primes</th><th className="th text-right">Sinistres</th><th className="th text-right">S/P</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.lossRatio.map((row: any) => (
                <tr key={row.period}>
                  <td className="td font-mono text-xs">{row.period}</td>
                  <td className="td text-right">{fcfa(row.premiums)}</td>
                  <td className="td text-right">{fcfa(row.claims)}</td>
                  <td className="td text-right font-semibold">{ratioPct(row.lossRatio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-p">
        <h2 className="font-semibold">Réserves techniques — RBNS {fcfa(data.reserves.rbns)} · IBNR {fcfa(data.reserves.ibnr)}</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr><th className="th text-left">Produit</th><th className="th text-right">RBNS</th><th className="th text-right">IBNR</th><th className="th text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.reserves.byProduct.map((row: any) => (
                <tr key={row.productId}>
                  <td className="td">{row.productName}</td>
                  <td className="td text-right">{fcfa(row.rbns)}</td>
                  <td className="td text-right">{fcfa(row.ibnr)}</td>
                  <td className="td text-right font-semibold">{fcfa(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-p">
        <h2 className="font-semibold">Rentabilité par produit</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr><th className="th text-left">Produit</th><th className="th text-right">Contrats</th><th className="th text-right">Primes</th><th className="th text-right">Sinistres</th><th className="th text-right">S/P</th><th className="th text-right">Résultat</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.products.map((row: any) => (
                <tr key={row.productId}>
                  <td className="td">{row.productName} <span className="text-xs text-slate-400">({row.productCode})</span></td>
                  <td className="td text-right">{row.contractsCount}</td>
                  <td className="td text-right">{fcfa(row.premiums)}</td>
                  <td className="td text-right">{fcfa(row.claims)}</td>
                  <td className="td text-right">{ratioPct(row.lossRatio)}</td>
                  <td className="td text-right font-semibold">{fcfa(row.technicalResult)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-p">
        <h2 className="font-semibold">Principaux prestataires par montant</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr><th className="th text-left">Prestataire</th><th className="th text-left">Type</th><th className="th text-right">Dossiers</th><th className="th text-right">Montant</th><th className="th text-right">Approbation</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {topProviders.map((row: any) => (
                <tr key={row.providerId}>
                  <td className="td">{row.providerName}</td>
                  <td className="td text-xs">{row.type}</td>
                  <td className="td text-right">{row.claimsCount}</td>
                  <td className="td text-right font-semibold">{fcfa(row.totalAmount)}</td>
                  <td className="td text-right">{ratioPct(row.approvalRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

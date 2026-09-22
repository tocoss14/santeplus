import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate, ratioPct } from '../../format';
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
      api.get('/analytics/care-dossier-evolution?months=6'),
      api.get('/analytics/care-dossier-anomalies'),
    ])
      .then(([kpis, lossRatio, reserves, products, providers, evolution, dossierEvolution, anomalies]) => {
        setData({ kpis, lossRatio, reserves, products, providers, evolution, dossierEvolution, anomalies });
      })
      .catch((err: any) => setError(err?.message ?? 'Chargement impossible'));
  }, []);

  const [fixing, setFixing] = useState<string | null>(null);
  const [fixError, setFixError] = useState<string | null>(null);

  async function fixMismatch(row: any) {
    if (!window.confirm(`Détacher le dossier ${row.dossierReference} du sinistre ${row.reference} ?\n\nLe dossier redeviendra rattachable au bon sinistre depuis l'écran « Instruction dossiers ».`)) return;
    setFixing(row.dossierId);
    setFixError(null);
    try {
      await api.del(`/admin/claims/${row.id}/care-dossier`);
      const anomalies = await api.get('/analytics/care-dossier-anomalies');
      setData((d: any) => (d ? { ...d, anomalies } : d));
    } catch (err: any) {
      setFixError(err?.message ?? 'Correction impossible');
    } finally {
      setFixing(null);
    }
  }

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
        <h2 className="font-semibold">Traçabilité soin ↔ sinistre</h2>
        <div className="mt-2 flex flex-wrap items-end gap-4">
          <div>
            <p className="text-3xl font-bold" aria-label={`${Math.round((data.kpis.tpDossierRatio ?? 0) * 100)} pour cent des prises en charge avec dossier de soins`}>
              {ratioPct(data.kpis.tpDossierRatio ?? 0)}
            </p>
            <p className="text-sm text-slate-500">
              des prises en charge tiers-payant ont un dossier de soins ({data.kpis.tpWithDossier ?? 0}/{data.kpis.tpTotal ?? 0})
            </p>
          </div>
          <div className="h-2 min-w-[180px] flex-1 overflow-hidden rounded-full bg-slate-100" role="presentation">
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{ width: `${Math.round(Math.min(1, data.kpis.tpDossierRatio ?? 0) * 100)}%` }}
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Chaque prise en charge naît dans un dossier de soins (invariant plateforme). Les sinistres classiques sont rattachés manuellement depuis l'instruction et ne comptent pas ici.
        </p>
        {Array.isArray(data.dossierEvolution) && data.dossierEvolution.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">6 derniers mois (base : prises en charge du mois)</h3>
            <table className="mt-2 w-full max-w-md text-sm">
              <thead>
                <tr>
                  <th className="th text-left" scope="col">Mois</th>
                  <th className="th text-right" scope="col">Avec dossier</th>
                  <th className="th text-right" scope="col">Ratio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.dossierEvolution.map((row: any) => (
                  <tr key={row.period}>
                    <td className="td font-mono text-xs">{row.period}</td>
                    <td className="td text-right">{row.withDossier}/{row.total}</td>
                    <td className={`td text-right font-semibold ${row.ratio < 1 && row.total > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {ratioPct(row.ratio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card-p">
        <h2 className="font-semibold">Anomalies de traçabilité</h2>
        {(() => {
          const anomalies = data.anomalies ?? { withoutDossier: [], patientMismatch: [] };
          const count = anomalies.withoutDossier.length + anomalies.patientMismatch.length;
          if (count === 0) {
            return (
              <p className="mt-2 text-sm text-emerald-700" aria-label="Aucune anomalie de traçabilité active">
                ✓ Aucune anomalie active : chaque prise en charge est née dans un dossier de soins, chaque dossier rattaché concerne le bon assuré.
              </p>
            );
          }
          return (
            <div className="mt-3 space-y-4">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Prises en charge sans dossier de soins ({anomalies.withoutDossier.length})
                </h3>
                {anomalies.withoutDossier.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">Aucune.</p>
                ) : (
                  <table className="mt-2 w-full max-w-2xl text-sm">
                    <thead>
                      <tr>
                        <th className="th text-left" scope="col">Référence</th>
                        <th className="th text-left" scope="col">Type</th>
                        <th className="th text-right" scope="col">Date de soin</th>
                        <th className="th text-right" scope="col">Montant</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {anomalies.withoutDossier.map((row: any) => (
                        <tr key={row.id}>
                          <td className="td font-mono text-xs">{row.reference}</td>
                          <td className="td text-xs">{row.kind}</td>
                          <td className="td text-right text-xs">{row.careDate ? fmtDate(row.careDate) : '—'}</td>
                          <td className="td text-right">{row.totalRequested != null ? fcfa(row.totalRequested) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Dossiers rattachés à un autre assuré ({anomalies.patientMismatch.length})
                </h3>
                {anomalies.patientMismatch.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">Aucune.</p>
                ) : (
                  <table className="mt-2 w-full max-w-2xl text-sm">
                    <thead>
                      <tr>
                        <th className="th text-left" scope="col">Sinistre</th>
                        <th className="th text-left" scope="col">Dossier</th>
                        <th className="th text-left" scope="col">Type</th>
                        <th className="th text-right" scope="col">Date de soin</th>
                        <th className="th text-right" scope="col"><span className="sr-only">Action</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {anomalies.patientMismatch.map((row: any) => (
                        <tr key={row.dossierId}>
                          <td className="td font-mono text-xs">{row.reference}</td>
                          <td className="td font-mono text-xs">{row.dossierReference}</td>
                          <td className="td text-xs">{row.kind}</td>
                          <td className="td text-right text-xs">{row.careDate ? fmtDate(row.careDate) : '—'}</td>
                          <td className="td text-right">
                            <button
                              type="button"
                              onClick={() => fixMismatch(row)}
                              disabled={fixing !== null}
                              aria-label={`Détacher le dossier ${row.dossierReference} du sinistre ${row.reference}`}
                              className="rounded bg-rose-600 px-2 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                            >
                              {fixing === row.dossierId ? 'Correction…' : 'Corriger'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {fixError && (
                <p role="alert" className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-700">{fixError}</p>
              )}
              <p className="text-xs text-slate-500">
                Correction depuis l'écran « Instruction dossiers » : rattacher un dossier (sans dossier) ou détacher/rattacher le bon dossier (incohérence). Le watchdog quotidien alerte aussi les gestionnaires sur chaque anomalie.
              </p>
            </div>
          );
        })()}
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

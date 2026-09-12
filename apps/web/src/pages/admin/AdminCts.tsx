import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, ratioPct } from '../../format';
import { Spinner } from '../../components/ui';
import { BandBadge } from '../../components/CtsCards';

export default function AdminCts() {
  const [data, setData] = useState<any>(null);
  const [fund, setFund] = useState<any>(null);
  const [covering, setCovering] = useState<string | null>(null);
  const [coverMsg, setCoverMsg] = useState<string | null>(null);

  const load = () => {
    api.get('/admin/cts/portfolio').then(setData).catch(() => setData({ error: true }));
    api.get('/admin/solidarity/fund').then(setFund).catch(() => setFund({ error: true }));
  };

  useEffect(load, []);

  if (!data) return <Spinner />;
  if (data.error) return <div className="card-p text-sm text-red-700">Portefeuille indisponible.</div>;

  const cover = async (contractId: string, number: string) => {
    setCovering(contractId);
    setCoverMsg(null);
    try {
      const r = await api.post(`/admin/contracts/${contractId}/solidarity-cover`, {});
      setCoverMsg(r.covered > 0
        ? `Fonds de solidarité : ${fcfa(r.covered)} couverts sur le contrat ${number}.`
        : `Aucune couverture (${r.reason ?? 'fonds insuffisant'}).`);
      load();
    } catch (e: any) {
      setCoverMsg(e?.message ?? 'Couverture impossible');
    } finally {
      setCovering(null);
    }
  };

  const t = data.totals;
  const cards: [string, string][] = [
    ['Primes encaissées', fcfa(t.collected)],
    ['Frais de gestion', fcfa(t.fees)],
    ['Budget prestations', fcfa(t.budget)],
    ['Consommé', fcfa(t.consumed)],
    ['Engagé', fcfa(t.committed)],
    ['Disponible', fcfa(t.available)],
    ['Résultat provisoire', fcfa(t.result)],
    ['Sinistralité (S/P)', ratioPct(t.lossRatio)],
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Comptes techniques — portefeuille ({t.contracts} contrats)</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="card-p">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {t.deficit > 0 && (
        <div className="card-p border-red-200">
          <p className="text-sm font-medium text-red-700">Déficit cumulé : {fcfa(t.deficit)} (jamais facturé automatiquement)</p>
        </div>
      )}

      {fund && !fund.error && (
        <div className="card-p border-emerald-200">
          <h2 className="font-semibold mb-2">🤝 Fonds de solidarité mutualiste</h2>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><p className="text-xs text-slate-400">Solde du fonds</p><p className="font-bold text-emerald-700">{fcfa(fund.balance)}</p></div>
            <div><p className="text-xs text-slate-400">Ratio de solidarité</p><p className="font-semibold">{ratioPct(fund.solidarityRatio)}</p></div>
            <div><p className="text-xs text-slate-400">Total couvert</p><p className="font-semibold">{fcfa(fund.totalCovered)}</p></div>
            <div><p className="text-xs text-slate-400">Part des excédents</p><p className="font-semibold">{Math.round((fund.config?.surplusShare ?? 0) * 100)} %</p></div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Les excédents de clôture alimentent le fonds, qui couvre les déficits des contrats en difficulté.
            Appels individuels plafonnés au minimum entre {fcfa(fund.config?.individualFundCallCap)} et une prime annuelle · couverture max {fcfa(fund.config?.maxCoveragePerContract)}/contrat. Statut : {fund.fundStatus}.
          </p>
          {coverMsg && <p className="mt-2 text-sm font-medium text-brand-700">{coverMsg}</p>}
        </div>
      )}

      <div className="card-p">
        <h2 className="font-semibold mb-2">Contrats critiques ({data.critical.length})</h2>
        {data.critical.length === 0 ? (
          <p className="text-sm text-slate-400">Aucun contrat en bande critique ou épuisée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className="th text-left">Contrat</th><th className="th text-left">Produit</th><th className="th text-left">Entreprise</th><th className="th text-left">Bande</th><th className="th text-right">Disponible</th><th className="th text-right">Déficit</th><th className="th text-right">Solidarité</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {data.critical.map((c: any) => (
                  <tr key={c.contractId}>
                    <td className="td font-mono text-xs">{c.number}</td>
                    <td className="td">{c.product ?? '—'}</td>
                    <td className="td">{c.company ?? '—'}</td>
                    <td className="td"><BandBadge band={c.band} /></td>
                    <td className="td text-right font-medium">{fcfa(c.available)}</td>
                    <td className="td text-right">{c.deficit > 0 ? fcfa(c.deficit) : '—'}</td>
                    <td className="td text-right">
                      {c.deficit > 0 && (
                        <button
                          className="btn-outline btn-sm"
                          disabled={covering === c.contractId}
                          onClick={() => cover(c.contractId, c.number)}
                        >
                          {covering === c.contractId ? '…' : 'Couvrir'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-p">
          <h2 className="font-semibold mb-2">Appels de fonds ouverts ({data.openFundCalls.length})</h2>
          {data.openFundCalls.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.openFundCalls.map((f: any) => (
                <li key={f.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="font-mono text-xs text-slate-500">{f.contract?.number ?? ''}</span>
                  <span className="ml-auto font-semibold">{fcfa(f.chosenAmount)}</span>
                  <span className="badge bg-amber-100 text-amber-800">{f.status}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-400">Payés : {data.fundCallsPaid} · Déclenchements stop-loss : {data.stopLossTriggers}</p>
        </div>
        <div className="card-p">
          <h2 className="font-semibold mb-2">Alertes par type</h2>
          {data.alertsByType.length === 0 ? (
            <p className="text-sm text-slate-400">Aucune.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.alertsByType.map((a: any, i: number) => (
                <li key={i} className="flex items-center gap-2 py-2 text-sm">
                  <span className="font-medium">{a.type}</span>
                  <span className="text-xs text-slate-400">{a.status}</span>
                  <span className="ml-auto font-semibold">{a._count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400">Pilotage technique recalculé — le résultat affiché est provisoire, pas un résultat comptable définitif.</p>
    </div>
  );
}

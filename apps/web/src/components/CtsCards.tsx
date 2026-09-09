import { fcfa, fmtDate, ctsBandLabel, ctsBandStyle, ratioPct, statusLabel } from '../format';

/** Pastille de bande CTS (§14). */
export function BandBadge({ band }: { band: string }) {
  return <span className={`badge ${ctsBandStyle(band)}`}>{ctsBandLabel(band)}</span>;
}

/** Grille PRIME / FRAIS / BUDGET / CONSOMMÉ / ENGAGÉ / DISPONIBLE / RATIO / RÉSULTAT (§29). */
export function CtsSummary({ account, band }: { account: any; band: string }) {
  if (!account) return <p className="text-sm text-slate-400">Compte technique en cours d'initialisation…</p>;
  const cells: [string, string][] = [
    ['Prime encaissée', fcfa(account.primeCollected)],
    ['Frais de gestion', fcfa(account.managementFees)],
    ['Budget prestations', fcfa(account.benefitBudget)],
    ['Consommé', fcfa(account.consumed)],
    ['Engagé', fcfa(account.committed)],
    ['Disponible', fcfa(account.available)],
    ['Ratio conso', ratioPct(account.consumptionRatio)],
    ['Résultat provisoire', fcfa(account.provisionalResult)],
  ];
  return (
    <div>
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">Compte technique santé</h3>
        <BandBadge band={band} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {cells.map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-slate-400">{label}</p>
            <p className="font-semibold">{value}</p>
          </div>
        ))}
      </div>
      {account.deficit > 0 && (
        <p className="mt-2 text-sm font-medium text-red-700">Déficit constaté : {fcfa(account.deficit)} (non facturé automatiquement)</p>
      )}
      {account.renewalCredit > 0 && (
        <p className="mt-1 text-sm text-slate-500">Crédit de renouvellement acquis : {fcfa(account.renewalCredit)} (bonus contractuel, non retirable)</p>
      )}
      <p className="mt-2 text-xs text-slate-400">Le résultat technique est un indicateur de pilotage, pas un résultat comptable définitif.</p>
    </div>
  );
}

/** Appels de fonds en cours (§16). */
export function FundCallList({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <div className="card-p">
      <h3 className="font-semibold mb-2">Appels de fonds en cours</h3>
      <ul className="divide-y divide-slate-100">
        {items.map((f: any) => (
          <li key={f.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="font-mono text-xs text-slate-500">{f.invoiceNumber ?? '—'}</span>
            <span className="font-semibold">{fcfa(f.chosenAmount)}</span>
            <span className="badge bg-amber-100 text-amber-800">{statusLabel(f.status)}</span>
            {f.dueDate && <span className="ml-auto text-xs text-slate-400">Échéance : {fmtDate(f.dueDate)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Alertes ouvertes (§15). */
export function CtsAlertList({ items }: { items: any[] }) {
  if (!items?.length) return null;
  return (
    <div className="card-p border-orange-200">
      <h3 className="font-semibold mb-2">Alertes</h3>
      <ul className="space-y-1.5 text-sm">
        {items.map((a: any) => (
          <li key={a.id} className="flex items-center gap-2">
            <span className={`badge ${a.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : a.severity === 'WARNING' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-600'}`}>
              {a.type}
            </span>
            <span className="text-xs text-slate-400">{fmtDate(a.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

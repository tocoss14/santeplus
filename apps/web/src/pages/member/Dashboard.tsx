import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { fcfa, fmtDate } from '../../format';
import { Badge, EmptyState, Spinner, StatCard, StatusBadge } from '../../components/ui';

export default function MemberDashboard() {
  const [contracts, setContracts] = useState<any[] | null>(null);
  const [claims, setClaims] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      api.get<any[]>('/contracts/mine'),
      api.get<any[]>('/claims/mine'),
      api.get<any[]>('/providers?near=6.37,2.42'),
    ])
      .then(([c, cl, p]) => {
        setContracts(c);
        setClaims(cl.slice(0, 4));
        setProviders(p.slice(0, 3));
      })
      .catch(() => setContracts([]));
  }, []);

  if (!contracts) return <Spinner />;
  const active = contracts.find(c => ['ACTIVE', 'SUSPENDED'].includes(c.status));
  const pendingPayment = contracts.find(c => c.status === 'PENDING_PAYMENT');

  const daysLeft = active?.endDate
    ? Math.ceil((new Date(active.endDate).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Bonjour 👋</h1>
        <Link to="/app/remboursements/nouveau" className="btn-primary btn-sm">＋ Déclarer une dépense</Link>
      </div>

      {pendingPayment && (
        <Link to="/app/contrat" className="block card-p border-amber-300 bg-amber-50 hover:bg-amber-100 transition">
          <p className="font-semibold text-amber-800">⏳ Votre souscription attend son paiement</p>
          <p className="text-sm text-amber-700">Réglez votre cotisation pour activer votre couverture et recevoir votre carte.</p>
        </Link>
      )}

      {!active && !pendingPayment && (
        <div className="card-p bg-gradient-to-br from-brand-600 to-brand-700 text-white border-brand-600 text-center">
          <h2 className="text-lg font-bold">Vous n’avez pas encore de couverture santé</h2>
          <p className="mt-1 text-brand-100 text-sm">Souscrivez en moins de 5 minutes.</p>
          <Link to="/app/souscrire" className="btn mt-4 bg-white text-brand-800 px-6">Choisir ma formule</Link>
        </div>
      )}

      {active && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Contrat" value={<span className="text-base">{active.number}</span>} sub={active.product.name} accent />
            <StatCard label="Validité" value={`${fmtDate(active.startDate)} → ${fmtDate(active.endDate)}`} sub={daysLeft != null ? `${daysLeft} jours restants` : undefined} />
            <StatCard label="Statut" value={<StatusBadge status={active.status} />} sub={`${active._count.beneficiaries} ayant(s) droit`} />
          </div>

          {daysLeft != null && daysLeft <= 30 && (
            <div className="card-p border-orange-200 bg-orange-50">
              <p className="font-medium text-orange-800">⚠️ Votre contrat expire dans {daysLeft} jours.</p>
              <button
                className="btn-primary btn-sm mt-3"
                onClick={async () => {
                  await api.post(`/contracts/${active.id}/renew`);
                  window.location.reload();
                }}
              >
                Renouveler maintenant
              </button>
            </div>
          )}
        </>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <div className="card-p">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Dernières demandes</h2>
            <Link to="/app/remboursements" className="text-xs font-semibold text-brand-700 hover:underline">Tout voir</Link>
          </div>
          {claims.length === 0 ? (
            <EmptyState icon="🧾" title="Aucune demande" hint="Déclarez une dépense médicale pour vous faire rembourser." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {claims.map(c => (
                <li key={c.id}>
                  <Link to={`/app/remboursements/${c.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50 rounded-lg px-1 -mx-1">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.reference}</p>
                      <p className="text-xs text-slate-400">{fmtDate(c.careDate)} · {fcfa(c.totalRequested)}</p>
                    </div>
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card-p">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Établissements proches (Cotonou)</h2>
            <Link to="/app/prestataires" className="text-xs font-semibold text-brand-700 hover:underline">Annuaire</Link>
          </div>
          <ul className="space-y-2">
            {providers.map(p => (
              <li key={p.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-2.5">
                <span className="text-xl">🏥</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-slate-400">{p.city}{p.distanceKm != null ? ` · ${p.distanceKm} km` : ''}</p>
                </div>
                {p.thirdPartyPayer && <Badge tone="bg-emerald-100 text-emerald-700">Tiers payant</Badge>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {active && (
        <div className="card-p flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900 text-white border-slate-900">
          <div>
            <p className="font-semibold">Votre carte d’assuré numérique</p>
            <p className="text-sm text-slate-300">Présentez le QR code chez un prestataire partenaire</p>
          </div>
          <Link to="/app/carte" className="btn bg-white text-slate-900">Voir ma carte</Link>
        </div>
      )}
    </div>
  );
}

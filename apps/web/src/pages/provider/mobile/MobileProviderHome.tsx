import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import { fcfa, fmtDate, statusLabel } from '../../../format';
import { StatusBadge, Spinner } from '../../../components/ui';

function qs(obj: Record<string, any>) {
  return new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v != null)).toString();
}

export default function MobileProviderHome() {
  const [stats, setStats] = useState<any>(null);
  const [pendingTp, setPendingTp] = useState<any[]>([]);
  const [recentFactures, setRecentFactures] = useState<any[]>([]);

  useEffect(() => {
    api.get('/provider/me/stats').then(setStats).catch(() => {});
    api.get(`/provider/me/third-party?${qs({ status: 'PENDING', limit: 5 })}`).then(r => setPendingTp(r.items ?? r)).catch(() => {});
    api.get(`/provider/me/batch-invoices?${qs({ limit: 5 })}`).then(r => setRecentFactures(r.items ?? r)).catch(() => {});
  }, []);

  if (!stats) return <Spinner />;

  const statColor = (color: string) => ({
    amber: 'bg-amber-50 border-amber-200',
    emerald: 'bg-emerald-50 border-emerald-200',
    brand: 'bg-brand-50 border-brand-200',
    blue: 'bg-blue-50 border-blue-200',
  }[color] ?? 'bg-slate-50 border-slate-200');

  const StatBox = ({ label, value, icon, color }: { label: string; value: React.ReactNode; icon: string; color: string }) => (
    <div className={`card-p ${statColor(color)}`}>
      <div className="flex items-center gap-2">
        <span className="text-2xl">{icon}</span>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      </div>
      <p className="mt-1.5 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );

  return (
    <div className="px-4 space-y-4">
      {/* Stats principales */}
      <div className="grid grid-cols-2 gap-3">
        <StatBox label="En attente" value={pendingTp.length} icon="⏳" color="amber" />
        <StatBox label="Approuvés aujourd'hui" value={stats.approvedToday ?? 0} icon="✅" color="emerald" />
        <StatBox label="Montant validé" value={fcfa(stats.approvedAmount ?? 0)} icon="💰" color="brand" />
        <StatBox label="Factures en cours" value={stats.openInvoices ?? 0} icon="📄" color="blue" />
      </div>

      {/* Tiers payant en attente */}
      {pendingTp.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Tiers payant en attente</h2>
            <Link to="/prestataire/mobile/tp" className="text-xs text-brand-600 font-medium">Voir tout →</Link>
          </div>
          <div className="space-y-2">
            {pendingTp.slice(0, 3).map((tp: any) => (
              <Link key={tp.id} to={`/prestataire/mobile/tp/${tp.id}`} className="card-p flex items-center gap-3 p-3">
                <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center text-xl">💊</div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{tp.patientName ?? 'Patient'}</p>
                  <p className="text-xs text-slate-500">{tp.actName ?? 'Acte'} · {fcfa(tp.amount)}</p>
                </div>
                <StatusBadge status={tp.status} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Factures récentes */}
      {recentFactures.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Factures groupées récentes</h2>
            <Link to="/prestataire/mobile/factures" className="text-xs text-brand-600 font-medium">Voir tout →</Link>
          </div>
          <div className="space-y-2">
            {recentFactures.slice(0, 3).map((f: any) => (
              <Link key={f.id} to={`/prestataire/mobile/factures/${f.id}`} className="card-p p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{f.number}</p>
                    <p className="text-xs text-slate-500">{fmtDate(f.periodStart)} - {fmtDate(f.periodEnd)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{fcfa(f.totalApproved)}</p>
                    <StatusBadge status={f.status} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Actions rapides */}
      <section className="space-y-2 pt-2">
        <h2 className="font-semibold">Actions rapides</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/prestataire/mobile/scan" className="card-p p-4 text-center bg-brand-50 border-brand-200">
            <div className="text-3xl mb-1">📷</div>
            <p className="font-medium text-brand-800">Scanner QR</p>
            <p className="text-xs text-slate-500">Ordonnance / Carte</p>
          </Link>
          <Link to="/prestataire/mobile/tp/new" className="card-p p-4 text-center">
            <div className="text-3xl mb-1">➕</div>
            <p className="font-medium">Nouveau TP</p>
            <p className="text-xs text-slate-500">Créer tiers payant</p>
          </Link>
          <Link to="/prestataire/mobile/factures/new" className="card-p p-4 text-center">
            <div className="text-3xl mb-1">📄</div>
            <p className="font-medium">Nouvelle facture</p>
            <p className="text-xs text-slate-500">Générer batch</p>
          </Link>
          <Link to="/prestataire/mobile/sync" className="card-p p-4 text-center">
            <div className="text-3xl mb-1">🔄</div>
            <p className="font-medium">Synchroniser</p>
            <p className="text-xs text-slate-500">Sync hors-ligne</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
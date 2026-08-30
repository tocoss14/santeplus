import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate, statusLabel, statusStyle } from '../../format';
import { Badge, Spinner, StatCard } from '../../components/ui';

const LEVEL_BADGES: Record<string, string> = {
  AMBASSADOR: 'bg-sky-100 text-sky-800',
  COMMERCIAL: 'bg-brand-100 text-brand-800',
  DISTRIBUTOR: 'bg-purple-100 text-purple-800',
  INSTITUTIONAL: 'bg-amber-100 text-amber-800',
};

const LEVEL_LABELS: Record<string, string> = {
  AMBASSADOR: 'Ambassadeur',
  COMMERCIAL: 'Commercial',
  DISTRIBUTOR: 'Sous-distributeur',
  INSTITUTIONAL: 'Institutionnel',
};

const TYPE_LABELS: Record<string, string> = {
  NEW_BUSINESS: 'Nouvelle souscription',
  RENEWAL: 'Renouvellement',
  OVERRIDE: 'Override équipe',
  BONUS: 'Bonus performance',
};

export default function DistributorDashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [commissions, setCommissions] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'overview' | 'commissions' | 'share'>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/distributor/me').catch(() => null),
      api.get('/distributor/me/stats').catch(() => null),
      api.get('/distributor/me/commissions').catch(() => []),
    ]).then(([p, s, c]) => {
      setProfile(p);
      setStats(s);
      setCommissions(c);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;

  if (!profile) {
    return (
      <div className="space-y-4">
        <div className="card-p text-center py-12">
          <p className="text-4xl">🤝</p>
          <h1 className="mt-3 font-display text-xl font-bold">Espace Distributeur</h1>
          <p className="mt-2 text-sm text-stone">Vous n'avez pas encore de profil distributeur.</p>
          <p className="mt-1 text-sm text-stone">Contactez l'administrateur pour obtenir votre accès.</p>
        </div>
      </div>
    );
  }

  const referralUrl = `${window.location.origin}/r/${profile.referralCode}`;
  const referralLink = `santeplus.bj/r/${profile.referralCode}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const shareOnWhatsApp = () => {
    const msg = encodeURIComponent(
      `🏥 Je vous recommande SantéPlus, la mutuelle santé digitale du Bénin !\n\n` +
      `✅ Souscription en ligne en 5 minutes\n` +
      `✅ Paiement par mobile money\n` +
      `✅ Carte d'assuré numérique instantanée\n\n` +
      `📋 Mon lien d'inscription : ${referralUrl}\n\n` +
      `Utilisez ce code : ${profile.referralCode}`
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold mr-auto">Mon Espace Distributeur</h1>
        <Badge tone={LEVEL_BADGES[profile.level] ?? 'bg-slate-100 text-slate-700'}>
          {LEVEL_LABELS[profile.level] ?? profile.level}
        </Badge>
        <Badge tone={profile.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
          {statusLabel(profile.status)}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {[
          { key: 'overview' as const, label: 'Vue d\'ensemble' },
          { key: 'commissions' as const, label: `Commissions (${commissions.length})` },
          { key: 'share' as const, label: 'Partager mon lien' },
        ].map(t => (
          <button
            key={t.key}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${tab === t.key ? 'bg-white shadow text-brand-700' : 'text-slate-600 hover:text-slate-800'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <>
          {/* KPI Cards */}
          {stats && (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard label="Recrutés" value={stats.totalRecruited} sub="assurés parrainés" />
              <StatCard label="Contrats actifs" value={stats.contractCount} sub="liés à vous" />
              <StatCard label="Commissions totales" value={fcfa(stats.totalCommissions)} sub={`${stats.totalCommissionCount} commission(s)`} accent />
              <StatCard label="En attente" value={fcfa(stats.pendingCommissions)} sub={`${stats.paidCommissions > 0 ? fcfa(stats.paidCommissions) + ' payées' : 'Aucune payée'}`} />
            </div>
          )}

          {/* Referral Code Card */}
          <div className="card-p">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Votre code de parrainage</p>
              {profile.territory && <Badge>{profile.territory}</Badge>}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <span className="font-mono text-3xl font-bold tracking-[0.2em] text-brand-700">
                {profile.referralCode}
              </span>
              <button
                onClick={() => copyToClipboard(profile.referralCode)}
                className="rounded-full border border-mist px-3 py-1.5 text-xs font-bold hover:bg-sand transition"
              >
                {copied ? '✅ Copié !' : '📋 Copier'}
              </button>
            </div>
            <p className="mt-2 text-xs text-stone">
              Partagez ce code ou votre lien pour recruter de nouveaux assurés.
            </p>
          </div>

          {/* Commission Summary */}
          {commissions.length > 0 && (
            <div className="card-p">
              <p className="text-sm font-semibold text-slate-700">Dernières commissions</p>
              <div className="mt-3 divide-y divide-mist">
                {commissions.slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{TYPE_LABELS[c.type] ?? c.type}</p>
                      <p className="text-xs text-stone">
                        {c.contract?.number ?? '—'} · {fmtDate(c.createdAt)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-sm font-bold text-ink">{fcfa(c.amount)}</p>
                      <Badge tone={statusStyle(c.status)}>{statusLabel(c.status)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
              {commissions.length > 5 && (
                <button onClick={() => setTab('commissions')} className="mt-3 w-full text-center text-xs font-bold text-brand-700 hover:underline">
                  Voir tout ({commissions.length} commissions) →
                </button>
              )}
            </div>
          )}

          {/* Team info */}
          {profile.children && profile.children.length > 0 && (
            <div className="card-p">
              <p className="text-sm font-semibold text-slate-700">Mon équipe ({profile.children.length})</p>
              <div className="mt-3 divide-y divide-mist">
                {profile.children.map((child: any) => (
                  <div key={child.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium">{child.user.firstName} {child.user.lastName}</p>
                      <p className="text-xs text-stone">{LEVEL_LABELS[child.level] ?? child.level}</p>
                    </div>
                    <Badge tone={child.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}>
                      {statusLabel(child.status)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* COMMISSIONS TAB */}
      {tab === 'commissions' && (
        <div className="card-p">
          {commissions.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-3xl">💰</p>
              <p className="mt-2 text-sm text-stone">Aucune commission pour le moment.</p>
              <p className="text-xs text-stone">Les commissions sont générées automatiquement quand vos recrutés souscrivent.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Type</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Contrat</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400 text-right">Base</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400 text-right">Taux</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400 text-right">Commission</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Statut</th>
                    <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-400">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mist">
                  {commissions.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-xs font-medium">{TYPE_LABELS[c.type] ?? c.type}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{c.contract?.number ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{fcfa(c.baseAmount)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs">{c.rate}%</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs font-bold">{fcfa(c.amount)}</td>
                      <td className="px-3 py-2.5"><Badge tone={statusStyle(c.status)}>{statusLabel(c.status)}</Badge></td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SHARE TAB */}
      {tab === 'share' && (
        <div className="space-y-4">
          {/* Referral Link Card */}
          <div className="card-p">
            <p className="text-sm font-semibold text-slate-700">Votre lien d'inscription</p>
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-mist bg-sand p-3">
              <span className="flex-1 truncate font-mono text-sm text-ink">{referralUrl}</span>
              <button
                onClick={() => copyToClipboard(referralUrl)}
                className="shrink-0 rounded-full bg-brand-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-700 transition"
              >
                {copied ? '✅ Copié !' : '📋 Copier'}
              </button>
            </div>
            <p className="mt-2 text-xs text-stone">
              Partagez ce lien par WhatsApp, SMS ou réseaux sociaux.
            </p>
          </div>

          {/* Quick Share Buttons */}
          <div className="card-p">
            <p className="text-sm font-semibold text-slate-700">Partage rapide</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                onClick={shareOnWhatsApp}
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center transition hover:bg-emerald-100"
              >
                <p className="text-2xl">💬</p>
                <p className="mt-1 text-sm font-bold text-emerald-700">WhatsApp</p>
              </button>
              <button
                onClick={() => {
                  const msg = encodeURIComponent(
                    `🏥 SantéPlus - Mutuelle santé digitale Bénin\nCode parrainage : ${profile.referralCode}\nLien : ${referralUrl}`
                  );
                  window.open(`sms:?body=${msg}`, '_blank');
                }}
                className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center transition hover:bg-blue-100"
              >
                <p className="text-2xl">📱</p>
                <p className="mt-1 text-sm font-bold text-blue-700">SMS</p>
              </button>
              <button
                onClick={() => copyToClipboard(`🏥 SantéPlus - Mutuelle santé digitale Bénin\nCode : ${profile.referralCode}\nLien : ${referralUrl}`)}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center transition hover:bg-slate-100 col-span-2"
              >
                <p className="text-2xl">📋</p>
                <p className="mt-1 text-sm font-bold text-slate-700">Copier le message complet</p>
              </button>
            </div>
          </div>

          {/* QR Code hint */}
          <div className="card-p text-center">
            <p className="text-sm text-stone">
              💡 <strong>Astuce :</strong> Imprimez votre code sous forme de QR code pour le distribuer en magasin ou lors d'événements.
            </p>
            <p className="mt-2 font-mono text-2xl font-bold tracking-[0.3em] text-brand-700">{profile.referralCode}</p>
          </div>
        </div>
      )}
    </div>
  );
}

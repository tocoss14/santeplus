import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { fcfa, fmtDate, fmtDateTime, statusLabel, statusStyle } from '../../format';
import { Spinner, StatusBadge } from '../../components/ui';

interface TimelineEvent {
  id: string;
  type: 'consultation' | 'prescription' | 'delivery' | 'care_record';
  date: string;
  reference: string;
  title: string;
  subtitle: string;
  status?: string;
  detail?: string;
  link?: string;
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  consultation: { icon: '🩺', color: 'text-blue-700', bg: 'bg-blue-100' },
  prescription: { icon: '📋', color: 'text-purple-700', bg: 'bg-purple-100' },
  delivery: { icon: '💊', color: 'text-emerald-700', bg: 'bg-emerald-100' },
  care_record: { icon: '📁', color: 'text-slate-700', bg: 'bg-slate-100' },
};

function groupByMonth(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const groups = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    const d = new Date(ev.date);
    const key = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }
  return groups;
}

export default function MyCareTimeline() {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    Promise.all([
      api.get<any[]>('/consultations/mine').catch(() => []),
      api.get<any[]>('/prescriptions/mine').catch(() => []),
      api.get<any[]>('/care-records/mine').catch(() => []),
    ]).then(([consultations, prescriptions, careRecords]) => {
      const all: TimelineEvent[] = [];

      for (const c of consultations) {
        all.push({
          id: `cons-${c.id}`,
          type: 'consultation',
          date: c.careDate || c.createdAt,
          reference: c.reference,
          title: c.motif || 'Consultation',
          subtitle: `${c.provider?.name ?? ''}${c.specialty ? ` — ${c.specialty}` : ''}`,
          detail: c.diagnostic ? `Diagnostic : ${c.diagnostic}` : undefined,
          link: undefined,
        });
      }

      for (const p of prescriptions) {
        all.push({
          id: `pres-${p.id}`,
          type: 'prescription',
          date: p.validFrom || p.createdAt,
          reference: p.number,
          title: `Ordonnance — ${p.lines?.length ?? 0} produit(s)`,
          subtitle: `${p.prescriberName}${p.provider?.name ? ` · ${p.provider.name}` : ''}`,
          status: p.status,
          detail: p.lines?.map((l: any) => l.name).join(', ').slice(0, 80),
        });
      }

      for (const d of careRecords) {
        all.push({
          id: `cr-${d.id}`,
          type: 'care_record',
          date: d.createdAt,
          reference: d.reference,
          title: d.type || 'Dossier de soins',
          subtitle: d.provider?.name ?? '',
          status: d.status,
          link: `/app/soins/${d.id}`,
        });
      }

      all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEvents(all);
    });
  }, []);

  if (!events) return <Spinner />;

  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);
  const grouped = groupByMonth(filtered);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Mes soins</h1>
      <p className="text-sm text-slate-500">
        Historique chronologique de vos consultations, ordonnances et soins.
      </p>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        {[
          ['all', 'Tout', '🗂️'],
          ['consultation', 'Consultations', '🩺'],
          ['prescription', 'Ordonnances', '📋'],
          ['delivery', 'Délivrances', '💊'],
          ['care_record', 'Dossiers', '📁'],
        ].map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === key
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card-p text-center text-sm text-slate-500 py-12">
          <p className="text-3xl mb-2">🩺</p>
          <p>Aucun soin enregistré pour le moment.</p>
          <p className="text-xs text-slate-400 mt-1">Vos consultations et ordonnances apparaîtront ici.</p>
        </div>
      ) : (
        Array.from(grouped.entries()).map(([month, items]) => (
          <div key={month}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 sticky top-0 bg-slate-50 py-1 z-10">
              {month}
            </h2>
            <div className="relative ml-4 border-l-2 border-slate-200 space-y-4 pb-2">
              {items.map(ev => {
                const cfg = TYPE_CONFIG[ev.type] ?? TYPE_CONFIG.care_record;
                const content = (
                  <div className="relative pl-6">
                    {/* Point de la timeline */}
                    <div className={`absolute -left-[1.6rem] top-3 h-3 w-3 rounded-full ${cfg.bg} ring-2 ring-white`} />
                    <div className="card-p hover:border-brand-300 transition">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                          {cfg.icon} {ev.type === 'consultation' ? 'Consultation' : ev.type === 'prescription' ? 'Ordonnance' : ev.type === 'delivery' ? 'Délivrance' : 'Dossier'}
                        </span>
                        <span className="text-xs text-slate-400">{fmtDateTime(ev.date)}</span>
                        {ev.status && <StatusBadge status={ev.status} />}
                      </div>
                      <p className="mt-1.5 font-semibold text-sm">{ev.title}</p>
                      <p className="text-xs text-slate-500">{ev.subtitle}</p>
                      {ev.detail && <p className="mt-1 text-xs text-slate-400 truncate">{ev.detail}</p>}
                      <p className="mt-1 text-[10px] font-mono text-slate-300">{ev.reference}</p>
                    </div>
                  </div>
                );

                return ev.link ? (
                  <Link key={ev.id} to={ev.link} className="block">
                    {content}
                  </Link>
                ) : (
                  <div key={ev.id}>{content}</div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate, fmtDateTime, statusLabel, statusStyle } from '../../format';
import { Spinner, StatusBadge } from '../../components/ui';

type Tab = 'consultations' | 'ordonnances' | 'delivrances';

export default function ProviderActivity() {
  const [tab, setTab] = useState<Tab>('consultations');

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: 'consultations', label: 'Consultations', icon: '🩺' },
    { key: 'ordonnances', label: 'Ordonnances', icon: '📋' },
    { key: 'delivrances', label: 'Délivrances', icon: '💊' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Activité</h1>

      <div className="flex rounded-xl bg-slate-100 p-1 gap-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition ${
              tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'consultations' && <ConsultationsTab />}
      {tab === 'ordonnances' && <PrescriptionsTab />}
      {tab === 'delivrances' && <DeliveriesTab />}
    </div>
  );
}

function ConsultationsTab() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { api.get('/provider/consultations').then(setItems).catch(() => setItems([])); }, []);

  if (!items) return <Spinner />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead><tr>
          <th className="th">Référence</th><th className="th">Patient</th><th className="th">Praticien</th>
          <th className="th">Motif</th><th className="th">Diagnostic</th><th className="th">Date</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {items.map(c => (
            <tr key={c.id}>
              <td className="td font-medium">{c.reference}</td>
              <td className="td text-sm">{c.patientUser?.firstName} {c.patientUser?.lastName}</td>
              <td className="td text-xs">{c.practitionerName}{c.specialty ? ` — ${c.specialty}` : ''}</td>
              <td className="td text-sm">{c.motif}</td>
              <td className="td text-xs text-slate-500">{c.diagnostic ?? '—'}</td>
              <td className="td text-xs">{fmtDateTime(c.careDate)}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={6} className="td py-8 text-center text-slate-400">Aucune consultation</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function PrescriptionsTab() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { api.get('/provider/prescriptions').then(setItems).catch(() => setItems([])); }, []);

  if (!items) return <Spinner />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead><tr>
          <th className="th">Numéro</th><th className="th">Patient</th><th className="th">Produits</th>
          <th className="th">Validité</th><th className="th">Statut</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {items.map(p => (
            <tr key={p.id}>
              <td className="td font-medium font-mono text-xs">{p.number}</td>
              <td className="td text-sm">{p.patientUser?.firstName} {p.patientUser?.lastName}</td>
              <td className="td text-xs">{p.lines?.length ?? 0} ligne(s)</td>
              <td className="td text-xs">{fmtDate(p.validFrom)} → {fmtDate(p.validUntil)}</td>
              <td className="td"><StatusBadge status={p.status} /></td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={5} className="td py-8 text-center text-slate-400">Aucune ordonnance</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function DeliveriesTab() {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { api.get('/provider/deliveries').then(setItems).catch(() => setItems([])); }, []);

  if (!items) return <Spinner />;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead><tr>
          <th className="th">Référence</th><th className="th">Patient</th><th className="th">Ordonnance</th>
          <th className="th">Montant</th><th className="th">Couvert</th><th className="th">Date</th>
        </tr></thead>
        <tbody className="divide-y divide-slate-100">
          {items.map(d => (
            <tr key={d.id}>
              <td className="td font-medium">{d.reference}</td>
              <td className="td text-sm">{d.patientUser?.firstName} {d.patientUser?.lastName}</td>
              <td className="td text-xs">{d.prescription?.number ?? '—'}</td>
              <td className="td text-sm">{fcfa(d.totalAmount)}</td>
              <td className="td text-sm font-medium text-emerald-700">{fcfa(d.coveredAmount)}</td>
              <td className="td text-xs">{fmtDateTime(d.createdAt)}</td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={6} className="td py-8 text-center text-slate-400">Aucune délivrance</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../api';
import { ErrorBanner, Field } from '../../../components/ui';

function todayPlus(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function MobileFactureNewPage() {
  const navigate = useNavigate();
  const [periodStart, setPeriodStart] = useState(todayPlus(-30));
  const [periodEnd, setPeriodEnd] = useState(todayPlus(0));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const invoice = await api.post<{ id: string }>('/provider/batch-invoices', {
        periodStart: new Date(`${periodStart}T00:00:00.000Z`),
        periodEnd: new Date(`${periodEnd}T23:59:59.999Z`),
      });
      navigate(`/prestataire/mobile/factures/${invoice.id}`);
    } catch (err: any) {
      setError(err?.message ?? 'Création impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 space-y-4">
      <Link to="/prestataire/mobile/factures" className="text-sm font-semibold text-brand-700">← Factures</Link>
      <h1 className="font-bold text-lg">Nouvelle facture groupée</h1>
      <p className="text-sm text-slate-500">
        La facture regroupe automatiquement les sinistres tiers-payant approuvés ou payés de votre établissement sur la période.
      </p>
      <form onSubmit={submit} className="card-p space-y-3">
        <ErrorBanner message={error} />
        <Field label="Début de période">
          <input type="date" className="input" value={periodStart} onChange={e => setPeriodStart(e.target.value)} required />
        </Field>
        <Field label="Fin de période">
          <input type="date" className="input" min={periodStart} value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} required />
        </Field>
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Création…' : 'Créer le brouillon'}
        </button>
      </form>
    </div>
  );
}

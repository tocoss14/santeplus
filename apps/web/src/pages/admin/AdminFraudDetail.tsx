import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { fmtDate } from '../../format';
import { ErrorBanner, Field, Spinner, StatusBadge } from '../../components/ui';

const TRANSITIONS: Record<string, Array<{ status: string; label: string }>> = {
  OPEN: [
    { status: 'REVIEWING', label: 'Passer en investigation' },
    { status: 'DISMISSED', label: 'Classer sans suite' },
  ],
  REVIEWING: [
    { status: 'CONFIRMED', label: 'Confirmer la fraude' },
    { status: 'DISMISSED', label: 'Classer sans suite' },
    { status: 'OPEN', label: 'Rouvrir' },
  ],
  CONFIRMED: [{ status: 'OPEN', label: 'Rouvrir' }],
  DISMISSED: [{ status: 'OPEN', label: 'Rouvrir' }],
};

export default function AdminFraudDetail() {
  const { id = '' } = useParams();
  const [fraudCase, setFraudCase] = useState<any>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/admin/fraud/${id}`).then(setFraudCase).catch((err: any) => {
      setError(err?.message ?? 'Dossier introuvable');
    });
  }, [id]);

  const review = async (status: string) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.post(`/admin/fraud/${id}/review`, {
        status,
        note: note.trim() || undefined,
      });
      setFraudCase(updated);
      setNote('');
    } catch (err: any) {
      setError(err?.message ?? 'Action impossible');
    } finally {
      setBusy(false);
    }
  };

  if (!fraudCase && !error) return <Spinner />;
  if (!fraudCase) {
    return (
      <div className="space-y-3">
        <Link to="/admin/fraud" className="text-sm font-semibold text-brand-700">← Dossiers fraude</Link>
        <ErrorBanner message={error} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/admin/fraud" className="text-sm font-semibold text-brand-700">← Dossiers fraude</Link>
      <ErrorBanner message={error} />

      <div className="card-p space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-bold font-mono">{fraudCase.caseNumber}</h1>
          <StatusBadge status={fraudCase.status} />
          <span className="ml-auto text-xs text-slate-400">Créé le {fmtDate(fraudCase.createdAt)}</span>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div><p className="text-xs text-slate-400">Type</p><p className="font-semibold">{fraudCase.kind}</p></div>
          <div>
            <p className="text-xs text-slate-400">Contrat</p>
            <p className="font-semibold">{fraudCase.contract?.number ?? '—'}</p>
            <p className="text-xs text-slate-500">{fraudCase.contract?.holder ?? ''}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Prestataire</p>
            <p className="font-semibold">{fraudCase.provider?.name ?? '—'}</p>
          </div>
        </div>
        {fraudCase.note && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{fraudCase.note}</p>
        )}
        {fraudCase.linkedAuditIds?.length > 0 && (
          <div>
            <p className="text-xs text-slate-400">Alertes d’audit liées</p>
            <ul className="mt-1 list-disc pl-5 font-mono text-xs text-slate-600">
              {fraudCase.linkedAuditIds.map((auditId: string) => <li key={auditId}>{auditId}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="card-p space-y-3">
        <h2 className="font-semibold">Instruction</h2>
        <Field label="Note d’instruction">
          <input
            className="input"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Constat, vérification effectuée, décision…"
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          {(TRANSITIONS[fraudCase.status] ?? []).map(action => (
            <button key={action.status} className="btn-primary btn-sm" disabled={busy} onClick={() => review(action.status)}>
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

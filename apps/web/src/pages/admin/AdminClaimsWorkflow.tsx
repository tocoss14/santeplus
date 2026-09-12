import { useEffect, useState } from 'react';
import { api, fileUrl } from '../../api';
import { fcfa, fmtDate } from '../../format';
import { ErrorBanner, Field, Spinner, StatusBadge } from '../../components/ui';

export const WORKFLOW_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'INFO_REQUESTED',
  'AUTH_REQUIRED',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'PAID',
  'REJECTED',
  'CANCELLED',
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

const STAGE_LABELS = ['Brouillon', 'Soumis', 'Instruction', 'Décision', 'Paiement'] as const;

export function claimWorkflowStage(status: string): { stage: number; label: string; terminal: boolean } {
  switch (status) {
    case 'DRAFT':
      return { stage: 0, label: STAGE_LABELS[0], terminal: false };
    case 'SUBMITTED':
      return { stage: 1, label: STAGE_LABELS[1], terminal: false };
    case 'UNDER_REVIEW':
    case 'INFO_REQUESTED':
      return { stage: 2, label: STAGE_LABELS[2], terminal: false };
    case 'AUTH_REQUIRED':
    case 'APPROVED':
    case 'PARTIALLY_APPROVED':
      return { stage: 3, label: STAGE_LABELS[3], terminal: false };
    case 'PAID':
      return { stage: 4, label: STAGE_LABELS[4], terminal: true };
    case 'REJECTED':
      return { stage: 3, label: 'Rejeté', terminal: true };
    case 'CANCELLED':
      return { stage: 1, label: 'Annulé', terminal: true };
    default:
      return { stage: 0, label: status, terminal: false };
  }
}

function qs(obj: Record<string, any>) {
  return new URLSearchParams(
    Object.entries(obj).filter(([, value]) => value !== '' && value != null) as Array<[string, string]>,
  ).toString();
}

export default function AdminClaimsWorkflow() {
  const [data, setData] = useState<{ items: any[]; total: number; page: number; pages: number } | null>(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [status, q]);

  useEffect(() => {
    api
      .get(`/admin/claims?${qs({ status: status || undefined, q: q || undefined, page })}`)
      .then(setData)
      .catch((err: any) => setError(err?.message ?? 'Chargement impossible'));
  }, [status, q, page]);

  const open = async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setNote('');
    setError(null);
    try {
      setDetail(await api.get(`/claims/${id}`));
    } catch (err: any) {
      setError(err?.message ?? 'Dossier introuvable');
    }
  };

  const reloadList = async () => {
    const refreshed = await api.get(`/admin/claims?${qs({ status: status || undefined, q: q || undefined, page })}`);
    setData(refreshed);
  };

  const act = async (endpoint: string, body: Record<string, unknown> = {}) => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/claims/${selectedId}/${endpoint}`, body);
      await reloadList();
      setDetail(await api.get(`/claims/${selectedId}`));
    } catch (err: any) {
      setError(err?.message ?? 'Action impossible');
    } finally {
      setBusy(false);
    }
  };

  const stage = detail ? claimWorkflowStage(detail.status) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-xl font-bold">Dossiers instruction ({data?.total ?? '…'})</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-64"
            placeholder="Recherche (référence, assuré…)"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <select className="input w-48" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Tous statuts</option>
            {WORKFLOW_STATUSES.map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1 card-p space-y-2 max-h-[70vh] overflow-auto">
          {!data ? (
            <Spinner />
          ) : data.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Aucun dossier pour ces critères.</p>
          ) : (
            data.items.map(claim => (
              <button
                key={claim.id}
                onClick={() => open(claim.id)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  selectedId === claim.id ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold">{claim.reference}</span>
                  <StatusBadge status={claim.status} />
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {claim.claimantUser?.firstName} {claim.claimantUser?.lastName} · {fcfa(claim.totalRequested ?? 0)}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-2">
          {!selectedId ? (
            <div className="card-p text-sm text-slate-500">Sélectionnez un dossier pour voir le détail et les actions possibles.</div>
          ) : !detail ? (
            <div className="card-p"><Spinner /></div>
          ) : (
            <div className="card-p space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold">{detail.reference}</h2>
                  <p className="text-sm text-slate-500">
                    {detail.claimantUser?.firstName} {detail.claimantUser?.lastName} · Contrat {detail.contract?.number}
                  </p>
                </div>
                <StatusBadge status={detail.status} />
              </div>

              {stage && (
                <div className="flex flex-wrap items-center gap-1" aria-label={`Étape : ${stage.label}`}>
                  {STAGE_LABELS.map((label, index) => (
                    <span
                      key={label}
                      aria-current={index === stage.stage ? 'step' : undefined}
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        index === stage.stage
                          ? 'bg-brand-100 text-brand-800'
                          : index < stage.stage
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              )}

              <div className="border-t pt-4">
                <h3 className="font-semibold">Pièces ({detail.documents?.length ?? 0})</h3>
                {(detail.documents ?? []).length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">Aucune pièce jointe sur ce dossier.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100">
                    {detail.documents.map((doc: any) => (
                      <li key={doc.id} className="flex items-center gap-2 py-2 text-sm">
                        <a href={fileUrl(doc.fileId)} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                          {doc.fileName}
                        </a>
                        <span className="text-xs text-slate-400">({doc.docType})</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-xs text-slate-400">
                  Les pièces sont ajoutées lors de la déclaration initiale ; l’ajout ultérieur reste à implémenter côté API.
                </p>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold">Actions</h3>
                <Field label="Note ou motif (requis pour certaines actions)">
                  <input
                    className="input"
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Précisez le motif ou le commentaire transmis à l’assuré"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {['SUBMITTED', 'INFO_REQUESTED'].includes(detail.status) && (
                    <button className="btn-primary btn-sm" disabled={busy} onClick={() => act('under-review')}>Passer en instruction</button>
                  )}
                  {['SUBMITTED', 'UNDER_REVIEW'].includes(detail.status) && (
                    <button
                      className="btn-outline btn-sm"
                      disabled={busy || note.trim().length < 3}
                      onClick={() => act('request-info', { note: note.trim() })}
                    >
                      Demander des informations
                    </button>
                  )}
                  {['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED'].includes(detail.status) && (
                    <>
                      <button
                        className="btn-primary btn-sm"
                        disabled={busy}
                        onClick={() => act('approve', note.trim() ? { note: note.trim() } : {})}
                      >
                        Approuver
                      </button>
                      <button
                        className="btn-outline btn-sm"
                        disabled={busy || note.trim().length < 3}
                        onClick={() => act('reject', { reason: note.trim() })}
                      >
                        Rejeter
                      </button>
                    </>
                  )}
                  {detail.status === 'AUTH_REQUIRED' && (
                    <button
                      className="btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => act('authorize', note.trim() ? { note: note.trim() } : {})}
                    >
                      Autoriser le tiers payant
                    </button>
                  )}
                  {['APPROVED', 'PARTIALLY_APPROVED'].includes(detail.status) && (
                    <button
                      className="btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => act('mark-paid', note.trim() ? { paidRef: note.trim() } : {})}
                    >
                      Marquer payé
                    </button>
                  )}
                </div>
                {stage?.terminal && (
                  <p className="mt-2 text-sm text-emerald-700">Dossier clôturé : aucune action supplémentaire n’est proposée.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Page {data.page} / {data.pages} · {data.total} dossier(s)</span>
          <div className="flex gap-2">
            <button className="btn-outline btn-sm" disabled={page === 1 || busy} onClick={() => setPage(p => Math.max(1, p - 1))}>Précédent</button>
            <button className="btn-outline btn-sm" disabled={page === data.pages || busy} onClick={() => setPage(p => p + 1)}>Suivant</button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { fmtDate } from '../../format';
import { ConfirmModal, SkeletonTable } from '../../components/ui';

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  ARCHIVED: 'bg-slate-200 text-slate-600',
  SUSPENDED: 'bg-amber-100 text-amber-700',
  DRAFT: 'bg-slate-100 text-slate-500',
};

function VersionBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusStyles[status] ?? 'bg-slate-100 text-slate-500'}`}>
      {status}
    </span>
  );
}

export default function AdminFinancialModels() {
  const [versions, setVersions] = useState<any[] | null>(null);
  const [migrations, setMigrations] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; code: string; action: 'archive' | 'reactivate' } | null>(null);
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get('/admin/financial-models').then(setVersions).catch(() => setVersions([]));
    api.get('/admin/financial-models/migrations').then(r => setMigrations(Array.isArray(r) ? r : [])).catch(() => setMigrations([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runAction() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/financial-models/versions/${pending.id}/${pending.action}`, { justification });
      setPending(null);
      setJustification('');
      load();
    } catch (err: any) {
      setError(err?.message ?? 'Action impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Modèles financiers</h1>
        <p className="text-sm text-slate-500">
          Coexistence V1 — LEGACY (gelé, READ_ONLY) / V2 — MUTUALISTE. Une seule version ACTIVE à un instant donné.
          Archiver ou réactiver n'a <strong>jamais d'effet rétroactif</strong> sur les écritures existantes.
        </p>
      </div>

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!versions ? (
        <SkeletonTable bare rows={5} cols={5} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="th">Version</th>
                <th className="th">Moteur</th>
                <th className="th">Statut</th>
                <th className="th">Contrats rattachés</th>
                <th className="th">Activée le</th>
                <th className="th">Archivée le</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {versions.map((v: any) => (
                <tr key={v.id}>
                  <td className="td">
                    <span className="font-medium">{v.code}</span>
                    <span className="block text-xs text-slate-400">{v.label}</span>
                  </td>
                  <td className="td text-xs">{v.engineVersion}</td>
                  <td className="td"><VersionBadge status={v.status} /></td>
                  <td className="td text-sm">{v.contractsCount}</td>
                  <td className="td text-xs whitespace-nowrap">{v.activatedAt ? fmtDate(v.activatedAt) : '—'}</td>
                  <td className="td text-xs whitespace-nowrap">{v.archivedAt ? fmtDate(v.archivedAt) : '—'}</td>
                  <td className="td text-right space-x-2 whitespace-nowrap">
                    {v.status !== 'ARCHIVED' && (
                      <button
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => setPending({ id: v.id, code: v.code, action: 'archive' })}
                      >
                        Archiver
                      </button>
                    )}
                    {v.status === 'ARCHIVED' && (
                      <button
                        className="text-xs text-emerald-600 hover:underline"
                        onClick={() => setPending({ id: v.id, code: v.code, action: 'reactivate' })}
                      >
                        Réactiver
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="pt-2 text-lg font-semibold">Migrations de contrats (V1 → V2)</h2>
      {!migrations.length ? (
        <p className="text-sm text-slate-400">Aucune migration enregistrée — les contrats V1 restent sur leur modèle d'origine.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr>
                <th className="th">Contrat</th>
                <th className="th">De → Vers</th>
                <th className="th">Phase</th>
                <th className="th">Créée le</th>
                <th className="th">Certifiée le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {migrations.map((m: any) => (
                <tr key={m.id}>
                  <td className="td text-sm">{m.contractId}</td>
                  <td className="td text-xs">{m.fromVersionId} → {m.toVersionId}</td>
                  <td className="td text-xs">{m.status}</td>
                  <td className="td text-xs whitespace-nowrap">{m.createdAt ? fmtDate(m.createdAt) : '—'}</td>
                  <td className="td text-xs whitespace-nowrap">{m.certifiedAt ? fmtDate(m.certifiedAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={Boolean(pending)}
        title="Confirmer l'action modèle financier"
        message={
          pending
            ? `${pending.action === 'archive' ? 'Archiver' : 'Réactiver'} le modèle ${pending.code} ? Justification obligatoire, action journalisée au titre de l'audit.`
            : ''
        }
        confirmLabel="Confirmer"
        busy={busy}
        error={error}
        onClose={() => { if (!busy) { setPending(null); setJustification(''); } }}
        onConfirm={runAction}
      />
    </div>
  );
}

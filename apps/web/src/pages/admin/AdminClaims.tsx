import { useEffect, useState } from 'react';
import { api, fileUrl } from '../../api';
import { fcfa, fmtDate, statusLabel, statusStyle } from '../../format';
import { ErrorBanner, Field, Modal, Spinner, StatusBadge } from '../../components/ui';
import Pagination from '../../components/Pagination';
import { printReport, exportCsv } from '../../printReport';
import DateRangeFilter from '../../components/DateRangeFilter';

export default function AdminClaims() {
  const [data, setData] = useState<any>(null);
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const items = data?.items ?? null;

  const load = () => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    params.set('page', String(page));
    const qs = params.toString();
    api.get(`/admin/claims${qs ? `?${qs}` : ''}`).then(setData).catch(() => setData({ items: [], total: 0 }));
  };

  useEffect(() => { setPage(1); }, [status, from, to]);
  useEffect(load, [status, from, to, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Demandes de remboursement</h1>
        <select className="input w-auto" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="SUBMITTED">Soumises</option>
          <option value="UNDER_REVIEW">En analyse</option>
          <option value="INFO_REQUESTED">Infos requises</option>
          <option value="AUTH_REQUIRED">Autorisation à donner (TP)</option>
          <option value="APPROVED">Approuvées</option>
          <option value="PARTIALLY_APPROVED">Partiellement approuvées</option>
          <option value="REJECTED">Refusées</option>
          <option value="PAID">Payées</option>
        </select>
        <DateRangeFilter from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <button className="btn-outline btn-sm" onClick={() => {
          if (!items) return;
          const stLabels: Record<string, string> = { SUBMITTED: 'Soumises', UNDER_REVIEW: 'En analyse', INFO_REQUESTED: 'Infos requises', AUTH_REQUIRED: 'Autorisation TP', APPROVED: 'Approuvées', PARTIALLY_APPROVED: 'Partiellement approuvées', REJECTED: 'Refusées', PAID: 'Payées' };
          const period = [from && `Du ${new Date(from).toLocaleDateString('fr-FR')}`, to && `au ${new Date(to).toLocaleDateString('fr-FR')}`].filter(Boolean).join(' ');
          const filters = [status ? `Statut : ${stLabels[status] ?? status}` : '', period || 'Toutes périodes'].filter(Boolean).join(' · ');
          const totalReq = items.reduce((s: number, c: any) => s + (c.totalRequested ?? 0), 0);
          const totalApp = items.reduce((s: number, c: any) => s + (c.totalApproved ?? 0), 0);
          printReport({
            title: 'État des demandes de remboursement',
            subtitle: `${items.length} demande(s)`,
            filters,
            columns: [
              { label: 'Référence', key: 'reference' },
              { label: 'Assuré', key: 'claimantUser', format: (_: any, r: any) => `${r.claimantUser?.firstName ?? ''} ${r.claimantUser?.lastName ?? ''}` },
              { label: 'Bénéficiaire', key: 'beneficiary', format: (_: any, r: any) => r.beneficiary ? `${r.beneficiary.firstName} ${r.beneficiary.lastName}` : 'Principal' },
              { label: 'Date soins', key: 'careDate', format: (v: string) => new Date(v).toLocaleDateString('fr-FR') },
              { label: 'Demandé', key: 'totalRequested', align: 'right', format: (v: number) => v?.toLocaleString('fr-FR') + ' F' },
              { label: 'Approuvé', key: 'totalApproved', align: 'right', format: (v: number) => v != null ? v.toLocaleString('fr-FR') + ' F' : '—' },
              { label: 'Statut', key: 'status', format: (v: string) => stLabels[v] ?? v },
            ],
            rows: items,
            summary: [
              { label: 'Total demandé', value: totalReq.toLocaleString('fr-FR') + ' FCFA', accent: true },
              { label: 'Total approuvé', value: totalApp.toLocaleString('fr-FR') + ' FCFA' },
            ],
          });
        }}>🖨️ Imprimer</button>
        <button className="btn-outline btn-sm" onClick={() => {
          if (!items) return;
          exportCsv('etats-remboursements.csv', [
            { label: 'Référence', key: 'reference' },
            { label: 'Assuré', key: 'claimantUser', format: (_: any, r: any) => `${r.claimantUser?.firstName ?? ''} ${r.claimantUser?.lastName ?? ''}` },
            { label: 'Bénéficiaire', key: 'beneficiary', format: (_: any, r: any) => r.beneficiary ? `${r.beneficiary.firstName} ${r.beneficiary.lastName}` : 'Principal' },
            { label: 'Date soins', key: 'careDate', format: (v: string) => new Date(v).toLocaleDateString('fr-FR') },
            { label: 'Demandé', key: 'totalRequested' },
            { label: 'Approuvé', key: 'totalApproved' },
            { label: 'Statut', key: 'status', format: (v: string) => statusLabel(v) },
          ], items);
        }}>📊 CSV</button>
      </div>

      {!items ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr><th className="th">Référence</th><th className="th">Assuré</th><th className="th">Soins</th><th className="th">Demandé</th><th className="th">Approuvé</th><th className="th">Statut</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c: any) => (
                <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelected(c.id)}>
                  <td className="td font-medium">
                    {c.reference}
                    {c.kind === 'THIRDPARTY' && <span className="ml-1.5 badge bg-brand-100 text-brand-700">TP</span>}
                  </td>
                  <td className="td text-sm">
                    {c.claimantUser?.firstName} {c.claimantUser?.lastName}
                    {c.beneficiary && <span className="block text-xs text-slate-400">→ {c.beneficiary.firstName} {c.beneficiary.lastName}</span>}
                  </td>
                  <td className="td text-xs">{new Date(c.careDate).toLocaleDateString('fr-FR')}</td>
                  <td className="td">{c.totalRequested.toLocaleString('fr-FR')}</td>
                  <td className="td">{c.totalApproved?.toLocaleString('fr-FR') ?? '—'}</td>
                  <td className="td"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className="td text-center text-slate-400 py-8">Aucune demande</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}

      {selected && <ReviewModal claimId={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </div>
  );
}

function ReviewModal({ claimId, onClose, onChanged }: { claimId: string; onClose: () => void; onChanged: () => void }) {
  const [claim, setClaim] = useState<any>(null);
  const [note, setNote] = useState('');
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClaim = () =>
    api.get(`/claims/${claimId}`)
      .then(c => {
        setClaim(c);
        setOverrides(Object.fromEntries(c.items.map((i: any) => [i.id, i.amountApproved ?? i.amountRequested])));
      })
      .catch(e => setError(e?.message));

  useEffect(() => { void loadClaim(); }, [claimId]);

  if (!claim) return <Modal open onClose={onClose} title="Chargement…"><Spinner /></Modal>;

  const flags: string[] = claim.flags ? JSON.parse(claim.flags) : [];
  const editable = ['SUBMITTED', 'UNDER_REVIEW', 'INFO_REQUESTED'].includes(claim.status);
  const totalOverride = Object.values(overrides).reduce((a, b) => a + b, 0);

  async function act(action: string, body?: any) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/claims/${claimId}/${action}`, body ?? {});
      await loadClaim();
      onChanged();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${claim.reference} — ${statusLabel(claim.status)}`} wide>
      <ErrorBanner message={error} />

      <div className="grid gap-4 sm:grid-cols-2 text-sm">
        <div className="space-y-1">
          <p><b>Assuré :</b> {claim.claimantUser.firstName} {claim.claimantUser.lastName}</p>
          <p><b>Contrat :</b> {claim.contract.number} ({claim.contract.product.name})</p>
          <p><b>Bénéficiaire :</b> {claim.beneficiary ? `${claim.beneficiary.firstName} ${claim.beneficiary.lastName}` : 'Assuré principal'}</p>
        </div>
        <div className="space-y-1">
          <p><b>Date des soins :</b> {fmtDate(claim.careDate)}</p>
          <p><b>Établissement :</b> {claim.provider?.name ?? '—'}</p>
          <p><b>Soumise :</b> {fmtDate(claim.submittedAt)}</p>
        </div>
      </div>

      {flags.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-xs text-amber-600">
          {flags.map(f => (
            <li key={f}>
              {f.startsWith('WAITING_PERIOD') ? `⚠️ Délai de carence (jusqu’au ${f.split(':')[1]})`
                : f === 'DUPLICATE_SUSPECT' ? '⚠️ Possible doublon — vérifier l’historique'
                : f === 'OUT_OF_PERIOD' ? '⛔ Date hors période de couverture'
                : f === 'CONTRACT_INACTIVE' ? '⛔ Contrat non actif'
                : f}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <p className="label">Pièces justificatives</p>
        <ul className="flex flex-wrap gap-2">
          {claim.documents.map((d: any) => (
            <li key={d.id}>
              <a href={fileUrl(d.fileId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs hover:border-brand-300">
                📄 {d.docType}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <p className="label">Prestations {editable && '(montants ajustables)'}</p>
        <table className="w-full text-sm">
          <thead><tr><th className="th">Catégorie</th><th className="th">Éligible</th><th className="th">Taux</th><th className="th">Franchise</th><th className="th">Approuvé</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {claim.items.map((it: any) => (
              <tr key={it.id}>
                <td className="td">{it.categoryLabel}</td>
                <td className="td">{fcfa(it.amountEligible)}</td>
                <td className="td">{it.rateApplied != null ? `${it.rateApplied}%` : '—'}</td>
                <td className="td">{it.deductibleApplied ? fcfa(it.deductibleApplied) : '—'}</td>
                <td className="td w-32">
      {claim.kind === 'THIRDPARTY' ? (
        claim.status === 'AUTH_REQUIRED' ? (
          <div className="mt-4 rounded-lg border border-orange-300 bg-orange-50 p-4">
            <p className="text-sm font-semibold text-orange-800">⏳ Autorisation préalable requise — montant couvert estimé : {fcfa(claim.totalApproved ?? 0)}</p>
            <div className="mt-3 flex gap-2">
              <button
                className="btn-primary btn-sm flex-[2]"
                disabled={busy}
                onClick={async () => { setBusy(true); try { await api.post(`/admin/claims/${claimId}/authorize`, { note: note || undefined }); await loadClaim(); onChanged(); } catch (e: any) { setError(e?.message); } finally { setBusy(false); } }}
              >
                ✅ Autoriser la prise en charge
              </button>
              <button
                className="btn-danger btn-sm flex-1"
                disabled={busy || note.length < 3}
                onClick={async () => { setBusy(true); try { await api.post(`/admin/claims/${claimId}/reject`, { reason: note }); await loadClaim(); onChanged(); } catch (e: any) { setError(e?.message); } finally { setBusy(false); } }}
              >
                Refuser
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-center text-xs text-slate-400">Dossier tiers payant — statut : {statusLabel(claim.status)}</p>
        )
      ) : editable ? (
                    <input
                      type="number"
                      className="input py-1.5 text-right"
                      min={0}
                      value={overrides[it.id] ?? 0}
                      onChange={e => setOverrides(o => ({ ...o, [it.id]: Number(e.target.value) }))}
                    />
                  ) : (
                    <b>{fcfa(it.amountApproved ?? 0)}</b>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-between font-bold text-brand-800">
          <span>Total à rembourser</span>
          <span>{fcfa(editable ? totalOverride : claim.totalApproved ?? 0)}</span>
        </div>
      </div>

      <Field label={claim.status === 'INFO_REQUESTED' || claim.status === 'REJECTED' ? 'Note / motif' : 'Note interne au dossier'}>
        <textarea className="input" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder={editable ? 'Motif visible par l’assuré si refus/demande d’info…' : ''} />
      </Field>

      {editable ? (
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline btn-sm" disabled={busy} onClick={() => act('under-review')}>Passer en analyse</button>
          <button className="btn-outline btn-sm" disabled={busy || note.length < 3} onClick={() => act('request-info', { note })}>Demander infos</button>
          <button
            className="btn-primary btn-sm ml-auto"
            disabled={busy}
            onClick={() =>
              act('approve', {
                note: note || undefined,
                overrides: claim.items.map((i: any) => ({ itemId: i.id, amountApproved: overrides[i.id] ?? i.amountApproved ?? i.amountRequested })),
              })
            }
          >
            ✅ Approuver {totalOverride > 0 && `${totalOverride.toLocaleString('fr-FR')} F`}
          </button>
          <button className="btn-danger btn-sm" disabled={busy || note.length < 3} onClick={() => act('reject', { reason: note })}>Refuser</button>
        </div>
      ) : ['APPROVED', 'PARTIALLY_APPROVED'].includes(claim.status) ? (
        <div className="flex justify-end">
          <button className="btn-primary btn-sm" disabled={busy} onClick={() => act('mark-paid', { paidRef: note })}>
            💸 Marquer payé{note && ` (${note})`}
          </button>
        </div>
      ) : (
        <p className="text-center text-xs text-slate-400">Dossier clos — décision le {fmtDate(claim.decidedAt)}{claim.paidRef && ` · paiement ${claim.paidRef}`}</p>
      )}
    </Modal>
  );
}

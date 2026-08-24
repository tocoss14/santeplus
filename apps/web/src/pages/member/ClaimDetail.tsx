import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api, fileUrl } from '../../api';
import { fcfa, fmtDate, fmtDateTime, statusLabel, statusStyle } from '../../format';
import { ErrorBanner, Spinner } from '../../components/ui';

const TIMELINE = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PAID'];

export default function ClaimDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [claim, setClaim] = useState<any>(null);
  const [error, setError] = useState<string | null>((location.state as any)?.justSubmitted ? null : null);
  const [submittedBanner, setSubmittedBanner] = useState(Boolean((location.state as any)?.justSubmitted));

  useEffect(() => {
    if (!id) return;
    api.get(`/claims/${id}`).then(setClaim).catch(e => setError(e?.message));
  }, [id]);

  if (error) return <ErrorBanner message={error} />;
  if (!claim) return <Spinner />;

  const estimation: any = claim.estimation ? JSON.parse(claim.estimation) : null;
  const flags: string[] = claim.flags ? JSON.parse(claim.flags) : [];
  const currentStep = TIMELINE.indexOf(claim.status === 'PARTIALLY_APPROVED' ? 'APPROVED' : claim.status);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {claim.reference}
          {claim.kind === 'THIRDPARTY' && <span className="ml-2 badge bg-brand-100 text-brand-700 align-middle">Tiers payant</span>}
        </h1>
        <span className={`badge ${statusStyle(claim.status)}`}>{statusLabel(claim.status)}</span>
      </div>

      {claim.kind === 'THIRDPARTY' && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${['CONFIRMED', 'AUTHORIZED', 'PAID'].includes(claim.status) ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-orange-200 bg-orange-50 text-orange-800'}`}>
          {['CONFIRMED'].includes(claim.status) && '✅ Prise en charge confirmée chez le prestataire. Vous n’avez payé que le reste à charge.'}
          {['AUTHORIZED'].includes(claim.status) && '⏳ Autorisée par le gestionnaire — en attente de confirmation au cabinet.'}
          {claim.status === 'AUTH_REQUIRED' && '⏳ En attente d’autorisation préalable du gestionnaire (prestation coûteuse).'}
          {claim.status === 'CANCELLED' && '✖️ Prise en charge annulée (session expirée au cabinet).'}
          {!['CONFIRMED', 'AUTHORIZED', 'AUTH_REQUIRED', 'CANCELLED'].includes(claim.status) && `Statut : ${statusLabel(claim.status)}`}
        </div>
      )}

      {submittedBanner && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✅ Demande soumise ! Un gestionnaire va l’analyser. Vous recevrez une notification à chaque étape.
          <button className="ml-2 text-xs font-semibold text-emerald-700 underline" onClick={() => setSubmittedBanner(false)}>Masquer</button>
        </div>
      )}

      {['INFO_REQUESTED'].includes(claim.status) && claim.decisionNote && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          ℹ️ <b>Informations supplémentaires requises :</b> {claim.decisionNote}
        </div>
      )}
      {claim.status === 'REJECTED' && claim.decisionNote && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          ❌ <b>Motif du refus :</b> {claim.decisionNote}
        </div>
      )}

      {estimation?.totals && (
        <div className="card-p">
          <p className="label">Estimation automatique</p>
          <p className="text-xs text-slate-400">Indicative tant qu’un gestionnaire n’a pas validé la demande.</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Montant demandé" value={fcfa(estimation.totals.requested)} />
            <Row label="Montant éligible" value={fcfa(estimation.totals.eligible)} />
            <Row label="Remboursement estimé" value={fcfa(estimation.totals.approved)} strong />
            <Row label="Reste à charge estimatif" value={fcfa(estimation.totals.outOfPocket)} />
          </dl>
          {flags.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-xs text-amber-600">
              {flags.map(f => (
                <li key={f}>
                  {f.startsWith('WAITING_PERIOD') ? `Délai de carence en cours (jusqu’au ${f.split(':')[1]})`
                    : f === 'DUPLICATE_SUSPECT' ? 'Demande similaire détectée — vérification manuelle'
                    : f === 'OUT_OF_PERIOD' ? 'Date hors période de couverture'
                    : f === 'CONTRACT_INACTIVE' ? 'Contrat non actif'
                    : 'Point d’attention détecté'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {claim.kind !== 'THIRDPARTY' && (
        <div className="card-p">
          <p className="label">Suivi</p>
          <ol className="mt-2 flex items-center">
            {TIMELINE.map((s, i) => {
              const reached = claim.status !== 'REJECTED' && (currentStep >= i || ['APPROVED', 'PARTIALLY_APPROVED', 'PAID'].includes(claim.status) && i <= currentStep);
              const done = claim.status === 'PAID' || (i < TIMELINE.length - 1 && currentStep > i);
              return (
                <li key={s} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${done ? 'bg-emerald-500 text-white' : reached ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      {done ? '✓' : i + 1}
                    </span>
                    <span className="hidden sm:block text-[10px] font-medium text-slate-500">{shortLabel(s)}</span>
                  </div>
                  {i < TIMELINE.length - 1 && <span className={`mx-1 h-0.5 flex-1 ${currentStep > i ? 'bg-brand-500' : 'bg-slate-200'}`} />}
                </li>
              );
            })}
          </ol>
          {claim.decidedAt && (
            <p className="mt-3 text-xs text-slate-400">Décision rendue le {fmtDateTime(claim.decidedAt)}</p>
          )}
        </div>
      )}

      <div className="card-p">
        <p className="label">Prestations déclarées</p>
        <table className="w-full mt-1 text-sm">
          <tbody className="divide-y divide-slate-100">
            {claim.items.map((it: any) => (
              <tr key={it.id}>
                <td className="td">{it.categoryLabel}</td>
                <td className="td text-right text-xs text-slate-400">
                  {it.rateApplied != null && `taux ${it.rateApplied}%`}
                  {it.deductibleApplied ? ` · franchise ${fcfa(it.deductibleApplied)}` : ''}
                </td>
                <td className="td w-28 text-right font-medium">{fcfa(it.amountApproved ?? it.amountRequested)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-between border-t border-dashed pt-2 text-sm font-bold">
          <span>Total</span><span>{fcfa(claim.totalApproved ?? claim.totalRequested)}</span>
        </div>
      </div>

      <div className="card-p">
        <p className="label">Justificatifs ({claim.documents.length})</p>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {claim.documents.map((d: any) => (
            <li key={d.id}>
              <a href={fileUrl(d.fileId)} target="_blank" rel="noreferrer" className="block rounded-lg border border-slate-200 p-3 text-center hover:border-brand-300">
                <span className="text-2xl">{d.mime.includes('pdf') ? '📄' : '🖼️'}</span>
                <p className="mt-1 truncate text-[11px] text-slate-500">{d.docType}</p>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="card-p text-sm text-slate-600 grid grid-cols-2 gap-2">
        <div><p className="label">Date des soins</p>{fmtDate(claim.careDate)}</div>
        <div><p className="label">Établissement</p>{claim.provider?.name ?? '—'}</div>
        <div><p className="label">Bénéficiaire</p>{claim.beneficiary ? `${claim.beneficiary.firstName} ${claim.beneficiary.lastName}` : 'Moi-même'}</div>
        <div><p className="label">Soumise le</p>{fmtDateTime(claim.submittedAt)}</div>
      </div>
    </div>
  );
}

function shortLabel(s: string): string {
  return s === 'SUBMITTED' ? 'Soumise' : s === 'UNDER_REVIEW' ? 'Analyse' : s === 'APPROVED' ? 'Approuvée' : 'Payée';
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-bold text-brand-800' : ''}`}>
      <dt className={strong ? '' : 'text-slate-500'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

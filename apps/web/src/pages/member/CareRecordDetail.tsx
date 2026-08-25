import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fileUrl } from '../../api';
import { fcfa, fmtDate, fmtDateTime, statusLabel, statusStyle } from '../../format';
import { ErrorBanner, Spinner, StatusBadge } from '../../components/ui';
import { useAuth } from '../../auth';

const EVENT_ICON: Record<string, string> = {
  CONSULTATION_CREATED: '🩺',
  PRESCRIPTION_CREATED: '📋',
  DELIVERY_CREATED: '💊',
  CLAIM_CREATED: '🧾',
  CLAIM_AUTHORIZED: '✅',
  INVOICED: '🧾',
  PAID: '💰',
};

export default function CareRecordDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const [dossier, setDossier] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/care-records/${id}`).then(setDossier).catch(e => setError(e?.message));
    api.get(`/care-records/${id}/timeline`).then(r => setTimeline(r.events)).catch(() => setTimeline([]));
  }, [id]);

  if (error) return <ErrorBanner message={error} />;
  if (!dossier) return <Spinner />;

  const showMedical = me?.role !== 'COMPANY_ADMIN';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/app/soins" className="btn-outline btn-sm">← Mes soins</Link>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{dossier.reference}</h1>
        <StatusBadge status={dossier.status} />
        <span className="text-xs text-slate-400">{fmtDateTime(dossier.createdAt)}</span>
      </div>

      <div className="card-p grid gap-3 sm:grid-cols-2 text-sm">
        <div>
          <p className="label">Patient</p>
          {dossier.patientUser.firstName} {dossier.patientUser.lastName} ({dossier.patientUser.memberNumber})
          {dossier.beneficiary && <p className="text-xs text-slate-500">Ayant droit : {dossier.beneficiary.firstName} {dossier.beneficiary.lastName}</p>}
        </div>
        <div><p className="label">Établissement prescripteur</p>{dossier.provider?.name ?? '—'} · {dossier.provider?.city ?? ''}</div>
        <div><p className="label">Contrat</p>{dossier.claim ? `${dossier.claim.contractId}` : '—'}</div>
        <div><p className="label">Prise en charge</p>{dossier.claim ? `${fcfa(dossier.claim.totalApproved ?? 0)} couverts / ${fcfa(dossier.claim.totalRequested ?? 0)} demandés` : 'Aucune demande'}</div>
      </div>

      {dossier.consultation && showMedical && (
        <div className="card-p">
          <h2 className="font-semibold text-brand-800">Consultation</h2>
          <p className="text-sm"><b>Motif :</b> {dossier.consultation.motif}</p>
          {dossier.consultation.diagnostic && <p className="text-sm"><b>Diagnostic :</b> {dossier.consultation.diagnostic}</p>}
          <p className="text-xs text-slate-400">Le {fmtDateTime(dossier.consultation.careDate)} — {dossier.consultation.practitionerName}</p>
        </div>
      )}

      {dossier.prescription && (
        <div className="card-p">
          <h2 className="font-semibold text-brand-800">Ordonnance {dossier.prescription.number}</h2>
          <p className="text-xs text-slate-400">Valide jusqu'au {fmtDate(dossier.prescription.validUntil)} · {dossier.prescription.status}</p>
          <ul className="mt-2 divide-y divide-slate-100">
            {dossier.prescription.lines.map((l: any) => (
              <li key={l.id} className="flex justify-between py-1.5 text-sm">
                <span>{l.name} ×{l.quantity}</span>
                <span className="text-xs text-slate-500">{l.deliveredQty}/{l.quantity} délivré(s)</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dossier.delivery && (
        <div className="card-p">
          <h2 className="font-semibold text-brand-800">Délivrance {dossier.delivery.reference}</h2>
          <ul className="divide-y divide-slate-100">
            {dossier.delivery.lines.map((l: any) => (
              <li key={l.id} className="flex justify-between py-1.5 text-sm">
                <span>{l.name} ×{l.quantity}</span>
                <span>{fcfa(l.amount)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm font-bold">Reste à charge : {fcfa(dossier.delivery.patientAmount)}</p>
        </div>
      )}

      <div className="card-p">
        <h2 className="font-semibold mb-3">Timeline du dossier</h2>
        {!timeline ? <Spinner /> : timeline.length === 0 ? <p className="text-sm text-slate-400">Aucun événement.</p> : (
          <ol className="relative border-l border-slate-200 pl-6 space-y-4">
            {timeline.map((ev: any) => (
              <li key={ev.id} className="relative">
                <span className="absolute -left-[29px] grid h-6 w-6 place-items-center rounded-full bg-brand-100 text-xs">
                  {EVENT_ICON[ev.type] ?? '•'}
                </span>
                <p className="text-xs text-slate-400">{fmtDateTime(ev.createdAt)}{ev.actorRole ? ` · ${ev.actorRole}` : ''}</p>
                <p className="font-medium text-sm">{ev.title}</p>
                {ev.detail && <p className="text-xs text-slate-500">{ev.detail}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

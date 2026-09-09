import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate, statusLabel } from '../../format';
import { Spinner, StatusBadge, ErrorBanner, Field } from '../../components/ui';
import { BandBadge } from '../../components/CtsCards';

type Step = 'draft' | 'submitted' | 'validated' | 'instructed' | 'decided' | 'notified';

const STEPS: { key: Step; label: string }[] = [
  { key: 'draft', label: 'Brouillon' },
  { key: 'submitted', label: 'Soumis' },
  { key: 'validated', label: 'Validé' },
  { key: 'instructed', label: 'Instruit' },
  { key: 'decided', label: 'Décidé' },
  { key: 'notified', label: 'Notifié' },
];

export default function AdminClaimsWorkflow() {
  const [claims, setClaims] = useState<any[]>([]);
  const [filter, setFilter] = useState({ step: '', q: '' });
  const [sel, setSel] = useState<any>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams();
    if (filter.step) q.set('step', filter.step);
    if (filter.q) q.set('q', filter.q);
    api.get(`/admin/claims?${q.toString()}`).then(setClaims).catch(() => {});
  }, [filter]);

  const open = async (c: any) => {
    setSel(c);
    const d = await api.get(`/claims/${c.id}/documents`).catch(() => []);
    setDocs(d);
    setErr(null);
  };

  const transition = async (action: string, body?: any) => {
    if (!sel) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/claims/${sel.id}/transition`, { action, ...body });
      const c = await api.get(`/admin/claims/${sel.id}`);
      setSel(c);
      const d = await api.get(`/claims/${sel.id}/documents`).catch(() => []);
      setDocs(d);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!sel || !e.target.files?.length) return;
    const fd = new FormData();
    fd.append('file', e.target.files[0]);
    fd.append('kind', 'PIECE_JUSTIFICATIVE');
    try {
      await api.post(`/claims/${sel.id}/documents`, fd);
      const d = await api.get(`/claims/${sel.id}/documents`).catch(() => []);
      setDocs(d);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  if (!claims.length) return <div className="card-p text-center py-8 text-slate-500">Aucun dossier.</div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <h1 className="text-xl font-bold">Dossiers instruction ({claims.length})</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input className="input w-64" placeholder="Recherche (membre, numéro…)" value={filter.q} onChange={e => setFilter(f => ({ ...f, q: e.target.value }))} />
          <select className="input w-40" value={filter.step} onChange={e => setFilter(f => ({ ...f, step: e.target.value }))}>
            <option value="">Toutes étapes</option>
            {STEPS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Liste */}
        <div className="lg:col-span-1 card-p space-y-2 max-h-[70vh] overflow-auto">
          {claims.map(c => (
            <button
              key={c.id}
              onClick={() => open(c)}
              className={`w-full text-left p-3 rounded-lg border transition ${sel?.id === c.id ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold">{c.number}</span>
                <StatusBadge status={c.status} />
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{c.member?.firstName} {c.member?.lastName}</div>
              <div className="flex items-center gap-1 mt-1">
                {STEPS.map(s => (
                  <span key={s.key} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${c.step === s.key ? 'bg-brand-100 text-brand-800' : 'bg-slate-100 text-slate-500'}`}>
                    {s.label[0]}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* Détail */}
        {sel && (
          <div className="lg:col-span-2 card-p space-y-4">
            <ErrorBanner message={err} />
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold">{sel.number}</h2>
                <p className="text-sm text-slate-500">{sel.member?.firstName} {sel.member?.lastName} · {sel.contract?.number}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{fcfa(sel.amount)}</p>
                <StatusBadge status={sel.status} />
              </div>
            </div>

            {/* Barre d'étapes */}
            <div className="flex items-center gap-1">
              {STEPS.map((s, i) => (
                <React.Fragment key={s.key}>
                  <span className={`px-2 py-1 rounded-l ${sel.step === s.key ? 'bg-brand-100 text-brand-800' : i < STEPS.findIndex(x => x.key === sel.step) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                    {s.label}
                  </span>
                  {i < STEPS.length - 1 && <span className={`h-6 w-px ${i < STEPS.findIndex(x => x.key === sel.step) ? 'bg-emerald-300' : 'bg-slate-200'}`} />}
                </React.Fragment>
              ))}
            </div>

            {/* Pièces jointes */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Pièces ({docs.length})</h3>
                <label className="btn-outline btn-sm cursor-pointer">
                  Ajouter <input type="file" className="hidden" onChange={uploadDoc} />
                </label>
              </div>
              <ul className="divide-y divide-slate-100">
                {docs.map(d => (
                  <li key={d.id} className="flex items-center gap-2 py-2 text-sm">
                    <a href={fileUrl(d.id)} target="_blank" rel="noopener" className="text-brand-700 hover:underline">{d.originalName}</a>
                    <span className="text-xs text-slate-400">({d.kind})</span>
                    <span className="ml-auto text-xs text-slate-400">{fmtDate(d.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Actions selon étape */}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {sel.step === 'draft' && <button className="btn-primary" onClick={() => transition('SUBMIT')} disabled={busy}>Soumettre</button>}
              {sel.step === 'submitted' && (
                <>
                  <button className="btn-primary" onClick={() => transition('VALIDATE')} disabled={busy}>Valider</button>
                  <button className="btn-outline" onClick={() => transition('REJECT', { reason: prompt('Motif rejet :') })} disabled={busy}>Rejeter</button>
                </>
              )}
              {sel.step === 'validated' && <button className="btn-primary" onClick={() => transition('START_INSTRUCTION')} disabled={busy}>Démarrer instruction</button>}
              {sel.step === 'instructed' && (
                <>
                  <button className="btn-primary" onClick={() => transition('APPROVE', { amount: Number(prompt('Montant approuvé :')) })} disabled={busy}>Approuver</button>
                  <button className="btn-outline" onClick={() => transition('REJECT', { reason: prompt('Motif rejet :') })} disabled={busy}>Rejeter</button>
                </>
              )}
              {sel.step === 'decided' && <button className="btn-primary" onClick={() => transition('NOTIFY')} disabled={busy}>Notifier</button>}
              {sel.step === 'notified' && <span className="text-sm text-emerald-700 mt-2">✓ Dossier clos</span>}
            </div>

            <div className="text-xs text-slate-400 pt-2 border-t">
              Créé : {fmtDate(sel.createdAt)} · Mis à jour : {fmtDate(sel.updatedAt)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { fileUrl } from '../../api';
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate } from '../../format';
import { EmptyState, ErrorBanner, Field, Modal, Spinner, StatusBadge } from '../../components/ui';

const SAMPLE_CSV = 'Nom;Prénom;DateNaissance;Téléphone;Email;Fonction;Ayants droit;Statut\nDOSSA;Paul;12/03/1991;+22997445501;paul.dossa@exemple.bj;Chauffeur;Conjoint:DOSSA Alice,04/07/1993;ACTIF\nAGBO;Rita;25/09/1988;;rita.agbo@exemple.bj;Comptable;Enfant:AGBO Marc,10/10/2015;RADIE';

export default function Employees() {
  const [items, setItems] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [radiateTarget, setRadiateTarget] = useState<any | null>(null);
  const [showRadiated, setShowRadiated] = useState(true);

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (showRadiated) params.set('includeRadiated', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    api.get<any[]>(`/company/me/employees${qs}`)
      .then(setItems)
      .catch(e => { setError(e?.message); setItems([]); });
  };

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q, showRadiated]);

  async function runImport() {
    setBusy(true);
    setReport(null);
    setError(null);
    try {
      const res = await api.post<any>('/company/me/employees/import', { csv: csvText });
      setReport(res);
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Import impossible');
    } finally {
      setBusy(false);
    }
  }

  async function exitEmployee(id: string, name: string) {
    if (!confirm(`Confirmer la sortie de ${name} ? Sa couverture sera résiliée.`)) return;
    await api.patch(`/company/me/employees/${id}`);
    load();
  }

  async function radiateEmployee(id: string, effectiveAt?: string, reason?: string) {
    await api.post(`/company/me/employees/${id}/radiate`, { effectiveAt, reason });
    load();
  }

  if (!items) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Salariés ({items.length})</h1>
        <input className="input w-48" placeholder="Rechercher…" value={q} onChange={e => setQ(e.target.value)} />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={showRadiated} onChange={e => setShowRadiated(e.target.checked)} />
          Inclure radiés
        </label>
        <button className="btn-outline btn-sm" onClick={() => { setCsvText(''); setReport(null); setImportOpen(true); }}>📥 Import CSV</button>
        <button className="btn-primary btn-sm" onClick={() => setAddOpen(true)}>＋ Ajouter</button>
      </div>
      <ErrorBanner message={error} />

      {items.length === 0 ? (
        <EmptyState icon="👥" title="Aucun salarié enregistré" hint="Souscrivez d’abord le contrat collectif, puis ajoutez ou importez vos salariés." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead><tr><th className="th">Salarié</th><th className="th">N° assuré</th><th className="th">Contrat</th><th className="th">Statut</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(e => (
                <tr key={e.id}>
                  <td className="td">
                    <p className="font-medium">{e.lastName} {e.firstName}</p>
                    <p className="text-xs text-slate-400">{e.email}</p>
                  </td>
                  <td className="td text-xs">{e.memberNumber}</td>
                  <td className="td text-xs">{e.contractsAsPrincipal[0]?.number ?? '—'}</td>
                  <td className="td"><StatusBadge status={e.status === 'ACTIVE' && e.contractsAsPrincipal[0]?.status === 'ACTIVE' ? 'ACTIVE' : e.status === 'SUSPENDED' ? 'TERMINATED' : 'PENDING_PAYMENT'} /></td>
                  <td className="td text-right">
                    <div className="flex gap-2 justify-end">
                      {e.status === 'ACTIVE' && (
                        <>
                          <button onClick={() => setRadiateTarget(e)} className="text-xs text-orange-600 hover:underline">Radier</button>
                          <button onClick={() => exitEmployee(e.id, `${e.firstName} ${e.lastName}`)} className="text-xs text-red-600 hover:underline">Sortie</button>
                        </>
                      )}
                      {e.status !== 'ACTIVE' && <span className="text-xs text-slate-400">Radié</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddModal open={addOpen} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); load(); }} />

      <RadiateModal open={!!radiateTarget} onClose={() => setRadiateTarget(null)} employee={radiateTarget} onDone={async (effectiveAt, reason) => { if (radiateTarget) { await radiateEmployee(radiateTarget.id, effectiveAt, reason); setRadiateTarget(null); } }} />

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Importer des salariés (CSV)" wide>
        <div className="space-y-3 text-sm">
          <p className="text-slate-500">
            Colonnes acceptées : <code className="rounded bg-slate-100 px-1">Nom; Prénom; DateNaissance; Téléphone; Email; Fonction; Ayants droit; Statut</code>.
            Les ayants droit s’écrivent : <code className="rounded bg-slate-100 px-1">Conjoint:Nom Prénom,JJ/MM/AAAA; Enfant:Nom Prénom,JJ/MM/AAAA</code>.
            Colonne <code className="rounded bg-slate-100 px-1">Statut</code> : si valeur <code className="rounded bg-slate-100 px-1">RADIE</code> / <code className="rounded bg-slate-100 px-1">RADIÉ</code> / <code className="rounded bg-slate-100 px-1">RADIE(E)</code>, le salarié est immédiatement radié après création.
            Le système détecte les doublons et erreurs avant l’importation.
          </p>
          <div className="flex gap-2">
            <button className="btn-outline btn-sm" onClick={() => setCsvText(SAMPLE_CSV)}>Charger un exemple</button>
            <label className="btn-outline btn-sm cursor-pointer">
              📎 Choisir un fichier…
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                onChange={async e => {
                  const f = e.target.files?.[0];
                  if (f) setCsvText(await f.text());
                }}
              />
            </label>
          </div>
          <textarea className="input font-mono text-xs h-40" value={csvText} onChange={e => setCsvText(e.target.value)} placeholder="Coller le contenu CSV ici…" />
          <button className="btn-primary w-full" disabled={busy || csvText.length < 10} onClick={runImport}>
            {busy ? 'Analyse et import…' : 'Analyser & importer'}
          </button>

          {report && (
            <div className="rounded-lg border p-4 text-sm">
              <p className="font-semibold">
                ✅ {report.imported} salarié(s) importé(s){report.errors.length > 0 && ` · ⚠️ ${report.errors.length} ligne(s) rejetée(s)`}
              </p>
              {report.tempPasswords.length > 0 && (
                <div className="mt-2 rounded bg-amber-50 border border-amber-200 p-3 text-xs max-h-40 overflow-y-auto">
                  <b>Communiquez ces accès temporaires :</b>
                  <ul className="mt-1 space-y-0.5 font-mono">
                    {report.tempPasswords.map((t: any) => (
                      <li key={t.email}>{t.email} → <b>{t.password}</b></li>
                    ))}
                  </ul>
                </div>
              )}
              {report.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-red-600 max-h-32 overflow-y-auto">
                  {report.errors.map((er: any) => <li key={er.row}>Ligne {er.row} — {er.message}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function RadiateModal({ open, onClose, employee, onDone }: { open: boolean; onClose: () => void; employee: any; onDone: (effectiveAt?: string, reason?: string) => void }) {
  const [effectiveAt, setEffectiveAt] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setEffectiveAt(''); setReason(''); setError(null); } }, [open]);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let iso: string | undefined = undefined;
      if (effectiveAt) {
        const d = new Date(effectiveAt);
        if (isNaN(d.getTime())) throw new Error('Date d’effet invalide');
        iso = d.toISOString();
      }
      await onDone(iso, reason || undefined);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Radier ${employee ? `${employee.firstName} ${employee.lastName}` : ''}`}>
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <Field label="Date d’effet (optionnelle, défaut: maintenant)">
          <input type="date" className="input" value={effectiveAt} onChange={e => setEffectiveAt(e.target.value)} />
        </Field>
        <Field label="Motif (optionnel)">
          <input className="input" placeholder="Démission, fin de contrat…" value={reason} onChange={e => setReason(e.target.value)} maxLength={500} />
        </Field>
        <p className="text-xs text-slate-500">La radiation mettra le contrat à <b>TERMINATED</b> et les ayants droit à <b>SUSPENDED</b> avec date de retrait. Toute délivrance ultérieure sera bloquée.</p>
        <button className="btn-primary w-full bg-orange-600 hover:bg-orange-700" disabled={busy} onClick={submit}>
          {busy ? 'Radiation…' : 'Confirmer la radiation'}
        </button>
      </div>
    </Modal>
  );
}

function AddModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ lastName: '', firstName: '', email: '', phone: '', birthDate: '', gender: 'M' });
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<any>('/company/me/employees', form);
      setTempPassword(res.tempPassword);
      onDone();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Ajouter un salarié">
      {tempPassword ? (
        <div className="text-center">
          <p className="text-emerald-600 font-semibold">✅ Salarié ajouté</p>
          <p className="mt-2 text-sm text-slate-600">Mot de passe temporaire à communiquer :</p>
          <p className="mt-1 rounded bg-slate-100 py-2 font-mono text-lg font-bold">{tempPassword}</p>
          <button className="btn-primary mt-4 w-full" onClick={onClose}>Terminé</button>
        </div>
      ) : (
        <>
          <ErrorBanner message={error} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom"><input className="input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></Field>
            <Field label="Prénom"><input className="input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></Field>
          </div>
          <Field label="Email professionnel"><input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
          <Field label="Téléphone"><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date de naissance"><input type="date" className="input" value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} /></Field>
            <Field label="Sexe">
              <select className="input" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                <option value="M">Masculin</option><option value="F">Féminin</option>
              </select>
            </Field>
          </div>
          <button className="btn-primary w-full" disabled={busy || !form.lastName || !form.firstName || !form.birthDate} onClick={submit}>
            {busy ? 'Ajout…' : 'Ajouter'}
          </button>
        </>
      )}
    </Modal>
  );
}

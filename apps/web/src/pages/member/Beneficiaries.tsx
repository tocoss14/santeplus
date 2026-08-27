import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fmtDate, RELATION_LABELS } from '../../format';
import { EmptyState, ErrorBanner, Field, Modal, Spinner, StatusBadge } from '../../components/ui';

export default function Beneficiaries() {
  const [contractId, setContractId] = useState<string | null>(null);
  const [items, setItems] = useState<any[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', birthDate: '', gender: '', relation: 'CHILD' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    void api.get<any[]>('/contracts/mine')
      .then(list => {
        const target = list.find(c => ['ACTIVE', 'SUSPENDED'].includes(c.status));
        if (!target) throw new Error('Aucun contrat actif');
        setContractId(target.id);
        return api.get(`/contracts/${target.id}/beneficiaries`);
      })
      .then(setItems)
      .catch(e => {
        setError(e?.message ?? 'Erreur');
        setItems([]);
      });
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/contracts/${contractId}/beneficiaries`, form);
      setAddOpen(false);
      setForm({ firstName: '', lastName: '', birthDate: '', gender: '', relation: 'CHILD' });
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Ajout impossible');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Retirer cet ayant droit de la couverture ?')) return;
    await api.post(`/contracts/${contractId}/beneficiaries/${id}/remove`);
    load();
  };

  if (!items) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Mes ayants droit</h1>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Les ayants droit sont déclarés lors de la souscription. Pour toute modification (ajout, retrait), veuillez contacter le support — un avenant sera établi.
      </div>
      <ErrorBanner message={error} />

      {items.length === 0 ? (
        <EmptyState icon="👨‍👩‍👧" title="Aucun ayant droit déclaré" hint="Ajoutez votre conjoint et vos enfants pour les inclure à la couverture." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map(b => (
            <li key={b.id} className="card-p flex items-center gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-100 text-lg">
                {b.gender === 'F' ? '👩' : b.relation === 'CHILD' ? '👦' : '👨'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{b.firstName} {b.lastName}</p>
                <p className="text-xs text-slate-500">
                  {RELATION_LABELS[b.relation]} · né(e) le {fmtDate(b.birthDate)}
                </p>
                <p className="text-[11px] text-slate-400">{b.memberNumber}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge status={b.status} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Ajouter un ayant droit">
        <ErrorBanner message={error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nom"><input className="input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} /></Field>
          <Field label="Prénom"><input className="input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Naissance"><input type="date" className="input" value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))} /></Field>
          <Field label="Sexe">
            <select className="input" value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
              <option value="">—</option><option value="M">M</option><option value="F">F</option>
            </select>
          </Field>
          <Field label="Lien">
            <select className="input" value={form.relation} onChange={e => setForm(f => ({ ...f, relation: e.target.value }))}>
              <option value="SPOUSE">Conjoint(e)</option>
              <option value="CHILD">Enfant</option>
              <option value="OTHER">Autre</option>
            </select>
          </Field>
        </div>
        <button className="btn-primary w-full mt-2" disabled={busy || !form.firstName || !form.lastName || !form.birthDate || !form.gender} onClick={add}>
          {busy ? 'Ajout…' : 'Ajouter'}
        </button>
      </Modal>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa, fmtDate, statusLabel, statusStyle } from '../../format';
import { ErrorBanner, Field, Spinner } from '../../components/ui';

export default function AdminPartners() {
  const [items, setItems] = useState<any[] | null>(null);
  const [form, setForm] = useState({ name: '', kind: 'INSURER', agreementNumber: '', contactEmail: '', phone: '' });
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void api.get('/admin/partners').then(setItems).catch(() => setItems([]));
  };
  useEffect(() => { load(); }, []);

  if (!items) return <Spinner />;

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold">Partenaires assureurs & mutuelles</h1>
      <p className="text-sm text-slate-500 -mt-2">
        La plateforme reste indépendante du porteur de risque : chaque produit peut être associé à un partenaire différent.
      </p>

      <ul className="space-y-2">
        {items.map(p => (
          <li key={p.id} className="card-p flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs text-slate-400">
                {p.kind === 'INSURER' ? 'Assurance' : 'Mutuelle'}{p.agreementNumber ? ` · convention ${p.agreementNumber}` : ''}
                {p.contactEmail ? ` · ${p.contactEmail}` : ''}
              </p>
            </div>
            <span className={`badge ${p.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100'}`}>{p.status === 'ACTIVE' ? 'Actif' : p.status}</span>
            <button
              className="btn-outline btn-sm"
              onClick={async () => {
                await api.patch(`/admin/partners/${p.id}`, { status: p.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' });
                load();
              }}
            >
              {p.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
            </button>
          </li>
        ))}
      </ul>

      <div className="card-p">
        <h2 className="font-semibold mb-2">Ajouter un partenaire</h2>
        <ErrorBanner message={error} />
        <Field label="Nom"><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select className="input" value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>
              <option value="INSURER">Compagnie d’assurance</option>
              <option value="MUTUAL">Mutuelle</option>
            </select>
          </Field>
          <Field label="N° de convention"><input className="input" value={form.agreementNumber} onChange={e => setForm(f => ({ ...f, agreementNumber: e.target.value }))} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email contact"><input className="input" value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} /></Field>
          <Field label="Téléphone"><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></Field>
        </div>
        <button
          className="btn-primary w-full"
          disabled={!form.name}
          onClick={async () => {
            try {
              await api.post('/admin/partners', form);
              setForm({ name: '', kind: 'INSURER', agreementNumber: '', contactEmail: '', phone: '' });
              load();
            } catch (e: any) {
              setError(e?.message ?? 'Erreur');
            }
          }}
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}

export const _unused = { fcfa, fmtDate };

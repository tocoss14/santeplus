import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa } from '../../format';
import { ErrorBanner, Field, Modal, Spinner, StatusBadge, Badge } from '../../components/ui';

const EMPTY = {
  code: '', name: '', description: '', clientType: 'INDIVIDUAL', minAge: 0, maxAge: 65,
  basePremiumAnnual: 0, pricePerAdditionalAdultAnnual: 0, pricePerChildAnnual: 0,
  waitingPeriodDays: 30, status: 'DRAFT', sortOrder: 0, thirdPartyAuthThreshold: '' as any,
  spouse: true, childMaxAge: 21, otherAllowed: false, maxBeneficiaries: 6,
  guarantees: [] as any[], exclusionsText: '',
};

export default function AdminProducts() {
  const [items, setItems] = useState<any[] | null>(null);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  const load = () => {
    void api.get('/admin/products').then(setItems).catch(() => setItems([]));
    void api.get('/admin/guarantees').then(setCatalog).catch(() => {});
    void api.get('/admin/partners').then(setPartners).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Produits & garanties</h1>
        <button className="btn-primary btn-sm" onClick={() => setEditing({ ...EMPTY, guarantees: catalog.map(g => ({ guaranteeId: g.id, categoryId: g.category, name: g.name, annualLimit: null, rate: 80, deductibleType: 'NONE', deductibleValue: 0, enabled: false })) })}>
          ＋ Nouveau produit
        </button>
      </div>

      {!items ? (
        <Spinner />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map(p => (
            <li key={p.id} className="card-p">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{p.name} <span className="ml-1 text-xs font-normal text-slate-400">{p.code}</span></p>
                  <p className="text-xs text-slate-400">{p.clientType === 'COMPANY' ? 'Collectif entreprise' : 'Individuel'} · {p.insurerPartner?.name ?? 'sans partenaire'}</p>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-500">
                <Badge>{fcfa(p.basePremiumAnnual)}/an</Badge>
                <Badge>{p._count.guarantees} garanties</Badge>
                <Badge>{p._count.exclusions} exclusions</Badge>
                <Badge>{p._count.contracts} contrats</Badge>
                <Badge>Seuil TP: {p.thirdPartyAuthThreshold != null ? fcfa(p.thirdPartyAuthThreshold) : 'défaut 150k'}</Badge>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Field label="Seuil autorisation tiers payant (FCFA)" className="flex-1 !mb-0">
                  <div className="flex gap-1">
                    <input
                      type="number"
                      className="input py-1 text-sm"
                      placeholder="vide = 150 000"
                      defaultValue={p.thirdPartyAuthThreshold ?? ''}
                      id={`thr-${p.id}`}
                    />
                    <button
                      className="btn-outline btn-sm whitespace-nowrap"
                      onClick={async () => {
                        const el = document.getElementById(`thr-${p.id}`) as HTMLInputElement;
                        const v = el.value.trim() === '' ? null : Number(el.value);
                        if (v !== null && (Number.isNaN(v) || v < 0)) { alert('Seuil invalide'); return; }
                        await api.patch(`/admin/products/${p.id}`, { thirdPartyAuthThreshold: v });
                        load();
                      }}
                    >
                      OK
                    </button>
                  </div>
                </Field>
              </div>
              <button
                className="btn-outline btn-sm mt-3 w-full"
                onClick={() =>
                  api.get(`/admin/products/${p.id}`).then(d => {
                    setEditing({
                      ...EMPTY,
                      ...d,
                      spouse: JSON.parse(d.beneficiaryRules || '{}').spouse ?? true,
                      childMaxAge: JSON.parse(d.beneficiaryRules || '{}').childMaxAge ?? 21,
                      otherAllowed: JSON.parse(d.beneficiaryRules || '{}').otherAllowed ?? false,
                      maxBeneficiaries: JSON.parse(d.beneficiaryRules || '{}').maxBeneficiaries ?? 6,
                      thirdPartyAuthThreshold: d.thirdPartyAuthThreshold ?? '',
                      exclusionsText: d.exclusions.map((x: any) => x.description).join('\n'),
                      guarantees: catalog.map(g => {
                        const existing = d.guarantees.find((pg: any) => pg.guaranteeId === g.id);
                        return {
                          guaranteeId: g.id, name: g.name, categoryId: g.category, enabled: !!existing,
                          annualLimit: existing?.annualLimit ?? null, rate: existing?.rate ?? 80,
                          deductibleType: existing?.deductibleType ?? 'NONE', deductibleValue: existing?.deductibleValue ?? 0,
                        };
                      }),
                      insurerPartnerId: d.insurerPartnerId ?? '',
                    });
                  })
                }
              >
                ✏️ Modifier
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <ProductEditor
          product={editing}
          partners={partners}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function ProductEditor({ product, partners, onClose, onSaved }: any) {
  const [form, setForm] = useState(product);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = !product.id;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f: any) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        code: form.code,
        name: form.name,
        description: form.description || undefined,
        clientType: form.clientType,
        minAge: Number(form.minAge),
        maxAge: Number(form.maxAge),
        basePremiumAnnual: Number(form.basePremiumAnnual),
        pricePerAdditionalAdultAnnual: Number(form.pricePerAdditionalAdultAnnual),
        pricePerChildAnnual: Number(form.pricePerChildAnnual),
        waitingPeriodDays: Number(form.waitingPeriodDays),
        status: form.status,
        sortOrder: Number(form.sortOrder ?? 0),
        thirdPartyAuthThreshold: form.thirdPartyAuthThreshold === '' || form.thirdPartyAuthThreshold == null ? null : Number(form.thirdPartyAuthThreshold),
        insurerPartnerId: form.insurerPartnerId || undefined,
        beneficiaryRules: { spouse: form.spouse, childMaxAge: Number(form.childMaxAge), otherAllowed: form.otherAllowed, maxBeneficiaries: Number(form.maxBeneficiaries) },
        guarantees: form.guarantees.filter((g: any) => g.enabled).map((g: any) => ({
          guaranteeId: g.guaranteeId,
          annualLimit: g.annualLimit === '' || g.annualLimit == null ? null : Number(g.annualLimit),
          rate: Number(g.rate),
          deductibleType: g.deductibleType,
          deductibleValue: Number(g.deductibleValue ?? 0),
        })),
        exclusions: form.exclusionsText.split('\n').map((s: string) => s.trim()).filter(Boolean).map((description: any) => ({ description })),
      };
      if (isNew) await api.post('/admin/products', payload);
      else await api.patch(`/admin/products/${form.id}`, payload);
      onSaved();
    } catch (e: any) {
      const fieldErrors = e?.data?.errors?.fieldErrors;
      setError(fieldErrors ? Object.values(fieldErrors).flat().join(' · ') as string : e?.message ?? 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'Nouveau produit' : `Modifier ${form.name}`} wide>
      <ErrorBanner message={error} />
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="Code"><input className="input font-mono uppercase" value={form.code} onChange={set('code')} disabled={!isNew} /></Field>
        <Field label="Nom"><input className="input" value={form.name} onChange={set('name')} /></Field>
        <Field label="Description"><textarea rows={2} className="input" value={form.description} onChange={set('description')} /></Field>
        <Field label="Statut">
          <select className="input" value={form.status} onChange={set('status')}>
            <option value="DRAFT">Brouillon</option><option value="ACTIVE">Actif</option><option value="ARCHIVED">Archivé</option>
          </select>
        </Field>
        <Field label="Clientèle">
          <select className="input" value={form.clientType} onChange={set('clientType')} disabled={!isNew}>
            <option value="INDIVIDUAL">Particuliers</option><option value="COMPANY">Entreprises</option>
          </select>
        </Field>
        <Field label="Partenaire assureur / mutuelle">
          <select className="input" value={form.insurerPartnerId ?? ''} onChange={set('insurerPartnerId')}>
            <option value="">—</option>
            {partners.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Âge min"><input type="number" className="input" value={form.minAge} onChange={set('minAge')} /></Field>
          <Field label="Âge max"><input type="number" className="input" value={form.maxAge} onChange={set('maxAge')} /></Field>
        </div>
        <Field label="Délai de carence (jours)"><input type="number" className="input" value={form.waitingPeriodDays} onChange={set('waitingPeriodDays')} /></Field>
        <Field label="Seuil autorisation TP (FCFA, vide=défaut 150k)"><input type="number" className="input" placeholder="150000" value={form.thirdPartyAuthThreshold ?? ''} onChange={set('thirdPartyAuthThreshold')} /></Field>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <Field label="Cotisation de base/an"><input type="number" className="input" value={form.basePremiumAnnual} onChange={set('basePremiumAnnual')} /></Field>
          <Field label="Adulte supp./an"><input type="number" className="input" value={form.pricePerAdditionalAdultAnnual} onChange={set('pricePerAdditionalAdultAnnual')} /></Field>
          <Field label="Enfant/an"><input type="number" className="input" value={form.pricePerChildAnnual} onChange={set('pricePerChildAnnual')} /></Field>
        </div>
        <div className="sm:col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.spouse} onChange={e => setForm((f: any) => ({ ...f, spouse: e.target.checked }))} /> Conjoint</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.otherAllowed} onChange={e => setForm((f: any) => ({ ...f, otherAllowed: e.target.checked }))} /> Autres</label>
          <Field label="Âge max enfant"><input type="number" className="input" value={form.childMaxAge} onChange={set('childMaxAge')} /></Field>
          <Field label="Max ayants droit"><input type="number" className="input" value={form.maxBeneficiaries} onChange={set('maxBeneficiaries')} /></Field>
        </div>
      </div>

      <p className="label mt-2">Garanties — cochez et paramétrez</p>
      <div className="space-y-2">
        {form.guarantees.map((g: any, i: number) => (
          <div key={g.guaranteeId} className={`rounded-lg border p-2.5 ${g.enabled ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200 opacity-60'}`}>
            <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={g.enabled}
                onChange={e => setForm((f: any) => ({ ...f, guarantees: f.guarantees.map((x: any, j: number) => j === i ? { ...x, enabled: e.target.checked } : x) }))}
              />
              {g.name}
            </label>
            {g.enabled && (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <input placeholder="Plafond (vide=illimité)" className="input py-1.5 col-span-2" value={g.annualLimit ?? ''} onChange={e => setForm((f: any) => ({ ...f, guarantees: f.guarantees.map((x: any, j: number) => j === i ? { ...x, annualLimit: e.target.value === '' ? null : e.target.value } : x) }))} />
                <div className="relative">
                  <input type="number" className="input py-1.5 pr-7" value={g.rate} onChange={e => setForm((f: any) => ({ ...f, guarantees: f.guarantees.map((x: any, j: number) => j === i ? { ...x, rate: e.target.value } : x) }))} />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                </div>
                <select className="input py-1.5" value={g.deductibleType} onChange={e => setForm((f: any) => ({ ...f, guarantees: f.guarantees.map((x: any, j: number) => j === i ? { ...x, deductibleType: e.target.value } : x) }))}>
                  <option value="NONE">Sans franchise</option><option value="FIXED">Franchise fixe</option><option value="PERCENT">Franchise %</option>
                </select>
                {g.deductibleType !== 'NONE' && (
                  <input type="number" className="input py-1.5" placeholder={g.deductibleType === 'PERCENT' ? '%' : 'FCFA'} value={g.deductibleValue ?? ''} onChange={e => setForm((f: any) => ({ ...f, guarantees: f.guarantees.map((x: any, j: number) => j === i ? { ...x, deductibleValue: e.target.value } : x) }))} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Field label="Exclusions (une par ligne)">
        <textarea rows={2} className="input" value={form.exclusionsText} onChange={set('exclusionsText')} />
      </Field>

      <button className="btn-primary w-full mt-2" disabled={busy || !form.code || !form.name} onClick={save}>
        {busy ? 'Enregistrement…' : isNew ? 'Créer le produit' : 'Enregistrer'}
      </button>
    </Modal>
  );
}

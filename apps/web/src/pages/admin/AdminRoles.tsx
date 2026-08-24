import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ROLE_LABELS } from '../../format';
import { Spinner } from '../../components/ui';

const PERMISSION_GROUPS: Record<string, string[]> = {
  Assurés: ['members.read', 'members.manage'],
  Entreprises: ['companies.read', 'companies.manage'],
  'Produits & partenaires': ['products.manage', 'partners.manage'],
  'Réseau de soins': ['providers.read', 'providers.manage'],
  Contrats: ['contracts.viewAll', 'contracts.manage'],
  Remboursements: ['claims.viewAll', 'claims.decide'],
  Paiements: ['payments.viewAll', 'payments.manage'],
  Administration: ['stats.admin', 'audit.view', 'roles.manage', 'config.manage'],
  'Espace entreprise': ['company.dashboard', 'company.employees.manage', 'company.claims.view', 'company.contracts.manage'],
  'Prestataire': ['provider.verify', 'provider.thirdparty'],
};

export default function AdminRoles() {
  const [roles, setRoles] = useState<string[]>([]);
  const [role, setRole] = useState('INSURANCE_MANAGER');
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/admin/roles').then(r => {
      setRoles(r.map((x: any) => x.role));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (role === 'SUPER_ADMIN') return;
    api.get(`/admin/roles/${role}/permissions`).then(r => setKeys(new Set(r.keys))).catch(() => {});
  }, [role]);

  async function save(next: Set<string>) {
    setKeys(next);
    await api.post(`/admin/roles/${role}/permissions`, { keys: [...next] });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Rôles & permissions</h1>
        <select className="input w-auto" value={role} onChange={e => setRole(e.target.value)} disabled={role === 'SUPER_ADMIN'}>
          {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
        </select>
      </div>

      {role === 'SUPER_ADMIN' ? (
        <div className="card-p text-sm text-slate-500">Le super administrateur dispose implicitement de toutes les permissions.</div>
      ) : (
        <>
          {saved && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700">✅ Permissions enregistrées (prise d’effet en ~30 s)</div>}
          <div className="grid gap-4 md:grid-cols-2">
            {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
              <div key={group} className="card-p">
                <p className="font-semibold mb-2">{group}</p>
                <ul className="space-y-1.5">
                  {perms.map(k => (
                    <li key={k}>
                      <label className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={keys.has(k)}
                          onChange={e => {
                            const next = new Set(keys);
                            if (e.target.checked) next.add(k); else next.delete(k);
                            void save(next);
                          }}
                        />
                        <span>{k}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

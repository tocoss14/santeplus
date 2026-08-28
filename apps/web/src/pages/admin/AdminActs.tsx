import { useEffect, useState } from 'react';
import { api } from '../../api';
import { fcfa } from '../../format';
import { ErrorBanner, Field, Spinner } from '../../components/ui';

export default function AdminActs() {
  const [items, setItems] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const data = await api.get<any[]>(`/admin/acts${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setItems(data);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur chargement');
      setItems([]);
    }
  };

  useEffect(() => { void load(); }, []);
  // reload on q debounce
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function saveThreshold(act: any) {
    const raw = editing[act.id] ?? (act.authThreshold != null ? String(act.authThreshold) : '');
    const v = raw.trim() === '' ? null : Number(raw);
    if (v !== null && (Number.isNaN(v) || v < 0)) {
      setError('Seuil invalide (doit être ≥0 ou vide)');
      return;
    }
    setError(null);
    try {
      await api.patch(`/admin/acts/${act.id}`, { authThreshold: v });
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur sauvegarde');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold mr-auto">Actes & seuils d’autorisation</h1>
        <input className="input max-w-xs" placeholder="Rechercher code / nom" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <ErrorBanner message={error} />
      <p className="text-sm text-slate-500">
        Seuil par acte (FCFA) : si vide, le seuil produit s’applique (défaut global 150 000 FCFA). Le plus restrictif des deux s’applique par acte ; si un acte dépasse son seuil, la prise en charge passe en AUTH_REQUIRED.
      </p>
      {!items ? (
        <Spinner />
      ) : (
        <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Nom</th>
                <th className="px-3 py-2">Catégorie</th>
                <th className="px-3 py-2">Prix réf.</th>
                <th className="px-3 py-2">Prescription</th>
                <th className="px-3 py-2">Seuil auth (FCFA)</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map(act => (
                <tr key={act.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{act.code}</td>
                  <td className="px-3 py-2">{act.name}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{act.categoryId}</td>
                  <td className="px-3 py-2">{fcfa(act.referencePrice)}</td>
                  <td className="px-3 py-2">{act.requiresPrescription ? 'Oui' : 'Non'}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      className="input py-1 text-sm w-32"
                      placeholder="défaut"
                      value={editing[act.id] !== undefined ? editing[act.id] : act.authThreshold ?? ''}
                      onChange={e => setEditing(prev => ({ ...prev, [act.id]: e.target.value }))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button className="btn-outline btn-sm" onClick={() => saveThreshold(act)}>Enregistrer</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">Aucun acte</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

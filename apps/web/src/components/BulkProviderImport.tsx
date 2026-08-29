import { useRef, useState } from 'react';
import { api } from '../api';
import { Badge, ErrorBanner, Spinner } from './ui';

interface ImportResult {
  email: string;
  name: string;
  status: 'created' | 'exists' | 'error';
  tempPassword?: string;
  error?: string;
}

interface Props {
  onClose: () => void;
  onDone: () => void;
}

/**
 * Composant d'import bulk de prestataires depuis un fichier Excel/CSV.
 *
 * Format attendu (colonnes) :
 * Nom | Type | Ville | Adresse | Téléphone | Email | Spécialités | Prénom contact | Nom contact | Tél. contact
 *
 * Le type doit être un des : HOSPITAL, CLINIC, HEALTH_CENTER, PHARMACY, LABORATORY, MEDICAL_CABINET, SPECIALIST
 */
export default function BulkProviderImport({ onClose, onDone }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<any[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [tempPassword, setTempPassword] = useState('');

  const TYPE_MAP: Record<string, string> = {
    'hôpital': 'HOSPITAL', 'hopital': 'HOSPITAL', 'hospital': 'HOSPITAL',
    'clinique': 'CLINIC', 'clinic': 'CLINIC',
    'centre de santé': 'HEALTH_CENTER', 'centre': 'HEALTH_CENTER',
    'pharmacie': 'PHARMACY', 'pharmacy': 'PHARMACY',
    'laboratoire': 'LABORATORY', 'labo': 'LABORATORY', 'laboratory': 'LABORATORY',
    'cabinet': 'MEDICAL_CABINET', 'cabinet médical': 'MEDICAL_CABINET',
    'spécialiste': 'SPECIALIST', 'specialiste': 'SPECIALIST',
  };

  function parseType(raw: string): string {
    const lower = (raw ?? '').trim().toLowerCase();
    return TYPE_MAP[lower] || 'CLINIC';
  }

  function parseCSV(text: string): any[] {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) throw new Error('Le fichier doit contenir au moins un en-tête et une ligne de données');

    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
    const rows: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split('\t');
      if (cells.length < 3) continue; // ignorer les lignes incomplètes

      const row: any = {};
      headers.forEach((h, idx) => { row[h] = (cells[idx] ?? '').trim(); });

      // Mapper les colonnes flexibles
      rows.push({
        name: row['nom'] || row['name'] || row['établissement'] || row['etablissement'] || '',
        type: parseType(row['type'] || 'CLINIC'),
        city: row['ville'] || row['city'] || '',
        address: row['adresse'] || row['address'] || '',
        phone: row['téléphone'] || row['telephone'] || row['tel'] || row['phone'] || '',
        email: row['email'] || row['e-mail'] || '',
        specialties: row['spécialités'] || row['specialites'] || row['specialties'] || '',
        contactFirstName: row['prénom contact'] || row['prenom contact'] || row['prénom'] || row['prenom'] || '',
        contactLastName: row['nom contact'] || '',
        contactPhone: row['tél. contact'] || row['tel contact'] || row['téléphone contact'] || '',
      });
    }

    return rows;
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setResults(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length === 0) {
          setError('Aucune donnée trouvée dans le fichier');
          return;
        }
        // Valider que chaque row a au minimum name, city, email
        const invalid = rows.filter(r => !r.name || !r.city || !r.email);
        if (invalid.length > 0) {
          setError(`${invalid.length} ligne(s) incomplètes (nom, ville, email requis) : ${invalid.slice(0, 3).map((r: any) => r.name || '?').join(', ')}`);
          return;
        }
        setData(rows);
      } catch (err: any) {
        setError(`Erreur de lecture : ${err.message}`);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  async function submit() {
    if (!data?.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ results: ImportResult[]; tempPassword: string }>('/admin/providers/bulk-import', { providers: data });
      setResults(res.results);
      setTempPassword(res.tempPassword);
      onDone();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? "Erreur lors de l'import");
    } finally {
      setBusy(false);
    }
  }

  // Afficher les résultats
  if (results) {
    const created = results.filter(r => r.status === 'created');
    const exists = results.filter(r => r.status === 'exists');
    const errors = results.filter(r => r.status === 'error');

    return (
      <div className="space-y-4">
        <h3 className="font-semibold">Résultat de l'import</h3>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-emerald-50 p-3">
            <div className="text-2xl font-bold text-emerald-700">{created.length}</div>
            <div className="text-xs text-emerald-600">Créés</div>
          </div>
          <div className="rounded-lg bg-yellow-50 p-3">
            <div className="text-2xl font-bold text-yellow-700">{exists.length}</div>
            <div className="text-xs text-yellow-600">Existants</div>
          </div>
          <div className="rounded-lg bg-red-50 p-3">
            <div className="text-2xl font-bold text-red-700">{errors.length}</div>
            <div className="text-xs text-red-600">Erreurs</div>
          </div>
        </div>

        {created.length > 0 && (
          <div className="card-p space-y-2">
            <h4 className="text-sm font-semibold text-emerald-700">✅ Comptes créés</h4>
            <div className="rounded-lg bg-emerald-50 p-3 text-sm">
              <p className="font-medium">Mot de passe temporaire commun :</p>
              <code className="mt-1 block rounded bg-white p-2 font-mono text-lg font-bold text-emerald-800">{tempPassword}</code>
              <p className="mt-1 text-xs text-slate-500">Communiquez ce mot de passe aux prestataires. Ils devront le changer à la première connexion.</p>
            </div>
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-500"><th>Email</th><th>Nom</th><th>Statut</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {created.map(r => (
                    <tr key={r.email}><td className="py-1">{r.email}</td><td>{r.name}</td><td><Badge tone="bg-emerald-100 text-emerald-700">Créé</Badge></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {exists.length > 0 && (
          <details className="card-p">
            <summary className="cursor-pointer text-sm font-semibold text-yellow-700">⚠️ {exists.length} existant(s)</summary>
            <div className="mt-2 max-h-32 overflow-y-auto text-xs">
              {exists.map(r => <p key={r.email}>{r.name} ({r.email}) — déjà existant</p>)}
            </div>
          </details>
        )}

        {errors.length > 0 && (
          <details className="card-p">
            <summary className="cursor-pointer text-sm font-semibold text-red-700">❌ {errors.length} erreur(s)</summary>
            <div className="mt-2 max-h-32 overflow-y-auto text-xs">
              {errors.map(r => <p key={r.email}>{r.name} ({r.email}) — {r.error}</p>)}
            </div>
          </details>
        )}

        <button className="btn-primary w-full" onClick={onClose}>Fermer</button>
      </div>
    );
  }

  // Formulaire d'upload
  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />

      <div className="rounded-lg border-2 border-dashed border-slate-300 p-8 text-center">
        <div className="text-4xl">📄</div>
        <p className="mt-2 text-sm text-slate-600">
          Sélectionnez un fichier <strong>Excel (.xlsx)</strong> ou <strong>CSV séparé par tabulations</strong>
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Colonnes attendues : Nom | Type | Ville | Adresse | Téléphone | Email | Spécialités | Prénom contact | Nom contact | Tél. contact
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,.tsv,.txt"
          className="hidden"
          onChange={handleFile}
        />
        <button className="btn-outline mt-4" onClick={() => fileRef.current?.click()}>
          Choisir un fichier
        </button>
        {fileName && <p className="mt-2 text-sm text-slate-500">{fileName}</p>}
      </div>

      {data && (
        <div className="space-y-3">
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            <strong>{data.length}</strong> prestataire(s) détecté(s) dans le fichier.
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-slate-500">
                  <th className="p-2">Nom</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Ville</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.slice(0, 20).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2">{r.type}</td>
                    <td className="p-2">{r.city}</td>
                    <td className="p-2">{r.email}</td>
                    <td className="p-2">{r.contactFirstName} {r.contactLastName}</td>
                  </tr>
                ))}
                {data.length > 20 && <tr><td colSpan={5} className="p-2 text-center text-slate-400">… et {data.length - 20} autres</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2">
            <button className="btn-outline flex-1" onClick={() => { setData(null); setFileName(''); }}>Annuler</button>
            <button className="btn-primary flex-[2]" disabled={busy} onClick={submit}>
              {busy ? <><Spinner /> Import…</> : `Importer ${data.length} prestataire(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

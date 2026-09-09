import { useEffect, useState } from 'react';
import { getQueue, clearQueue, syncQueue } from '../../../lib/offlineQueue';
import { fmtDate } from '../../../format';
import { Spinner, StatusBadge } from '../../../components/ui';

export default function MobileSyncPage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    loadQueue();
    const saved = localStorage.getItem('lastProviderSync');
    if (saved) setLastSync(saved);
  }, []);

  const loadQueue = async () => {
    const items = await getQueue();
    setQueue(items);
  };

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const processed = await syncQueue();
      setResult(`✅ Synchronisation terminée : ${processed.synced} réussis, ${processed.conflicts.length} conflits`);
      setLastSync(new Date().toISOString());
      localStorage.setItem('lastProviderSync', new Date().toISOString());
      await loadQueue();
    } catch (e: any) {
      setResult(`❌ Erreur : ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Vider la file d\'attente ? Les éléments non synchronisés seront perdus.')) return;
    await clearQueue();
    await loadQueue();
    setResult('File vidée');
  };

  return (
    <div className="px-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-lg">Synchronisation</h1>
        <span className={`badge ${navigator.onLine ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {navigator.onLine ? 'En ligne' : 'Hors-ligne'}
        </span>
      </div>

      <div className="card-p space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Dernière sync</p>
            <p className="text-xs text-slate-500">{lastSync ? fmtDate(lastSync) : 'Jamais'}</p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing || queue.length === 0 || !navigator.onLine}
            className="btn-primary"
          >
            {syncing ? '⟳ Synchronisation…' : `Synchroniser (${queue.length})`}
          </button>
        </div>

        {queue.length > 0 && (
          <div className="pt-3 border-t">
            <h3 className="font-semibold text-sm mb-2">File d'attente ({queue.length})</h3>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {queue.map(item => (
                <div key={item.id} className="text-xs p-2 bg-slate-50 rounded">
                  <div className="flex items-center justify-between">
                    <span className="font-mono">{item.payload?.endpoint ?? 'unknown'}</span>
                    <StatusBadge status={item.payload?.retries > 0 ? 'RETRY' : 'PENDING'} />
                  </div>
                  <p className="text-slate-500 mt-0.5 truncate">{JSON.stringify(item.payload).slice(0, 80)}</p>
                  <p className="text-slate-400">Tentatives : {item.payload?.retries ?? 0} · {fmtDate(new Date(item.timestamp))}</p>
                </div>
              ))}
            </div>
            <button onClick={handleClear} className="btn-outline btn-sm w-full mt-2">Vider la file</button>
          </div>
        )}

        {result && (
          <div className={`p-3 rounded-lg text-sm ${result.startsWith('✅') ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
            {result}
          </div>
        )}
      </div>

      {/* Debug / Test */}
      <details className="card-p">
        <summary className="font-medium text-sm cursor-pointer">Test hors-ligne (dev)</summary>
        <div className="mt-2 space-y-2 text-xs">
          <button className="btn-outline btn-sm w-full" onClick={async () => {
            const { enqueueDeliveryWithHash } = await import('../../../lib/offlineQueue');
            await enqueueDeliveryWithHash({ endpoint: '/provider/verify-qr', body: { token: 'TEST-OFFLINE', type: 'PRESCRIPTION' } }, 'provider');
            await loadQueue();
          }}>
            Ajouter item test
          </button>
          <button className="btn-outline btn-sm w-full" onClick={async () => {
            await clearQueue();
            await loadQueue();
          }}>
            Vider file
          </button>
        </div>
      </details>
    </div>
  );
}
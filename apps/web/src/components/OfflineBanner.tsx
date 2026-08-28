import { useEffect, useState, useCallback } from 'react';
import { getQueue, syncQueue } from '../lib/offlineQueue';

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queueCount, setQueueCount] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);
  const [lastConflicts, setLastConflicts] = useState<Array<{ id: string; reason: string }>>([]);
  const [lastSynced, setLastSynced] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const q = await getQueue();
      setQueueCount(q.length);
    } catch {
      setQueueCount(0);
    }
  }, []);

  const doSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    let attempts = 0;
    const maxRetries = 3;
    while (attempts < maxRetries) {
      try {
        const res = await syncQueue();
        if (res.conflicts.length > 0) {
          setLastConflicts(res.conflicts);
        } else {
          setLastConflicts([]);
        }
        if (res.synced > 0) setLastSynced(res.synced);
        await refresh();
        break;
      } catch (e) {
        attempts++;
        if (attempts >= maxRetries) break;
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
      }
    }
    setSyncing(false);
  }, [syncing, refresh]);

  useEffect(() => {
    refresh();
    const onOnline = () => {
      setIsOnline(true);
      // auto-sync on reconnect
      doSync();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // poll queue length every 5s for other tabs
    const iv = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(iv);
    };
  }, [refresh, doSync]);

  // Also watch for external queue changes
  useEffect(() => {
    const onStorage = () => refresh();
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  const showBanner = !isOnline || queueCount > 0 || lastConflicts.length > 0;

  if (!showBanner) return null;

  return (
    <div className="sticky top-0 z-40">
      {/* Unmistakable offline indicator — no silent drops */}
      <div
        role="alert"
        aria-live="assertive"
        className={
          !isOnline
            ? 'bg-amber-500 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b-4 border-amber-700'
            : queueCount > 0
              ? 'bg-orange-500 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b-4 border-orange-700'
              : 'bg-red-600 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b-4 border-red-800'
        }
      >
        <div className="flex items-center gap-3">
          <span className="text-xl" aria-hidden>{!isOnline ? '📡' : queueCount > 0 ? '⏳' : '⚠️'}</span>
          <div>
            {!isOnline && queueCount > 0 ? (
              <p className="font-bold text-sm">Mode hors ligne — {queueCount} délivrance{queueCount > 1 ? 's' : ''} en attente</p>
            ) : !isOnline ? (
              <p className="font-bold text-sm">Mode hors ligne — les délivrances seront mises en file d’attente</p>
            ) : queueCount > 0 ? (
              <p className="font-bold text-sm">Connexion rétablie — {queueCount} délivrance{queueCount > 1 ? 's' : ''} en attente de synchronisation</p>
            ) : null}
            {lastSynced !== null && lastSynced > 0 && queueCount === 0 && isOnline && !lastConflicts.length && (
              <p className="text-xs opacity-90">{lastSynced} délivrance{lastSynced > 1 ? 's' : ''} synchronisée{lastSynced > 1 ? 's' : ''} avec succès</p>
            )}
            {lastConflicts.length > 0 && (
              <p className="text-xs font-semibold mt-0.5">
                {lastConflicts.length} conflit{lastConflicts.length > 1 ? 's' : ''} détecté{lastConflicts.length > 1 ? 's' : ''} — intervention requise
              </p>
            )}
            {!isOnline && (
              <p className="text-xs opacity-90">Aucune donnée ne sera perdue. La synchronisation se fera automatiquement au retour de la connexion.</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {queueCount > 0 && isOnline && (
            <button
              onClick={doSync}
              disabled={syncing}
              className="btn-sm bg-white text-orange-700 font-bold px-4 py-1.5 rounded-lg hover:bg-orange-50 disabled:opacity-60"
            >
              {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
            </button>
          )}
          {!isOnline && queueCount > 0 && (
            <span className="text-xs bg-white/20 px-2 py-1 rounded-full font-medium">En attente de réseau</span>
          )}
        </div>
      </div>

      {/* Conflict details — must alert manager, not silent drop */}
      {lastConflicts.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 space-y-1">
          {lastConflicts.map(c => (
            <p key={c.id} className="text-sm text-red-800">
              <span className="font-bold">Conflit :</span> {c.reason} — <span className="text-xs text-red-600">ID {c.id.slice(0, 8)}…</span>{' '}
              <span className="text-xs bg-red-100 px-1.5 py-0.5 rounded">Alerte gestionnaire envoyée</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

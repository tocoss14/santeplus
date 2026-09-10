import { useEffect, useRef, useState } from 'react';
import { ApiError, onApiError } from '../api';

interface ToastItem {
  id: number;
  message: string;
  status: number;
}

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 6000;

// Filet de sécurité global : les écrans qui avalent les erreurs de chargement
// (`.catch(() => {})` → liste vide) ne peuvent plus le faire silencieusement.
// Monté une seule fois dans main.tsx, au-dessus de l'application.
export default function ApiErrorToast() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seqRef = useRef(0);

  useEffect(() => {
    return onApiError(err => {
      const id = ++seqRef.current;
      setItems(prev => [
        ...prev.slice(-(MAX_TOASTS - 1)),
        { id, message: err.message, status: err.status },
      ]);
      setTimeout(() => {
        setItems(prev => prev.filter(t => t.id !== id));
      }, AUTO_DISMISS_MS);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      role="alert"
      aria-live="assertive"
    >
      {items.map(t => (
        <div
          key={t.id}
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 shadow-lg"
        >
          <span aria-hidden>⚠️</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-red-800">
              {t.status === 0 ? 'Erreur réseau' : `Erreur ${t.status}`}
            </p>
            <p className="break-words text-xs text-red-700">{t.message}</p>
          </div>
          <button
            onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}
            className="text-red-400 hover:text-red-600"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

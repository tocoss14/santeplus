import { Children, cloneElement, isValidElement, useId, useState } from 'react';
import { statusLabel, statusStyle } from '../format';

/**
 * Image résiliente : si le fichier est absent du stockage (ex. disque
 * éphémère après redéploiement), affiche un avatar de repli au lieu d'une
 * image cassée. L'utilisateur peut alors renvoyer sa photo depuis son profil.
 */
export function PhotoImg({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className={`flex items-center justify-center bg-white/10 text-3xl ${className ?? ''}`} role="img" aria-label={alt}>
        👤
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} onError={() => setBroken(true)} />;
}

export function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone ?? 'bg-slate-100 text-slate-700'}`}>{children}</span>;
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${statusStyle(status)}`}>{label ?? statusLabel(status)}</span>;
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
    </div>
  );
}

export function EmptyState({ icon = '📭', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl">{icon}</div>
      <p className="mt-2 font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500 max-w-sm">{hint}</p>}
    </div>
  );
}

export function StatCard({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: boolean }) {
  return (
    <div className={`card-p ${accent ? 'bg-brand-600 border-brand-600 text-white' : ''}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? 'text-brand-100' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${accent ? '' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${accent ? 'text-brand-100' : 'text-slate-400'}`}>{sub}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div
        className={`bg-white w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Fermer">✕</button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  busy = false,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-slate-600">{message}</p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button className="btn-outline flex-1" disabled={busy} onClick={onClose}>Annuler</button>
        <button className="btn-danger flex-1" disabled={busy} onClick={onConfirm}>
          {busy ? 'Confirmation…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function Field({ label, children, error, hint }: { label: string; children: React.ReactNode; error?: string; hint?: string }) {
  const generatedId = useId();
  let controlId: string | undefined;
  let control = children;
  try {
    const onlyChild = Children.only(children);
    if (
      isValidElement<{ id?: string }>(onlyChild) &&
      typeof onlyChild.type === 'string' &&
      ['input', 'select', 'textarea'].includes(onlyChild.type)
    ) {
      controlId = onlyChild.props.id ?? `${generatedId}-control`;
      control = cloneElement(onlyChild, { id: controlId });
    }
  } catch {
    control = children;
  }

  return (
    <div className="mb-3.5">
      <label className="label" htmlFor={controlId}>{label}</label>
      {control}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {!error && hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

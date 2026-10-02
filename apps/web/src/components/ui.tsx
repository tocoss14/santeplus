import { Children, cloneElement, isValidElement, useId, useState } from 'react';
import { CountUp } from './motion';
import { statusLabel, statusStyle } from '../format';
import { passwordCriteria, type PasswordCriterion } from '../lib/password';

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

/** Bloc de chargement scintillant (classe .skeleton dans index.css). */
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** Grille de cartes fantômes — remplace le Spinner sur les écrans de stats. */
export function SkeletonCards({ rows = 4, className = 'grid-cols-2 lg:grid-cols-4' }: { rows?: number; className?: string }) {
  return (
    <div className={`grid gap-4 ${className}`} role="status" aria-label="Chargement…">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card-p">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

const TABLE_ROWS = [42, 68, 55, 78, 36, 62, 50, 71];

/** Tableau fantôme (en-tête + lignes) — remplace le Spinner sur les pages de listes.
 *  `bare` : sans l'habillage carte, pour s'insérer dans une carte existante. */
export function SkeletonTable({ rows = 6, cols = 4, bare = false, className = '' }: { rows?: number; cols?: number; bare?: boolean; className?: string }) {
  return (
    <div className={`${bare ? '' : 'card overflow-hidden'} ${className}`} role="status" aria-label="Chargement…">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-mist bg-sand/60">
              {Array.from({ length: cols }, (_, i) => (
                <th key={i} className="th"><Skeleton className="h-3" style={{ width: `${28 + ((i * 17) % 34)}%` }} /></th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {Array.from({ length: rows }, (_, r) => (
              <tr key={r} style={{ opacity: 1 - r * 0.09 }}>
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className="td">
                    <Skeleton className="h-3.5" style={{ width: `${TABLE_ROWS[(r + c) % TABLE_ROWS.length]}%` }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Liste fantôme (avatar + deux lignes de texte) — pour les fils et flux d'activité. */
export function SkeletonList({ rows = 5, className = '' }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} role="status" aria-label="Chargement…">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="card flex items-center gap-3 p-4" style={{ opacity: 1 - r * 0.12 }}>
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5" style={{ width: `${TABLE_ROWS[(r * 3) % TABLE_ROWS.length]}%` }} />
            <Skeleton className="mt-2 h-3" style={{ width: `${TABLE_ROWS[(r * 5 + 2) % TABLE_ROWS.length]}%` }} />
          </div>
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Page détail fantôme (titre, blocs de champs, carte latérale) — remplace le Spinner
 *  sur les écrans « détail » (dossier, claim, contrat, formulaire). */
export function SkeletonDetail({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-4 ${className}`} role="status" aria-label="Chargement…">
      <Skeleton className="h-7 w-56" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card-p space-y-3 lg:col-span-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="mt-2 h-20 w-full rounded-xl" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="card-p space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-10 w-full rounded-full" />
        </div>
      </div>
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
  // Compteur animé uniquement pour les valeurs numériques brutes — les valeurs
  // déjà formatées (fcfa, %, texte) restent intactes pour ne rien dénaturer.
  const animatedValue = typeof value === 'number' ? <CountUp value={value} /> : value;
  return (
    <div className={`card-p transition-transform duration-200 motion-safe:hover:-translate-y-0.5 ${accent ? 'bg-brand-600 border-brand-600 text-white' : ''}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${accent ? 'text-brand-100' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-1.5 text-2xl font-bold ${accent ? '' : 'text-slate-900'}`}>{animatedValue}</p>
      {sub && <p className={`mt-0.5 text-xs ${accent ? 'text-brand-100' : 'text-slate-400'}`}>{sub}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 motion-safe:animate-fade-in" onClick={onClose}>
      <div
        className={`bg-white w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto motion-safe:animate-pop-in`}
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

export function Field({ label, children, error, hint, below }: { label: string; children: React.ReactNode; error?: string; hint?: string; below?: React.ReactNode }) {
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
      {below}
    </div>
  );
}

/**
 * Checklist des critères du mot de passe, à afficher sous le champ (Field.below).
 * Chaque critère passe individuellement au vert avec ✓ dès qu'il est respecté —
 * gris tant que non atteint (pas de rouge : c'est un guide, pas une punition).
 */
export function PasswordChecklist({ password, className }: { password: string; className?: string }) {
  const criteria: PasswordCriterion[] = passwordCriteria(password);
  return (
    <ul className={`mt-2 space-y-1 ${className ?? ''}`}>
      {criteria.map(c => (
        <li key={c.key} className={`flex items-center gap-1.5 text-xs ${c.met ? 'text-emerald-600' : 'text-slate-400'}`}>
          <span aria-hidden>{c.met ? '✓' : '○'}</span>
          <span>{c.label}</span>
        </li>
      ))}
    </ul>
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

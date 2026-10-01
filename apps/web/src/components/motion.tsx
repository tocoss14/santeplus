import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Briques d'animation partagées — Tailwind pur, aucune dépendance ajoutée.
 * Toutes respectent prefers-reduced-motion et restent SSR-safes :
 * le rendu serveur (renderToString) affiche directement l'état final.
 */

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/**
 * Apparition douce au scroll (IntersectionObserver, one-shot).
 * Utilisé pour révéler les sections au fur et à mesure du défilement.
 */
export function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** Décalage en ms — pratique pour décaler les cartes d'une même ligne. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -32px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out will-change-transform ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Compteur animé : monte de 0 jusqu'à `value` au montage, puis suit les
 * évolutions de valeur. Rend la valeur finale côté SSR (aucun flash « 0 »).
 */
export function CountUp({
  value,
  duration = 900,
  format,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current ?? 0;
    fromRef.current = value;
    if (prefersReducedMotion() || from === value) {
      setDisplay(value);
      return;
    }
    setDisplay(from);
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format ? format(display) : display}</>;
}

const CONFETTI_COLORS = ['#0D7C5C', '#D94F2B', '#FACC15', '#34D399', '#0F1E2E', '#C2512F'];

/**
 * Pluie de confettis décorative (aria-hidden, pointer-events-none) à afficher
 * sur les moments de succès : paiement confirmé, contrat activé…
 * Le composant parent doit être `relative overflow-hidden`.
 * Répartition déterministe (angle d'or) → identique côté serveur et client.
 */
export function Confetti({ count = 70 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: (i * 137.508) % 100,
        delay: (i % 8) * 0.09,
        duration: 2.2 + ((i * 7) % 12) / 10,
        drift: ((i * 53) % 160) - 80,
        rotate: ((i * 97) % 720) - 360,
        size: 6 + ((i * 13) % 7),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        round: i % 3 === 0,
      })),
    [count],
  );

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {pieces.map(p => (
        <span
          key={p.id}
          className="absolute -top-3 motion-safe:animate-confetti"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.round ? p.size : Math.round(p.size * 0.45),
              background: p.color,
              borderRadius: p.round ? '9999px' : '2px',
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--confetti-drift': `${p.drift}px`,
              '--confetti-rotate': `${p.rotate}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

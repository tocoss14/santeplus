/**
 * Horloge simulée pour les tests sensibles aux dates.
 *
 * Activé uniquement quand CLOCK_DATE est défini (voir vitest.clock.config.ts
 * et scripts-dev/clock-matrix.mjs) : les runs normaux gardent l'horloge réelle.
 *
 * On ne remplace QUE `Date` ; `setTimeout`, `setInterval`, `process.hrtime`
 * et le reste des minuteries restent réels, sinon les tests asynchrones
 * n'avancent plus.
 *
 * Le but est de faire tourner la même spec au 29 février, au 31 d'un mois de
 * 31 jours, à la veille d'un mois de 30 jours, au 31 décembre : les calculs
 * de mois qui conservent le jour du mois débordent et ne se voient que ces
 * jours-là.
 */
const raw = process.env.CLOCK_DATE ?? '';

if (raw) {
  const fixed = Date.parse(raw);
  if (Number.isNaN(fixed)) {
    throw new Error(`CLOCK_DATE invalide (attendu ISO 8601) : "${raw}"`);
  }

  const RealDate = Date;

  const FrozenDate = new Proxy(RealDate, {
    // `new Date()` → instant figé ; `new Date(x)` → comportement normal.
    construct(target, args) {
      return Reflect.construct(target, args.length === 0 ? [fixed] : args);
    },
    // `Date()` appelé sans `new` renvoie une chaîne : même règle.
    apply(target, thisArg, args) {
      return Reflect.apply(target as unknown as (...a: unknown[]) => string, thisArg, args.length === 0 ? [fixed] : args);
    },
    get(target, prop, receiver) {
      if (prop === 'now') return () => fixed;
      return Reflect.get(target, prop, receiver);
    },
  });

  globalThis.Date = FrozenDate as unknown as DateConstructor;
}

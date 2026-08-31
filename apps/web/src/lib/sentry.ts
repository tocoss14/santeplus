// Sentry stub — activer en prod via VITE_SENTRY_DSN (npm i @sentry/react pour activer)
export function initSentry() {
  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  console.log('[sentry] DSN configuré — installer @sentry/react pour activer');
}

/**
 * Rétention / purge — mécanismes désactivés par défaut.
 * Décision métier requise avant activation : durée légale CIMA/Bénin par type
 * (dossiers médicaux, factures, logs). Ne pas activer sans validation juridique.
 *
 * Stockage: SystemConfig keys `retention.careRecordDays`, `retention.invoiceDays`,
 * `retention.auditDays` et optionnel `retention.enabled` (boolean).
 * Désactivé si aucun nombre >0 ni enabled=true.
 */

export const RETENTION_KEYS = [
  'retention.enabled',
  'retention.careRecordDays',
  'retention.invoiceDays',
  'retention.auditDays',
] as const;

export type RetentionKey = typeof RETENTION_KEYS[number];

export function retentionConfigKeys(): string[] {
  return [...RETENTION_KEYS];
}

/**
 * Parse une valeur SystemConfig (JSON string ou brute) en nombre de jours.
 * Retourne null si invalide, manquante ou <=0 (désactivé).
 */
export function parseRetentionDays(value: unknown): number | null {
  if (value == null) return null;
  let parsed: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // fallback: try numeric string
      const n = Number(trimmed);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
      return null;
    }
  }
  const n = Number(parsed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * Détermine si la rétention est activée.
 * - Si `retention.enabled` est explicitement false → désactivé.
 * - Si `retention.enabled` est true → activé.
 * - Sinon, activé si au moins une des durées (careRecordDays/invoiceDays/auditDays) est un nombre >0.
 */
export function isRetentionEnabled(
  config: Record<string, unknown>,
): boolean {
  if ('retention.enabled' in config) {
    const raw = config['retention.enabled'];
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
      try { parsed = JSON.parse(raw); } catch { parsed = raw; }
    }
    if (parsed === false || parsed === 'false') return false;
    if (parsed === true || parsed === 'true') return true;
    // numeric 0/1
    if (typeof parsed === 'number') return parsed !== 0;
  }
  const daysKeys: string[] = ['retention.careRecordDays', 'retention.invoiceDays', 'retention.auditDays'];
  for (const k of daysKeys) {
    const d = parseRetentionDays(config[k]);
    if (d != null && d > 0) return true;
  }
  return false;
}

export function getRetentionDays(
  config: Record<string, unknown>,
  key: string,
): number | null {
  return parseRetentionDays(config[key]);
}

/**
 * Vrai si createdAt est plus ancien que retentionDays.
 * Désactivé (null/undefined/<=0) → false.
 * Utilise Date.now() pour l'âge.
 */
export function isExpired(
  createdAt: Date,
  retentionDays: number | null | undefined,
): boolean {
  if (retentionDays == null || !Number.isFinite(retentionDays) || retentionDays <= 0) return false;
  const ageMs = Date.now() - createdAt.getTime();
  return ageMs > retentionDays * 86400000;
}

/**
 * Variante pure avec `now` injectable (pour tests déterministes).
 */
export function isExpiredAt(
  createdAt: Date,
  retentionDays: number | null | undefined,
  now: Date,
): boolean {
  if (retentionDays == null || !Number.isFinite(retentionDays) || retentionDays <= 0) return false;
  const ageMs = now.getTime() - createdAt.getTime();
  return ageMs > retentionDays * 86400000;
}

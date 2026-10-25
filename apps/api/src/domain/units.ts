/**
 * Unités d'une ligne de réclamation.
 *
 * Le barème (`maxUnitPrice`) est un prix PAR UNITÉ : 45 000 par journée
 * d'hospitalisation, 15 000 par acte, 30 000 par ordonnance. La quantité
 * déclarée sur la ligne dit combien d'unités elle contient, et le moteur
 * plafonne `maxUnitPrice × unités facturables`.
 *
 * Toutes les unités ne multiplient pas le plafond :
 *   - `DAY` (hospitalisation) : 3 journées ⇒ 3 × 45 000 — c'est le cas qui
 *     motive la quantité, un séjour ne doit plus dépendre d'une saisie en
 *     plusieurs lignes ;
 *   - `ACT` (consultation, labo, spécialisé, dentaire) : 2 actes ⇒ 2 × barème ;
 *   - `PRESCRIPTION` : une ordonnance est plafonnée UNE fois, même si elle
 *     contient plusieurs boîtes — la quantité y compte des boîtes, pas des
 *     ordonnances ;
 *   - `EQUIPMENT` / `FORFAIT` (optique, maternité) : plafond annuel forfaitaire,
 *     la quantité ne l'ouvre pas.
 *
 * L'unité est dérivée de la catégorie, jamais stockée sur la ligne : une
 * seconde vérité en base finirait par diverger du barème.
 */

export type ClaimUnit = 'ACT' | 'DAY' | 'PRESCRIPTION' | 'EQUIPMENT' | 'FORFAIT';

const UNIT_BY_CATEGORY: Record<string, ClaimUnit> = {
  HOSPITALIZATION: 'DAY',
  PHARMACY: 'PRESCRIPTION',
  OPTICAL: 'EQUIPMENT',
  MATERNITY: 'FORFAIT',
};

export function claimUnit(categoryId: string): ClaimUnit {
  return UNIT_BY_CATEGORY[categoryId] ?? 'ACT';
}

/** Seules ces unités multiplient le plafond par acte. */
export function multipliesCap(unit: ClaimUnit): boolean {
  return unit === 'DAY' || unit === 'ACT';
}

/** Une année de journées : borne haute de saisie, contre les quantités aberrantes. */
export const MAX_QUANTITY = 365;

/** Entier ≥ 1, au plus MAX_QUANTITY ; toute valeur absente ou invalide vaut 1. */
export function normalizeQuantity(quantity: unknown): number {
  const value = typeof quantity === 'number' ? quantity : Number(quantity);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.floor(value), MAX_QUANTITY);
}

/**
 * Ligne stockée en base → entrée du moteur.
 *
 * Toute ré-estimation d'un dossier déjà enregistré (soumission par l'adhérent,
 * réalisation du tiers payant après correction de quantité) DOIT passer par
 * ici : une projection qui oublierait `quantity` re-plafonnerait un séjour de
 * N journées à une seule, en silence.
 */
export interface StoredClaimLine {
  categoryLabel: string;
  quantity?: number | null;
  amountRequested: number;
}

export function toEstimationItems(lines: StoredClaimLine[]) {
  return lines.map(line => ({
    categoryId: line.categoryLabel,
    quantity: line.quantity ?? 1,
    amountRequested: line.amountRequested,
  }));
}

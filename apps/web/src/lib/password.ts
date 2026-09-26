/**
 * Règle de mot de passe partagée web ↔ API (apps/api/src/modules/auth/dto.ts) :
 * min 8 caractères, au moins une lettre et un chiffre.
 *
 * `passwordFeedback` renvoie la consigne à afficher avec son ton :
 *   - tone 'error'   : saisie non vide mais non conforme (rouge) ;
 *   - tone 'success' : règle respectée (vert + ✓, l'utilisateur est rassuré) ;
 *   - null           : saisie vide (aucune consigne — l'attribut `required` s'en charge).
 */
export function passwordFeedback(pw: string): { hint: string; tone: 'error' | 'success' } | null {
  if (!pw) return null;
  const valid = pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
  return valid
    ? { hint: '✓ Mot de passe valide (8 caractères min., lettres et chiffres)', tone: 'success' }
    : { hint: '8 caractères minimum, lettres et chiffres', tone: 'error' };
}

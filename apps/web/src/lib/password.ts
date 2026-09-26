/**
 * Règle de mot de passe partagée web ↔ API (apps/api/src/modules/auth/dto.ts) :
 * min 8 caractères, au moins une lettre et un chiffre.
 *
 * `passwordCriteria` découpe la règle en critères individuels évalués sur la
 * saisie courante — la checklist affiche chaque critère avec son état :
 *   - { met: false } tant que le critère n'est pas respecté (neutre/gris) ;
 *   - { met: true }  dès qu'il l'est (vert ✓ — pas de rouge, l'absence de
 *     coche suffit à signaler ce qui manque).
 * La saisie vide affiche la liste neutre : elle guide avant même de taper,
 * sans signaler d'erreur.
 */
export interface PasswordCriterion {
  key: string;
  label: string;
  met: boolean;
}

export function passwordCriteria(pw: string): PasswordCriterion[] {
  return [
    { key: 'length', label: '8 caractères minimum', met: pw.length >= 8 },
    { key: 'letter', label: 'Au moins une lettre', met: /[a-zA-Z]/.test(pw) },
    { key: 'digit', label: 'Au moins un chiffre', met: /\d/.test(pw) },
  ];
}

/**
 * Indique si l'ensemble de la règle est respecté (pour le pattern HTML et
 * les boutons conditionnels) — même règle que l'API.
 */
export function isPasswordValid(pw: string): boolean {
  return passwordCriteria(pw).every(c => c.met);
}

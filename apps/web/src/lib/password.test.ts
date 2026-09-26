import { describe, expect, it } from 'vitest';
import { passwordFeedback } from './password';

// Contrat UI : la consigne mot de passe suit la règle API (min 8, lettre, chiffre)
// et pilote le ton d'affichage dans Field (hintTone error/success, null si vide).
describe('passwordFeedback', () => {
  it('renvoie null tant que le champ est vide (le required natif suffit)', () => {
    expect(passwordFeedback('')).toBeNull();
  });

  it.each([
    ['abc', 'trop court, sans chiffre'],
    ['abcdefghij', 'assez long mais sans chiffre'],
    ['12345678', 'assez long mais sans lettre'],
    ['abcde12', '7 caractères : lettre + chiffre mais trop court'],
  ])("renvoie un indice en erreur pour « %s » (%s)", (pw) => {
    const fb = passwordFeedback(pw);
    expect(fb).toEqual({ hint: '8 caractères minimum, lettres et chiffres', tone: 'error' });
  });

  it.each([
    ['abc12345', 'exactement 8 : lettre + chiffre'],
    ['Test1234!', 'mot de passe type de la démo'],
    ['Mot2Passe', 'casse mixte et 9 caractères'],
  ])("renvoie un indice vert pour « %s » (%s)", (pw) => {
    const fb = passwordFeedback(pw);
    expect(fb?.tone).toBe('success');
    expect(fb?.hint).toContain('✓');
    expect(fb?.hint).toContain('valide');
  });
});

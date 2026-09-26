import { describe, expect, it } from 'vitest';
import { isPasswordValid, passwordCriteria } from './password';

// Contrat UI : la checklist découpe la règle API (min 8, lettre, chiffre) en
// critères individuels qui verdissent l'un après l'autre au fil de la saisie.
describe('passwordCriteria', () => {
  it('affiche la liste neutre (rien de coché) tant que le champ est vide', () => {
    expect(passwordCriteria('')).toEqual([
      { key: 'length', label: '8 caractères minimum', met: false },
      { key: 'letter', label: 'Au moins une lettre', met: false },
      { key: 'digit', label: 'Au moins un chiffre', met: false },
    ]);
  });

  it('coche la longueur seule dès 8 caractères', () => {
    const byKey = Object.fromEntries(passwordCriteria('abcdefghij').map(c => [c.key, c.met]));
    expect(byKey).toEqual({ length: true, letter: true, digit: false });
  });

  it('coche lettre et chiffre avant la longueur atteinte (saisie en cours)', () => {
    const byKey = Object.fromEntries(passwordCriteria('ab1').map(c => [c.key, c.met]));
    expect(byKey).toEqual({ length: false, letter: true, digit: true });
  });

  it('coche les trois critères à la borne exacte « abc12345 »', () => {
    expect(passwordCriteria('abc12345').every(c => c.met)).toBe(true);
  });
});

describe('isPasswordValid', () => {
  it.each([
    ['', false, 'vide'],
    ['abcde12', false, '7 caractères : lettre + chiffre mais trop court'],
    ['abcdefghij', false, 'sans chiffre'],
    ['12345678', false, 'sans lettre'],
    ['abc12345', true, 'borne exacte'],
    ['Test1234!', true, 'mot de passe type de la démo'],
  ])('« %s » → %j (%s)', (pw, expected) => {
    expect(isPasswordValid(pw)).toBe(expected);
  });
});

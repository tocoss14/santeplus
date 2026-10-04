import { describe, expect, it, vi } from 'vitest';
import { persistIdentity, validateIdentity } from './SubscribeWizard';

const COMPLETE = { firstName: '  Marie-Josée ', lastName: ' ADJOVI ', birthDate: '1990-01-12' };

describe('validateIdentity', () => {
  it('accepte les trois champs renseignés', () => {
    expect(validateIdentity(COMPLETE)).toBeNull();
  });

  it('refuse un champ vide ou composé seulement d’espaces', () => {
    expect(validateIdentity({ ...COMPLETE, firstName: '   ' })).toBe('Tous les champs sont obligatoires.');
    expect(validateIdentity({ ...COMPLETE, lastName: '' })).toBe('Tous les champs sont obligatoires.');
    expect(validateIdentity({ ...COMPLETE, birthDate: '' })).toBe('Tous les champs sont obligatoires.');
  });
});

describe('persistIdentity (sortie de l’étape 0 en mode correction)', () => {
  // Régression : la vérification de l'acte compare la lecture machine au
  // profil EN BASE. Sans cette écriture, « Corriger cette identité » ne
  // débloquait rien et l'utilisateur rebouclait sur le même refus.
  it('écrit le profil en base, champs trimés', async () => {
    const patchProfile = vi.fn(async () => ({}));
    const failure = await persistIdentity({ profile: COMPLETE, patchProfile });

    expect(failure).toBeNull();
    expect(patchProfile).toHaveBeenCalledTimes(1);
    expect(patchProfile).toHaveBeenCalledWith({
      firstName: 'Marie-Josée',
      lastName: 'ADJOVI',
      birthDate: '1990-01-12',
    });
  });

  it('renvoie une erreur ET n’écrit rien si un champ manque', async () => {
    const patchProfile = vi.fn(async () => ({}));

    const failure = await persistIdentity({
      profile: { ...COMPLETE, birthDate: '' },
      patchProfile,
    });

    expect(failure).toBe('Tous les champs sont obligatoires.');
    expect(patchProfile).not.toHaveBeenCalled();
  });

  it('remonte l’erreur serveur pour que l’utilisateur reste sur l’étape 0', async () => {
    const patchProfile = vi.fn(async () => {
      throw new Error('Identité non modifiable');
    });

    const failure = await persistIdentity({ profile: COMPLETE, patchProfile });

    expect(patchProfile).toHaveBeenCalledTimes(1);
    expect(failure).toContain('Identité non enregistrée');
    expect(failure).toContain('Identité non modifiable');
  });

  it('ne masque pas une erreur sans message', async () => {
    const patchProfile = vi.fn(async () => {
      throw {};
    });

    const failure = await persistIdentity({ profile: COMPLETE, patchProfile });

    expect(failure).toContain('erreur inconnue');
  });
});
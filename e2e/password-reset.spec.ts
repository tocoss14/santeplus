import { test, expect } from '@playwright/test';

// Parcours « mot de passe oublié » côté interface.
// Le token en clair n'existe que dans l'e-mail : on ne teste donc pas la
// réinitialisation complète ici (couverte par tests/password-reset.spec.ts côté
// API), mais bien les deux pages rendues par le front : envoi depuis la page de
// demande, et état « lien invalide » quand le token est inconnu.

test.describe('Mot de passe oublié — interface', () => {
  test('la page de demande est accessible depuis la connexion', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /Mot de passe oublié/ }).click();
    await expect(page).toHaveURL(/\/mot-de-passe-oublie$/);
    await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible();
  });

  test('envoyer une demande affiche la confirmation, sans révéler si le compte existe', async ({ page }) => {
    await page.goto('/mot-de-passe-oublie');
    await page.getByLabel('Email').fill(`e2e.mdp.${Date.now()}@test.bj`);
    await page.getByRole('button', { name: /Envoyer le lien/ }).click();

    await expect(page.getByRole('heading', { name: /Vérifiez votre boîte mail/ })).toBeVisible();
    // Le libellé reste conditionnel : l'API ne dit jamais si le compte existe.
    await expect(page.getByText(/Si un compte/)).toBeVisible();
  });

  test('un lien inconnu mène à l\'écran « lien invalide » et propose d\'en redemander', async ({ page }) => {
    await page.goto(`/reinitialiser-mot-de-passe?token=${'a'.repeat(64)}`);
    await expect(page.getByRole('heading', { name: 'Nouveau mot de passe' })).toBeVisible();
    await expect(page.getByText('Lien invalide ou expiré')).toBeVisible();
    await page.getByRole('link', { name: /Demander un nouveau lien/ }).click();
    await expect(page).toHaveURL(/\/mot-de-passe-oublie$/);
  });

  test('sans token dans l\'URL, la page de reset ne propose aucun formulaire', async ({ page }) => {
    await page.goto('/reinitialiser-mot-de-passe');
    await expect(page.getByText('Lien invalide ou expiré')).toBeVisible();
    await expect(page.getByLabel('Nouveau mot de passe')).toHaveCount(0);
  });
});
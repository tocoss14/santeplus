import { test, expect } from '@playwright/test';

test.describe('Quick wins', () => {
  test('page formules affiche les 4 formules', async ({ page }) => {
    await page.goto('/offres');
    await expect(page.getByRole('cell', { name: 'Essentielle' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Confort' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Famille' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Entreprise', exact: true })).toBeVisible();
  });

  test('FAQ affiche des questions', async ({ page }) => {
    await page.goto('/faq');
    await expect(page.getByText('Foire aux questions')).toBeVisible();
    await expect(page.getByText('Comment souscrire')).toBeVisible();
  });

  test('réclamation affiche le formulaire', async ({ page }) => {
    await page.goto('/reclamation');
    await expect(page.getByText('Réclamation et médiation')).toBeVisible();
    await expect(page.getByRole('button', { name: /Envoyer la réclamation/ })).toBeVisible();
  });
});

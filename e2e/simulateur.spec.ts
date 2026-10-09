/**
 * Anti-régression du simulateur commercial — la valeur PAR DÉFAUT du champ
 * « Dépense simulée » (10 000) doit être ACCEPTÉE par la validation native du
 * navigateur et produire une simulation complète.
 *
 * Régression historique (constatée en prod le 2026-10-08) : le champ portait
 * `min={1} step={500}` → 10 000 (et tout montant non ≡ 1 mod 500) déclenchait
 * l'alerte native « les deux valeurs valides les plus proches sont 9501 et
 * 10001 », le clic sur « Simuler » ne lançait AUCUNE requête et aucun résultat
 * n'apparaissait. Corrigé dans apps/web/src/pages/Simulateur.tsx (step parasites
 * retiré — le backend accepte tout montant via Math.max(1, …)), déployé le
 * 2026-10-08.
 *
 * Prérequis : `npm run dev` (API :4000 + Vite :3000) avant `npm run e2e`.
 * Voir playwright.config.ts (baseURL http://localhost:3000).
 */
import { test, expect } from '@playwright/test';

test.use({ channel: 'chromium' });

test('dépense par défaut 10 000 : valide nativement et produit une simulation', async ({ page }) => {
  await page.goto('/simulateur');

  const depense = page.getByLabel('Dépense simulée');
  await expect(depense).toHaveValue('10000');

  // Le cœur de l'anti-régression : l'attribut step interdisait 10 000.
  const valide = await depense.evaluate((el: HTMLInputElement) => el.validity.valid);
  expect(
    valide,
    'la valeur par défaut 10 000 doit satisfaire la validation native (régression step=500 dans Simulateur.tsx ?)',
  ).toBe(true);

  // Le bouton ne devient « Simuler » (actif) qu'une fois les formules
  // chargées depuis l'API : ce step prouve aussi API + CORS locaux vivants.
  const simuler = page.getByRole('button', { name: 'Simuler' });
  await expect(simuler).toBeEnabled({ timeout: 20_000 });

  // Capturée AVANT le clic : preuve que la validation native n'a pas bloqué
  // la soumission (la régression empêchait tout POST).
  const reponseMoteur = page.waitForResponse(
    r => r.request().method() === 'POST' && r.url().includes('/api/cts/simulate'),
  );
  await simuler.click();

  expect((await reponseMoteur).status(), 'POST /api/cts/simulate attendu en 201').toBe(201);

  // Résultat affiché : projection commerciale + prise en charge du moteur réel.
  await expect(page.getByText('Résultat projeté')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Prise en charge simulée')).toBeVisible();
});

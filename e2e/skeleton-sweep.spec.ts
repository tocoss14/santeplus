/**
 * Balayage dynamique des skeletons de chargement — espaces member, prestataire
 * desktop et mobile (les 31 écrans convertis, + les écrans déjà skeleton du
 * pass précédent). Complément statique : apps/web/src/pages/loaders.guard.test.ts.
 *
 * Méthode : TOUTES les réponses /api sont retardées de 1,2 s. Pendant cette
 * fenêtre de chargement, chaque page « avec données » doit :
 *   1. montrer un skeleton ([role="status"], aria-label « Chargement… ») ;
 *   2. ne montrer AUCUN spinner (.animate-spin) ;
 * et une fois les données arrivées, plus aucun skeleton ne doit rester.
 *
 * Les pages formulaire (vérifier une carte, nouvelle prise en charge, scan,
 * sync, hospitalisation) n'ont pas de chargement de données : on vérifie
 * seulement qu'elles montent, restent sur leur route et sans spinner.
 *
 * Prérequis : API sur :4100 (API_URL) lancée avec E2E=1 (le sweep multiplie
 * les logins, il faut les plafonds relevés), Vite sur :3000 avec VITE_API_PORT=4100.
 */
import { test, expect, type Page } from '@playwright/test';

const DELAY_MS = 1200;

/** true = la page charge des données → skeleton attendu ; false = page formulaire → montée simple. */
type Route = [path: string, skeleton: boolean];

const MEMBER: Route[] = [
  ['/app', true],
  ['/app/contrat', true],
  ['/app/carte', true],
  ['/app/soins', true],
  ['/app/ordonnances', true],
  ['/app/consultations', true],
  ['/app/beneficiaires', true],
  ['/app/remboursements', true],
  ['/app/prestataires', true],
  ['/app/profil', true],
  ['/app/notifications', true],
  ['/app/souscrire', true],
];

const PROVIDER: Route[] = [
  ['/prestataire', true],
  ['/prestataire/activite', true],
  ['/prestataire/consultations', true],
  ['/prestataire/ordonnances', true],
  ['/prestataire/delivrances', true],
  ['/prestataire/dossiers', true],
  ['/prestataire/paiements', true],
  ['/prestataire/etablissement', true],
  ['/prestataire/personnel', true],
  ['/prestataire/notifications', true],
  ['/prestataire/profil', true],
  // Formulaires / écrans sans chargement de données au montage :
  ['/prestataire/verifier', false],
  ['/prestataire/nouvelle', false],
  ['/prestataire/hospitalisation', false],
  ['/prestataire/prises', false],
];

const PROVIDER_MOBILE: Route[] = [
  ['/prestataire/mobile', true],
  ['/prestataire/mobile/factures', true],
  ['/prestataire/mobile/rejets', true],
  ['/prestataire/mobile/tp', false],
  ['/prestataire/mobile/sync', false],
  ['/prestataire/mobile/scan', false],
];

test.use({ channel: 'chromium' });

/** Retarde toutes les réponses /api pour étirer la fenêtre de chargement. */
async function retarderApi(page: Page) {
  await page.route('**/api/**', async route => {
    await new Promise(r => setTimeout(r, DELAY_MS));
    await route.continue();
  });
}

async function uiLogin(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill('Demo1234!');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).not.toHaveURL(/login/);
}

async function verifierMontee(page: Page, path: string, skeleton: boolean) {
  await page.goto(path);
  // La page doit rester sur sa route (ni redirect login, ni 404)…
  await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, '\\/')}$`), { timeout: 20_000 });
  await expect(page.locator('body')).not.toBeEmpty();
  // …et ne JAMAIS montrer un spinner de chargement.
  expect(await page.locator('.animate-spin').count(), `spinner résiduel sur ${path}`).toBe(0);

  if (!skeleton) return;

  const status = page.locator('[role="status"]');
  // Pendant la fenêtre de chargement retardée : skeleton visible…
  await expect(status.first()).toBeVisible({ timeout: 20_000 });
  // …puis remplacé par le contenu réel.
  await expect(status).toBeHidden({ timeout: 15_000 });
  expect(await page.locator('.skeleton').count(), `skeleton résiduel sur ${path}`).toBe(0);
}

for (const [routes, email, label] of [
  [MEMBER, 'jean@demo.bj', 'member'],
  [PROVIDER, 'prestataire@santeplus.bj', 'prestataire'],
  [PROVIDER_MOBILE, 'prestataire@santeplus.bj', 'prestataire mobile'],
] as const) {
  test.describe(`skeletons ${label}`, () => {
    for (const [path, skeleton] of routes) {
      test(`${path}${skeleton ? '' : ' (montée sans chargement)'}`, async ({ page }) => {
        await uiLogin(page, email);
        await retarderApi(page);
        await verifierMontee(page, path, skeleton);
      });
    }
  });
}

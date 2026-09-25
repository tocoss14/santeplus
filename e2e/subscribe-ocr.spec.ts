/**
 * E2E navigateur : souscription membre avec pré-remplissage OCR de l'acte.
 *
 * Scénario : un membre fraîchement inscrit souscrit avec l'acte de naissance
 * scanné de test (.freebuff/acte-test-scanne.pdf — image sous PDF, sans texte
 * natif, chemin rasterisation → tesseract). Le wizard doit :
 *   1. téléverser le document à l'étape « Acte de naissance » ;
 *   2. extraire les données par OCR (rasterisation pdfjs+canvas → tesseract) ;
 *   3. pré-remplir Prénom/Nom/Date dans le formulaire de recopie ;
 *   4. valider la vérification (identité de l'étape 1 = données de l'acte)
 *      puis laisser poursuivre jusqu'au paiement mock.
 *
 * Prérequis : API sur :4100 (API_URL), Vite sur :3000 avec VITE_API_PORT=4100.
 * Le compte de test est créé via l'API avec l'identité de l'acte (Marie-Josée
 * ADJOVI, née le 12/01/1990 à Cotonou) : la vérification compare l'acte au
 * profil — ils doivent coïncider.
 */
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { uid, apiContext } from './helpers';

// e2e/ vit à la racine du dépôt — __dirname survit au transpile CJS de Playwright.
const root = join(__dirname, '..');
const SCAN_PDF = join(root, '.freebuff', 'acte-test-scanne.pdf');

// L'acte scanné est un artefact généré (hors dépôt) : on le fabrique au besoin.
if (!existsSync(SCAN_PDF)) {
  const r = spawnSync(process.execPath, [join(root, 'scripts-dev', 'make-birth-cert-fixture.mjs')], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('Impossible de générer .freebuff/acte-test-scanne.pdf');
}

// Identité portée par l'acte scanné de test (voir scripts-dev/make-birth-cert-fixture.mjs)
const ACTE = { firstName: 'Marie-Josée', lastName: 'ADJOVI', birthDate: '1990-01-12' };

// Le headless shell dédié n'est pas installé sur ce poste : on lance le
// Chromium complet (headless « new ») déjà présent.
test.use({ channel: 'chromium' });

test.describe('Souscription: pré-remplissage OCR de l’acte de naissance scanné', () => {
  // Boot du worker tesseract (~15 s au premier appel du process API) + OCR du scan.
  test.setTimeout(180_000);
  test('upload du scan → champs pré-remplis → vérification → devis → paiement mock', async ({ page }) => {
    // 1. Compte membre avec l'identité exacte de l'acte (la vérification compare acte ↔ profil)
    const email = `e2e_ocr_${uid()}@test.bj`;
    const ctx = await apiContext();
    const reg = await ctx.post('/api/auth/register', {
      data: {
        firstName: ACTE.firstName,
        lastName: ACTE.lastName,
        email,
        password: 'Test1234!',
        phone: '+229 9' + Math.floor(10000000 + Math.random() * 90000000),
        birthDate: ACTE.birthDate,
        gender: 'F',
      },
    });
    expect(reg.ok()).toBeTruthy();
    await ctx.dispose();

    // 2. Login via l'UI (cookies httpOnly posés par le serveur). L'attente est
    //    bornée à /app pour distinguer les paths (login OK) des moteurs externes.
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mot de passe').fill('Test1234!');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForURL('**/app**', { timeout: 30_000 });
    // Boot SPA : l'hydration auth (probe + /auth/me) peut re-render après le
    // chargement — on attends l'étape 0 du wizard, seul signal fiable.
    await page.goto('/app/souscrire');
    await expect(page.getByText(/Informations d'identité/)).toBeVisible({ timeout: 30_000 });

    // 3. Wizard étape 0 : identité initiale (= acte)
    await page.getByLabel('Prénom(s) *').fill(ACTE.firstName);
    // exact: true — « nom(s) » est une sous-chaîne de « Prénom(s) » (matching Playwright non-exact par défaut).
    await page.getByLabel('Nom(s) *', { exact: true }).fill(ACTE.lastName);
    await page.getByLabel('Date de naissance *').fill(ACTE.birthDate);
    await page.getByRole('button', { name: /Continuer vers le choix de la formule/ }).click();

    // 4. Étape 1 : choisir la première formule proposée
    await expect(page.getByText('Comparez nos formules')).toBeVisible();
    await page.locator('button', { hasText: /\/mois/ }).first().click();
    await page.getByRole('button', { name: /Choisir / }).click();

    // 5. Étape 2 : upload de l'acte scanné (PDF image, sans couche texte)
    await expect(page.getByText('Acte de naissance obligatoire')).toBeVisible();
    await page.setInputFiles('input[type=file]', SCAN_PDF);
    await expect(page.getByText('Vérification requise')).toBeVisible();

    // 6. Pré-remplissage OCR observable : on recopie d'abord MAL le prénom
    //    (l'utilisateur se trompe), puis on lance la vérification. Le wizard
    //    uploade, extrait par OCR (rasterisation → tesseract) et écrase les
    //    champs avec les données lues sur l'acte — la vérification, qui compare
    //    les valeurs saisies AVANT pré-remplissage, échoue.
    await page.getByLabel('Prénom sur l’acte').fill('Marie');
    await page.getByLabel('Nom sur l’acte', { exact: true }).fill(ACTE.lastName);
    await page.getByLabel('Date de naissance sur l’acte').fill(ACTE.birthDate);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Lancer la vérification' }).click();

    // Les champs sont corrigés par l'OCR extrait du scan (Marie → Marie-Josée).
    await expect(page.getByLabel('Prénom sur l’acte', { exact: true })).toHaveValue(ACTE.firstName, { timeout: 60_000 });
    await expect(page.getByLabel('Nom sur l’acte', { exact: true })).toHaveValue(ACTE.lastName);
    await expect(page.getByLabel('Date de naissance sur l’acte', { exact: true })).toHaveValue(ACTE.birthDate);
    await expect(page.getByText(/Prénom différent/)).toBeVisible(); // 1ʳᵉ tentative : mismatch assumé

    // 7. Seconde vérification avec les valeurs pré-remplies : passe.
    await page.getByRole('button', { name: 'Lancer la vérification' }).click();
    await expect(page.getByText('Vérification réussie')).toBeVisible({ timeout: 30_000 });

    // 8. Étapes suivantes — ancres sur des textes UNIQUES au corps de chaque
    //    étape : les noms d'étapes apparaissent aussi dans la barre de
    //    progression (toujours visibles) et ne peuvent pas servir d'ancre.
    //    NB : garanties et photo partagent le même handler goStep4 → un seul
    //    clic depuis les garanties saute la page photo et arrive aux bénéficiaires.
    await page.getByRole('button', { name: 'Continuer' }).click(); // sortie de l'étape acte → garanties
    await expect(page.getByText(/formule figée/)).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click(); // garanties → bénéficiaires (photo sautée)
    await expect(page.getByText(/Ajoutez vos ayants droit/)).toBeVisible();
    await page.getByRole('button', { name: 'Voir mon devis' }).click(); // → devis
    await expect(page.getByText('Récapitulatif')).toBeVisible();
    await page.getByRole('button', { name: 'Valider ma souscription' }).click();
    await expect(page.getByText(/Contrat .+ créé/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /Payer/ }).click();
    await expect(page.getByText('Paiement confirmé — contrat actif !')).toBeVisible({ timeout: 30_000 });
  });
});

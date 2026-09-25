/**
 * E2E navigateur : souscription membre avec pré-remplissage OCR de l'acte.
 *
 * Trois scénarios sur le même parcours (upload à l'étape « Acte de naissance »,
 * vérification, devis, paiement mock) — ils diffèrent par l'attachement
 * téléversé et illustrent les trois issues de l'extraction :
 *   1. l'acte scanné droit (.freebuff/acte-test-scanne.pdf — image sous PDF,
 *      sans texte natif, chemin rasterisation → tesseract) : pré-remplissage ;
 *   2. l'acte stocké de travers (.freebuff/acte-test-pivote.png — PNG tourné
 *      de 90° horaire) : l'OCR droit n'extrait rien, l'OSD détecte la
 *      rotation, la seconde passe OCR extrait les champs — le pré-remplissage
 *      doit rester observable au niveau UI ;
 *   3. l'acte illisible (.freebuff/acte-test-illisible.png — image sans
 *      texte) : l'API répond { extracted: null }, le wizard n'écrase PAS la
 *      saisie manuelle — qui est alors la seule voie —, signale l'échec
 *      d'extraction par une note, et passe la vérification dès que
 *      l'utilisateur recopie correctement son acte.
 *
 * Prérequis : API sur :4100 (API_URL), Vite sur :3000 avec VITE_API_PORT=4100.
 * Le compte de test est créé via l'API avec l'identité de l'acte (Marie-Josée
 * ADJOVI, née le 12/01/1990 à Cotonou) : la vérification compare la saisie au
 * profil — ils doivent coïncider.
 */
import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { uid, apiContext } from './helpers';

// e2e/ vit à la racine du dépôt — __dirname survit au transpile CJS de Playwright.
const root = join(__dirname, '..');
const SCAN_PDF = join(root, '.freebuff', 'acte-test-scanne.pdf');
const ROT_PNG = join(root, '.freebuff', 'acte-test-pivote.png');
const UNREADABLE_PNG = join(root, '.freebuff', 'acte-test-illisible.png');

// Les actes de test sont des artefacts générés (hors dépôt) : on les fabrique
// au besoin — le script des fixtures pivotées régénère d'abord la base.
for (const [fixture, script] of [
  [SCAN_PDF, 'make-birth-cert-fixture.mjs'],
  [ROT_PNG, 'make-birth-cert-rotated-fixture.mjs'],
  [UNREADABLE_PNG, 'make-birth-cert-unreadable-fixture.mjs'],
] as const) {
  if (!existsSync(fixture)) {
    const r = spawnSync(process.execPath, [join(root, 'scripts-dev', script)], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`Impossible de générer ${fixture}`);
  }
}

// Identité portée par l'acte scanné de test (voir scripts-dev/make-birth-cert-fixture.mjs)
const ACTE = { firstName: 'Marie-Josée', lastName: 'ADJOVI', birthDate: '1990-01-12' };

// Le headless shell dédié n'est pas installé sur ce poste : on lance le
// Chromium complet (headless « new ») déjà présent.
test.use({ channel: 'chromium' });

test.describe('Souscription: pré-remplissage OCR de l’acte de naissance scanné', () => {
  // Boot du worker tesseract (~15 s au premier appel du process API) + OSD + OCR.
  test.setTimeout(180_000);

  /**
   * Inscription (identité = acte), login UI, identité initiale, formule, puis
   * upload de l'acte donné. S'arrête à l'étape acte avec « Vérification
   * requise » affiché — le point de départ commun des trois scénarios.
   */
  async function reachActeVerification(page: import('@playwright/test').Page, actePath: string) {
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

    // 5. Étape 2 : upload de l'acte (le décodage image/PDF est en aval)
    await expect(page.getByText('Acte de naissance obligatoire')).toBeVisible();
    await page.setInputFiles('input[type=file]', actePath);
    await expect(page.getByText('Vérification requise')).toBeVisible();
  }

  /** Recopie (juste ou fausse) de l'acte + attestation + lancement de la vérification. */
  async function copyAndVerify(page: import('@playwright/test').Page, firstName: string) {
    await page.getByLabel('Prénom sur l’acte').fill(firstName);
    await page.getByLabel('Nom sur l’acte', { exact: true }).fill(ACTE.lastName);
    await page.getByLabel('Date de naissance sur l’acte').fill(ACTE.birthDate);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Lancer la vérification' }).click();
  }

  /**
   * Étapes après une vérification réussie — ancres sur des textes UNIQUES au
   * corps de chaque étape : les noms d'étapes apparaissent aussi dans la barre
   * de progression (toujours visibles) et ne peuvent pas servir d'ancre.
   * NB : garanties et photo partagent le même handler goStep4 → un seul clic
   * depuis les garanties saute la page photo et arrive aux bénéficiaires.
   */
  async function finishAfterVerification(page: import('@playwright/test').Page) {
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
  }

  test('upload du scan droit → champs pré-remplis → vérification → devis → paiement mock', async ({ page }) => {
    await reachActeVerification(page, SCAN_PDF);

    // Pré-remplissage OCR observable : on recopie d'abord MAL le prénom
    // (l'utilisateur se trompe), puis on lance la vérification. Le wizard
    // uploade, extrait par OCR (rasterisation → tesseract) et écrase les
    // champs avec les données lues sur l'acte — la vérification, qui compare
    // les valeurs saisies AVANT pré-remplissage, échoue.
    await copyAndVerify(page, 'Marie');

    // Les champs sont corrigés par l'OCR extrait du scan (Marie → Marie-Josée).
    await expect(page.getByLabel('Prénom sur l’acte', { exact: true })).toHaveValue(ACTE.firstName, { timeout: 60_000 });
    await expect(page.getByLabel('Nom sur l’acte', { exact: true })).toHaveValue(ACTE.lastName);
    await expect(page.getByLabel('Date de naissance sur l’acte', { exact: true })).toHaveValue(ACTE.birthDate);
    await expect(page.getByText(/Prénom différent/)).toBeVisible(); // 1ʳᵉ tentative : mismatch assumé
    // OCR réussi : la note d'échec d'extraction ne doit pas apparaître.
    await expect(page.getByText(/Extraction automatique impossible/)).toHaveCount(0);

    // Seconde vérification avec les valeurs pré-remplies : passe.
    await page.getByRole('button', { name: 'Lancer la vérification' }).click();
    await expect(page.getByText('Vérification réussie')).toBeVisible({ timeout: 30_000 });
    await finishAfterVerification(page);
  });

  test('upload du scan pivoté (90°) → OSD redresse → champs pré-remplis → paiement mock', async ({ page }) => {
    await reachActeVerification(page, ROT_PNG);
    await copyAndVerify(page, 'Marie');

    await expect(page.getByLabel('Prénom sur l’acte', { exact: true })).toHaveValue(ACTE.firstName, { timeout: 60_000 });
    await expect(page.getByLabel('Nom sur l’acte', { exact: true })).toHaveValue(ACTE.lastName);
    await expect(page.getByLabel('Date de naissance sur l’acte', { exact: true })).toHaveValue(ACTE.birthDate);
    await expect(page.getByText(/Prénom différent/)).toBeVisible();

    await page.getByRole('button', { name: 'Lancer la vérification' }).click();
    await expect(page.getByText('Vérification réussie')).toBeVisible({ timeout: 30_000 });
    await finishAfterVerification(page);
  });

  test('acte illisible → aucun pré-remplissage, la saisie manuelle est conservée → paiement mock', async ({ page }) => {
    await reachActeVerification(page, UNREADABLE_PNG);

    // Recopie fausse : « Alphonse » ne correspond ni à l'acte ni au profil.
    // L'acte ne contient aucun texte exploitable : l'API répond { extracted:
    // null } et le wizard ne touche PAS aux champs — la saisie manuelle est
    // la voie normale, la vérification échoue sur la recopie fausse.
    await copyAndVerify(page, 'Alphonse');

    await expect(page.getByText(/Prénom différent/)).toBeVisible({ timeout: 30_000 });
    // Aucun écrasement OCR : la saisie de l'utilisateur est intacte.
    await expect(page.getByLabel('Prénom sur l’acte', { exact: true })).toHaveValue('Alphonse');
    await expect(page.getByLabel('Nom sur l’acte', { exact: true })).toHaveValue(ACTE.lastName);
    await expect(page.getByLabel('Date de naissance sur l’acte', { exact: true })).toHaveValue(ACTE.birthDate);
    // L'échec d'extraction est signalé : la recopie manuelle est la voie normale,
    // elle doit être faite avec d'autant plus de soin.
    await expect(page.getByText(/Extraction automatique impossible/)).toBeVisible();

    // L'utilisateur corrige lui-même sa recopie : la vérification passe.
    await page.getByLabel('Prénom sur l’acte', { exact: true }).fill(ACTE.firstName);
    await page.getByRole('button', { name: 'Lancer la vérification' }).click();
    await expect(page.getByText('Vérification réussie')).toBeVisible({ timeout: 30_000 });
    await finishAfterVerification(page);
  });
});

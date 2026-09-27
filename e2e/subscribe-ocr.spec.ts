/**
 * E2E navigateur : souscription membre — acte de naissance lu par OCR et VERROUILLÉ.
 *
 * Contrat (verrouillage OCR) : dès qu'un acte est ajouté, le serveur l'extrait
 * par OCR et l'affiche en lecture seule — les champs « sur l'acte » ne sont PAS
 * modifiables. La vérification relit l'acte côté serveur (le client n'envoie
 * rien sur l'identité de l'acte) : elle n'est valide que si la lecture machine
 * correspond au profil. L'OCR ne doit jamais bloquer : sur un document
 * illisible ({ extracted: null }), la recopie manuelle redevient la voie
 * normale — champs éditables, note affichée — et le serveur ne l'accepte que
 * parce que sa propre lecture n'a rien produit.
 *
 * Trois scénarios sur le même parcours (upload à l'étape « Acte de naissance »,
 * vérification, devis, paiement mock) :
 *   1. l'acte scanné droit (.freebuff/acte-test-scanne.pdf — image sous PDF,
 *      sans texte natif, chemin rasterisation → tesseract) : champs pré-remplis
 *      ET verrouillés sans aucune saisie de l'utilisateur ;
 *   2. les actes stockés de travers (.freebuff/acte-test-pivote-D.png —
 *      PNG tourné de D° horaire, D ∈ {90, 180, 270}) : l'OSD détecte la
 *      rotation, la seconde passe OCR extrait les champs → même verrouillage ;
 *   3. l'acte illisible (.freebuff/acte-test-illisible.png — image sans
 *      texte) : champs vides et éditables, recopie manuelle soignée →
 *      vérification passe (source='manual' côté serveur).
 *
 * Prérequis : API sur :4100 (API_URL), Vite sur :3000 avec VITE_API_PORT=4100.
 * Le compte de test est créé via l'API avec l'identité de l'acte (Marie-Josée
 * ADJOVI, née le 12/01/1990 à Cotonou) : la vérification compare la lecture
 * OCR au profil — ils doivent coïncider.
 */
import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { uid, apiContext } from './helpers';

// e2e/ vit à la racine du dépôt — __dirname survit au transpile CJS de Playwright.
const root = join(__dirname, '..');
const SCAN_PDF = join(root, '.freebuff', 'acte-test-scanne.pdf');
const UNREADABLE_PNG = join(root, '.freebuff', 'acte-test-illisible.png');
const ROT_DEGREES = [90, 180, 270] as const;
const rotPng = (D: number) => join(root, '.freebuff', `acte-test-pivote-${D}.png`);

// Les actes de test sont des artefacts générés (hors dépôt) : on les fabrique
// au besoin — le script des fixtures pivotées régénère d'abord la base.
for (const [fixture, script] of [
  [SCAN_PDF, 'make-birth-cert-fixture.mjs'],
  [UNREADABLE_PNG, 'make-birth-cert-unreadable-fixture.mjs'],
  ...ROT_DEGREES.map((D) => [rotPng(D), 'make-birth-cert-rotated-fixture.mjs'] as const),
] as const) {
  if (!existsSync(fixture)) {
    const r = spawnSync(process.execPath, [join(root, 'scripts-dev', script)], { cwd: root, stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`Impossible de générer ${fixture}`);
  }
}

// Identité portée par l'acte scanné de test (voir scripts-dev/make-birth-cert-fixture.mjs)
const ACTE = { firstName: 'Marie-Josée', lastName: 'ADJOVI', birthDate: '1990-01-12' };

// Le champ d'inscription porte exactement ce label (sans « actuel » ni « * ») :
// getByLabel(..., { exact: true }) vise le bon champ sans toucher aux autres.
const PASSWORD_LABEL = 'Mot de passe';

// Le headless shell dédié n'est pas installé sur ce poste : on lance le
// Chromium complet (headless « new ») déjà présent.
test.use({ channel: 'chromium' });

test.describe('Souscription: acte de naissance lu par OCR et verrouillé', () => {
  // Boot du worker tesseract (~15 s au premier appel du process API) + OSD + OCR.
  test.setTimeout(180_000);

  /**
   * Inscription (identité = acte), login UI, identité initiale, formule, puis
   * upload de l'acte donné. S'arrête à l'étape acte avec « Vérification
   * requise » affiché — le point de départ commun des trois scénarios.
   */
  async function reachActeVerification(page: import('@playwright/test').Page, actePath: string) {
    // 1. Compte membre avec l'identité exacte de l'acte (la vérification compare lecture OCR ↔ profil)
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

    // 5. Étape 2 : upload de l'acte (l'extraction OCR est déclenchée par l'ajout du fichier)
    await expect(page.getByText('Acte de naissance obligatoire')).toBeVisible();
    await page.setInputFiles('input[type=file]', actePath);
    await expect(page.getByText('Vérification requise')).toBeVisible();
  }

  /**
   * Affirme que les trois champs « sur l'acte » portent la lecture OCR
   * verrouillée : valeurs pré-remplies, attribut readonly (non modifiables),
   * note 🔒 visible, et AUCUNE note d'échec d'extraction.
   */
  async function expectOcrLocked(page: import('@playwright/test').Page) {
    const firstName = page.getByLabel('Prénom sur l’acte', { exact: true });
    await expect(firstName).toHaveValue(ACTE.firstName, { timeout: 60_000 });
    await expect(page.getByLabel('Nom sur l’acte', { exact: true })).toHaveValue(ACTE.lastName);
    await expect(page.getByLabel('Date de naissance sur l’acte', { exact: true })).toHaveValue(ACTE.birthDate);

    // Verrouillage : un champ readonly n'est pas éditable — l'utilisateur ne
    // peut rien y modifier.
    await expect(firstName).not.toBeEditable();
    await expect(page.getByLabel('Nom sur l’acte', { exact: true })).not.toBeEditable();
    await expect(page.getByLabel('Date de naissance sur l’acte', { exact: true })).not.toBeEditable();
    await expect(page.getByText(/non modifiables/)).toBeVisible();
    // L'extraction a réussi : la note d'échec ne doit pas apparaître.
    await expect(page.getByText(/Extraction automatique impossible/)).toHaveCount(0);
  }

  /** Attestation + lancement de la vérification. */
  async function attestAndVerify(page: import('@playwright/test').Page) {
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

  test('scan droit → lecture OCR, champs verrouillés sans saisie → vérification → paiement mock', async ({ page }) => {
    await reachActeVerification(page, SCAN_PDF);

    // L'acte a été lu automatiquement : les champs sont remplis ET verrouillés
    // sans que l'utilisateur ait rien saisi — ils ne sont pas modifiables.
    await expectOcrLocked(page);

    // Aucune recopie, aucune correction possible : la vérification compare la
    // lecture serveur au profil et passe (acte conforme au compte).
    await attestAndVerify(page);
    await expect(page.getByText('Vérification réussie')).toBeVisible({ timeout: 30_000 });
    await finishAfterVerification(page);
  });

  for (const D of ROT_DEGREES) {
    test(`scan pivoté (${D}°) → OSD redresse → OCR verrouillé → vérification → paiement mock`, async ({ page }) => {
      await reachActeVerification(page, rotPng(D));

      // La cascade (bande/OSD/redressement) extrait malgré la rotation : les
      // champs affichent la lecture verrouillée, jamais modifiables.
      await expectOcrLocked(page);

      await attestAndVerify(page);
      await expect(page.getByText('Vérification réussie')).toBeVisible({ timeout: 30_000 });
      await finishAfterVerification(page);
    });
  }

  test('acte illisible → repli manuel éditable, la recopie soignée passe → paiement mock', async ({ page }) => {
    await reachActeVerification(page, UNREADABLE_PNG);

    // Rien d'exploitable sur ce document : l'OCR n'a rien extrait, les champs
    // restent VIDES et ÉDITABLES — la saisie manuelle est la voie normale,
    // signalée par la note d'échec d'extraction.
    await expect(page.getByText(/Extraction automatique impossible/)).toBeVisible({ timeout: 60_000 });
    const firstName = page.getByLabel('Prénom sur l’acte', { exact: true });
    await expect(firstName).toHaveValue('');
    await expect(page.getByLabel('Nom sur l’acte', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Date de naissance sur l’acte', { exact: true })).toHaveValue('');
    await expect(firstName).toBeEditable();

    // Recopie manuelle exacte (l'acte papier est sous les yeux) : la
    // vérification passe, le serveur n'accepte la recopie que parce que sa
    // propre lecture n'a rien produit.
    await firstName.fill(ACTE.firstName);
    await page.getByLabel('Nom sur l’acte', { exact: true }).fill(ACTE.lastName);
    await page.getByLabel('Date de naissance sur l’acte', { exact: true }).fill(ACTE.birthDate);
    await attestAndVerify(page);
    await expect(page.getByText('Vérification réussie')).toBeVisible({ timeout: 30_000 });
    await finishAfterVerification(page);
  });

  test.describe.serial('Inscription: feedback du mot de passe', () => {
    test('les critères (longueur, lettre, chiffre) passent au vert un par un', async ({ page }) => {
      await page.goto('/register');

      const pw = page.getByLabel(PASSWORD_LABEL, { exact: true });
      const item = (label: string) => page.locator('li', { hasText: label });
      const GREY = 'rgb(148, 163, 184)'; // slate-400 : critère pas encore atteint
      const GREEN = 'rgb(5, 150, 105)'; // emerald-600 : critère respecté

      // 1. Champ vide : la checklist guide en gris, aucun critère coché
      await expect(item('8 caractères minimum')).toHaveCSS('color', GREY);
      await expect(item('Au moins une lettre')).toHaveCSS('color', GREY);
      await expect(item('Au moins un chiffre')).toHaveCSS('color', GREY);

      // 2. Lettre seule → seul « Au moins une lettre » passe au vert
      await pw.fill('abc');
      await expect(item('Au moins une lettre')).toHaveCSS('color', GREEN);
      await expect(item('Au moins un chiffre')).toHaveCSS('color', GREY);
      await expect(item('8 caractères minimum')).toHaveCSS('color', GREY);

      // 3. Un chiffre → « Au moins un chiffre » vert à son tour
      await pw.fill('abc1');
      await expect(item('Au moins un chiffre')).toHaveCSS('color', GREEN);
      await expect(item('8 caractères minimum')).toHaveCSS('color', GREY);

      // 4. Longueur atteinte → les trois critères sont verts
      await pw.fill('abc12345');
      await expect(item('8 caractères minimum')).toHaveCSS('color', GREEN);
      await expect(item('Au moins une lettre')).toHaveCSS('color', GREEN);
      await expect(item('Au moins un chiffre')).toHaveCSS('color', GREEN);

      // Garde-fou : la page n'a pas navigué (pas de soumission involontaire)
      await expect(page).toHaveURL(/\/register/);
    });
  });
});

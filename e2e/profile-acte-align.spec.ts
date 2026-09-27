/**
 * E2E navigateur : alignement du compte sur l'acte de naissance (page profil).
 *
 * Parcours : un assuré inscrit avec une identité volontairement différente de
 * son acte téléverse celui-ci depuis son profil — l'OCR lit Prénom/Nom/Date,
 * le comparatif acte ↔ compte affiche les écarts champ par champ, et le
 * bouton « Aligner mon compte sur mon acte » corrige le compte (c'est
 * exactement ce que compare la vérification de souscription, verifyData).
 *
 * Prérequis : API sur :4100 (API_URL), Vite sur :3000 avec VITE_API_PORT=4100.
 * L'acte de test est généré au besoin (fixture gitignorée), identité portée :
 * Marie-Josée ADJOVI, née le 12/01/1990 à Cotonou.
 */
import { test, expect } from '@playwright/test';
import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { uid, registerMember } from './helpers';

const root = join(__dirname, '..');
const ACTE_PDF = join(root, '.freebuff', 'acte-test.pdf');
// Fixture générée (hors dépôt) : régénérée au besoin.
if (!existsSync(ACTE_PDF)) {
  const r = spawnSync(process.execPath, [join(root, 'scripts-dev', 'make-birth-cert-fixture.mjs')], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`Impossible de générer ${ACTE_PDF}`);
}

test.use({ channel: 'chromium' });

test('profil → téléverser l’acte → OCR → comparatif → « Aligner mon compte sur mon acte »', async ({ page }) => {
  test.setTimeout(180_000); // boot du worker OCR (~15 s au premier appel) + rasterisation PDF

  const email = `e2e_align_${uid()}@test.bj`;
  // Identité de compte volontairement DIFFÉRENTE de l'acte (Koffi Mensan, 1991).
  await registerMember(email, 'Test1234!');

  // Connexion UI (les labels exacts de Login.tsx sont « Email » / « Mot de passe »)
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill('Test1234!');
  await page.getByRole('button', { name: /Se connecter|Connexion/ }).click();
  await page.waitForURL('**/app**', { timeout: 30_000 });

  await page.goto('/app/profil');

  // Carte « Acte de naissance » : aucun acte connu → proposition de téléversement.
  const acteCard = page.locator('div.card-p', { has: page.getByRole('heading', { name: 'Acte de naissance' }) });
  await expect(acteCard.getByText(/Téléversez votre acte/)).toBeVisible();
  await acteCard.locator('input[type="file"][accept*="pdf"]').setInputFiles(ACTE_PDF);

  // Extraction OCR + comparatif : le parcours peut prendre ~30 s au premier appel.
  await expect(acteCard.getByText('Aligner mon compte sur mon acte')).toBeVisible({ timeout: 120_000 });
  await expect(acteCard.getByText('N° acte 1234/C/1990')).toBeVisible();

  // Les trois champs comparables apparaissent avec les écarts (compte ≠ acte).
  const rows = acteCard.locator('table tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(acteCard.getByRole('cell', { name: 'Marie-Josée' })).toBeVisible();
  await expect(acteCard.getByRole('cell', { name: 'ADJOVI' })).toBeVisible();
  await expect(acteCard.getByRole('cell', { name: '1990-01-12' })).toBeVisible();
  await expect(acteCard.getByText('1990-06-15')).toBeVisible(); // la valeur du compte (helpers), signalée ⚠️

  // Alignement : le compte est mis à jour (Prénom/Nom/Date de naissance).
  await acteCard.getByRole('button', { name: 'Aligner mon compte sur mon acte' }).click();
  await expect(page.getByText('Profil aligné sur votre acte de naissance.')).toBeVisible({ timeout: 15_000 });
  await expect(acteCard.getByText('✓ Votre compte correspond à votre acte de naissance.')).toBeVisible({ timeout: 15_000 });

  // Le formulaire principal reflète le compte aligné (champs synchronisés au refresh).
  await expect(page.getByLabel('Nom', { exact: true })).toHaveValue('ADJOVI');
  await expect(page.getByLabel('Prénom(s)')).toHaveValue('Marie-Josée');
  await expect(page.getByLabel('Date de naissance')).toHaveValue('1990-01-12');

  // Persistance : rechargement de page → le comparatif reste aligné.
  await page.reload();
  await expect(page.getByText('✓ Votre compte correspond à votre acte de naissance.')).toBeVisible({ timeout: 30_000 });
});

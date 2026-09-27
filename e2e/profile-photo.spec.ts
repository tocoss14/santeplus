/**
 * Photo de profil : visible dès l'inscription avec photo.
 *
 * Régression historique : sur les routes @Public() (dont GET /files/:id/view),
 * le guard court-circuitait avant de charger l'utilisateur → 403 même pour le
 * propriétaire → l'avatar affichait le fallback 📸. Ce parcours garantit que
 * la photo uploadée à l'inscription s'affiche réellement sur /app/profil.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

test.use({ channel: 'chromium' });

const PHOTO = join(__dirname, '..', '.freebuff', 'acte-test.png');

test('inscription avec photo → la photo s\'affiche sur le profil', async ({ page }) => {
  const uid = Math.random().toString(36).slice(2, 8);
  const email = `photo_${uid}@test.bj`;

  // 1. Inscription avec photo (le flux réel de l'utilisateur)
  await page.goto('/register');
  await page.getByLabel('Nom', { exact: true }).fill('Photo');
  await page.getByLabel('Prénom(s)', { exact: true }).fill('Test');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Téléphone').fill('+229 96 ' + String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 2) + ' ' + String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 2) + ' ' + String(Math.floor(10 + Math.random() * 89)) + ' ' + String(Math.floor(10 + Math.random() * 89)));
  await page.getByLabel('Date de naissance').fill('1992-03-10');
  await page.getByLabel('Sexe').selectOption('M');
  await page.getByLabel(/^Mot de passe/).fill('Test1234!');
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();

  // 2. Arrivée dans l'espace membre → profil
  await page.waitForURL('**/app**', { timeout: 30_000 });
  await page.goto('/app/profil');

  // 3. La photo doit être visible dans l'aperçu du profil
  const avatar = page.getByRole('button').filter({ has: page.locator('img[alt="Photo"]') });
  await expect(avatar).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('img[alt="Photo"]')).toBeVisible();

  // 4. Vérifier que l'URL de la photo répond bien 200 (et pas un JSON d'erreur stylé)
  const src = await page.locator('img[alt="Photo"]').getAttribute('src');
  expect(src, 'src de la photo').toContain('/api/files/');
  const res = await page.request.get(src!);
  expect(res.status(), `GET ${src}`).toBe(200);
  expect((await res.headers())['content-type']).toMatch(/image\//);
});

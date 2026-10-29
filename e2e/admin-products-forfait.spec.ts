/**
 * Garde-fou du forfait familial, côté ÉCRAN D'ADMINISTRATION.
 *
 * Un forfait qui inclut des personnes dans la cotisation de base alors que le
 * supplément correspondant vaut 0 FCFA couvre gratuitement tous les membres
 * au-delà : c'est la fuite corrigée par la migration 20261027000000, encore
 * atteignable en rééditant la formule. L'écran doit refuser d'enregistrer une
 * telle grille — message explicite, bouton désactivé — et la grille réellement
 * enregistrée ne doit pas bouger.
 *
 * Prérequis : `npm run dev` (API :4000 + Vite :3000) sur une base seedée —
 * `admin@santeplus.bj` / `Demo1234!` est le seul rôle qui porte products.manage
 * (INSURANCE_MANAGER ne l'a pas : cf. DEFAULT_ROLE_PERMISSIONS).
 */
import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './helpers';

const ADMIN_EMAIL = 'admin@santeplus.bj';
const ADMIN_PASSWORD = 'Demo1234!';

/**
 * Connexion PAR L'UI : les cookies httpOnly doivent être posés dans le contexte
 * du navigateur, sinon /admin/products redirige vers /login et le test
 * n'exercerait jamais l'écran (même recette que internal-accessibility.spec.ts).
 */
async function connexionAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Mot de passe').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /Se connecter|Connexion/ }).click();
  await page.waitForURL(/\/admin/, { timeout: 30_000 });
}

/** Grille de la formule telle qu'elle est réellement en base (via l'API admin). */
async function grilleEnBase(code: string) {
  const ctx = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
  try {
    const liste = await (await ctx.get('/api/admin/products')).json();
    const produit = (Array.isArray(liste) ? liste : liste.items ?? []).find((p: any) => p.code === code);
    expect(produit, `formule ${code} absente du catalogue seedé`).toBeTruthy();
    return {
      id: produit.id,
      includedAdults: produit.includedAdults,
      includedChildren: produit.includedChildren,
      pricePerAdditionalAdultAnnual: produit.pricePerAdditionalAdultAnnual,
      pricePerChildAnnual: produit.pricePerChildAnnual,
    };
  } finally {
    await ctx.dispose();
  }
}

/** Ouvre l'éditeur de la formule depuis la liste des produits. */
async function ouvrirEditeur(page: Page, code: string) {
  await page.goto('/admin/products');
  await expect(page.getByRole('heading', { name: 'Produits & garanties' })).toBeVisible({ timeout: 15_000 });

  const carte = page.locator('li').filter({ hasText: code }).first();
  await expect(carte).toBeVisible({ timeout: 15_000 });
  await carte.getByRole('button', { name: /Modifier/ }).click();

  await expect(page.getByRole('heading', { name: /^Modifier / })).toBeVisible({ timeout: 15_000 });
}

test.describe('Admin — formule à forfait non tarifé', () => {
  test('enfants inclus gratuitement : l’enregistrement est bloqué', async ({ page }) => {
    const avant = await grilleEnBase('ESS');
    // ESS est la formule de référence : 1 adulte inclus, aucun enfant inclus.
    expect(avant.includedChildren).toBe(0);

    await connexionAdmin(page);
    await ouvrirEditeur(page, 'ESS');

    const enfantsInclus = page.getByLabel('Enfants inclus (forfait)');
    const enfantAn = page.getByLabel('Enfant/an');
    const enregistrer = page.getByRole('button', { name: 'Enregistrer' });

    // Grille saine au départ : rien à signaler, bouton actif.
    await expect(enfantAn).toHaveValue(String(avant.pricePerChildAnnual));
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(enregistrer).toBeEnabled();

    // On inclut 3 enfants sans tarifer les suivants → couverture gratuite.
    await enfantsInclus.fill('3');
    await enfantAn.fill('0');

    const alerte = page.getByRole('alert');
    await expect(alerte).toBeVisible();
    await expect(alerte).toContainText('Forfait incohérent');
    await expect(alerte).toContainText('enfants');
    await expect(enregistrer).toBeDisabled();

    // Le blocage suit la grille : retirer l'inclusion libère l'enregistrement.
    await enfantsInclus.fill('0');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(enregistrer).toBeEnabled();

    // Et rien n'a été écrit au passage.
    const apres = await grilleEnBase('ESS');
    expect(apres.includedChildren).toBe(avant.includedChildren);
    expect(apres.pricePerChildAnnual).toBe(avant.pricePerChildAnnual);
  });

  test('adultes inclus gratuitement : l’enregistrement est bloqué', async ({ page }) => {
    const avant = await grilleEnBase('ESS');
    expect(avant.includedAdults).toBe(1);

    await connexionAdmin(page);
    await ouvrirEditeur(page, 'ESS');

    await page.getByLabel('Adultes inclus (forfait)').fill('3');
    await page.getByLabel('Adulte supp./an').fill('0');

    const alerte = page.getByRole('alert');
    await expect(alerte).toBeVisible();
    await expect(alerte).toContainText('Forfait incohérent');
    await expect(alerte).toContainText('adultes');
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    await page.getByLabel('Adultes inclus (forfait)').fill('1');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();

    const apres = await grilleEnBase('ESS');
    expect(apres.includedAdults).toBe(avant.includedAdults);
    expect(apres.pricePerAdditionalAdultAnnual).toBe(avant.pricePerAdditionalAdultAnnual);
  });
});

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
      name: produit.name,
      status: produit.status,
      includedAdults: produit.includedAdults,
      includedChildren: produit.includedChildren,
      pricePerAdditionalAdultAnnual: produit.pricePerAdditionalAdultAnnual,
      pricePerChildAnnual: produit.pricePerChildAnnual,
      carenceBuyoutRate: produit.carenceBuyoutRate,
    };
  } finally {
    await ctx.dispose();
  }
}

/**
 * Archive une formule de test par son code, sans jamais lever d'exception :
 * appelé depuis un `finally`, il ne doit pas remplacer l'échec d'origine par
 * une erreur de nettoyage. L'API n'expose pas de DELETE, l'archivage est le
 * seul retour en arrière — et il traverse le garde-fou serveur lui aussi.
 */
async function archiverParCode(code: string): Promise<boolean> {
  const ctx = await loginAs(ADMIN_EMAIL, ADMIN_PASSWORD);
  try {
    const liste = await (await ctx.get('/api/admin/products')).json();
    const produit = (Array.isArray(liste) ? liste : liste.items ?? []).find((p: any) => p.code === code);
    if (!produit) return true; // rien n'a été créé, rien à nettoyer
    const res = await ctx.patch(`/api/admin/products/${produit.id}`, { data: { status: 'ARCHIVED' } });
    return res.status() < 300;
  } catch {
    return false;
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

  /**
   * Chemin heureux. Sans ce test, un garde-fou trop zélé (qui refuserait TOUTE
   * grille incluant des ayants droit) passerait la suite au vert : les deux cas
   * précédents n'exigent qu'un refus. Ici on enregistre une VRAIE grille
   * familiale — 2 adultes + 2 enfants inclus, les suivants facturés — et on
   * vérifie qu'elle est acceptée puis réellement persistée.
   *
   * La formule est créée plutôt que modifiée : aucun tarif du catalogue ne
   * bouge, et le chemin de création (POST admin) est couvert.
   */
  test('grille cohérente : l’enregistrement aboutit et la grille est persistée', async ({ page }) => {
    const code = `E2E${Date.now().toString(36).toUpperCase()}`;

    try {
      await connexionAdmin(page);
      await page.goto('/admin/products');
      await expect(page.getByRole('heading', { name: 'Produits & garanties' })).toBeVisible({ timeout: 15_000 });
      await page.getByRole('button', { name: /Nouveau produit/ }).click();

      const titre = page.getByRole('heading', { name: 'Nouveau produit' });
      await expect(titre).toBeVisible({ timeout: 15_000 });

      await page.getByLabel('Code').fill(code);
      await page.getByLabel('Nom').fill(`Formule E2E ${code}`);
      await page.getByLabel('Cotisation de base/an').fill('120000');
      await page.getByLabel('Adultes inclus (forfait)').fill('2');
      await page.getByLabel('Adulte supp./an').fill('30000');
      await page.getByLabel('Enfants inclus (forfait)').fill('2');
      await page.getByLabel('Enfant/an').fill('18000');
      await page.getByLabel('Rachat de carence (surprime %)').fill('25');

      // Grille cohérente : aucun avertissement, et le bouton reste actif.
      await expect(page.getByRole('alert')).toHaveCount(0);
      const creer = page.getByRole('button', { name: 'Créer le produit' });
      await expect(creer).toBeEnabled();

      await creer.click();

      // Fermeture de la modale puis rechargement de la liste (onSaved).
      await expect(titre).toHaveCount(0, { timeout: 15_000 });
      await expect(page.locator('li').filter({ hasText: code })).toBeVisible({ timeout: 15_000 });

      // L'affichage ne prouve rien : on relit la grille depuis l'API.
      const enBase = await grilleEnBase(code);
      expect(enBase).toMatchObject({
        includedAdults: 2,
        includedChildren: 2,
        pricePerAdditionalAdultAnnual: 30000,
        pricePerChildAnnual: 18000,
        carenceBuyoutRate: 25,
      });
    } finally {
      // La formule de test ne doit pas rester au catalogue, même en échec.
      if (!(await archiverParCode(code))) {
        console.warn(`[nettoyage] la formule ${code} n'a pas pu être archivée`);
      }
    }
  });
});

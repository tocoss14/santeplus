/**
 * Toutes les zones à défilement horizontal de l'application, rôle par rôle, à
 * 390 × 844 : atteignables au clavier et réellement défilables aux flèches.
 *
 *   npx playwright test e2e/scroll-keyboard.spec.ts -c playwright.mobile.config.ts
 *
 * Volontairement hors de la suite par défaut (≈ 2 min, une soixantaine de
 * routes) : à lancer quand on touche une mise en page ou un tableau.
 *
 * La règle axe `scrollable-region-focusable` ne suffit pas : elle ne signale un
 * conteneur que s'il ne contient AUCUN descendant focusable. Un tableau dont
 * chaque ligne porte un bouton « Voir » passe donc la règle alors que le
 * conteneur lui-même n'est pas focalisable : les flèches ne font défiler que la
 * page, jamais les colonnes hors champ.
 *
 * On mesure donc directement le DOM (débordement réel + overflow CSS) puis on
 * vérifie au clavier que la zone reçoit le focus et défile aux flèches.
 */
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { apiContext, registerMember, uid } from './helpers';

const REGLE = 'scrollable-region-focusable';

type Zone = {
  index: number;
  tag: string;
  label: string | null;
  tab: number;
  dx: number;
};

/** Zones réellement défilantes horizontalement et visibles à l'écran. */
async function zonesHorizontales(page: Page): Promise<Zone[]> {
  return page.evaluate(() => {
    const out: Zone[] = [];
    const all = Array.from(document.querySelectorAll<HTMLElement>('body *'));
    all.forEach((el, index) => {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowX)) return;
      const dx = el.scrollWidth - el.clientWidth;
      if (dx <= 1) return;
      if (el.getClientRects().length === 0) return;
      out.push({
        index,
        tag: el.tagName.toLowerCase(),
        label: el.getAttribute('aria-label'),
        tab: el.tabIndex,
        dx,
      });
    });
    return out;
  });
}

async function login(page: Page, email: string, password: string, espace: RegExp) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: /Se connecter|Connexion/ }).click();
  await page.waitForURL(espace, { timeout: 30_000 });
}

const echecs: { label: string; route: string }[] = [];

async function audit(page: Page, routes: string[]) {
  for (const route of routes) {
    await page.goto(route);
    await page.waitForLoadState('networkidle').catch(() => {});
    // Une route inexistante retombe sur l'accueil : l'audit serait vide.
    const path = new URL(page.url()).pathname;
    if (path !== route) {
      echecs.push({ label: `route non atteinte (URL réelle : ${path})`, route });
      continue;
    }

    const zones = await zonesHorizontales(page);
    const inatteignables = zones.filter(z => z.tab < 0).map(z => `\n   <${z.tag}>${z.label ? `[${z.label}]` : ''} +${z.dx}px`);
    if (inatteignables.length) echecs.push({ label: `zones sans focus clavier : ${inatteignables.join('')}`, route });
  }
}

test.describe('Zones défilantes horizontales accessibles au clavier — 390×844', () => {
  // Chaque route = un chargement + un scan DOM : les ~60 routes dépassent
  // largement les 30 s par défaut de playwright.config.ts.
  test.describe.configure({ timeout: 300_000 });

  // La CI lance `npx playwright test` (viewport 1280) : sans ce garde-fou les
  // assertions « le tableau doit déborder » échoueraient, puisque à 1280 px
  // aucun tableau ne défile. L'audit ne vaut qu'en 390 × 844.
  test.skip(
    ({ viewport }) => (viewport?.width ?? 1280) > 480,
    'audit mobile : lancer avec -c playwright.mobile.config.ts',
  );

  test.afterAll(() => {
    expect(echecs, echecs.map(e => `${e.route} — ${e.label}`).join('\n')).toEqual([]);
  });

  test('admin', async ({ page }) => {
    await login(page, 'gestionnaire@santeplus.bj', 'Demo1234!', /\/admin/);
    await audit(page, [
      '/admin',
      '/admin/users',
      '/admin/contracts',
      '/admin/products',
      '/admin/acts',
      '/admin/claims',
      '/admin/payments',
      '/admin/providers',
      '/admin/partners',
      '/admin/roles',
      '/admin/audit',
      '/admin/technical-result',
      '/admin/distributors',
      '/admin/commissions',
      '/admin/accounting',
      '/admin/analytics',
      '/admin/bi',
      '/admin/impayes',
      '/admin/medical-review',
      '/admin/compliance',
      '/admin/actuarial',
      '/admin/billing',
      '/admin/cts',
      '/admin/financial-models',
      '/admin/position-v2',
      '/admin/fraud',
      '/admin/claims-workflow',
      '/admin/branches',
      '/admin/diseases',
      '/admin/profil',
      '/admin/notifications',
    ]);
  });

  test('prestataire', async ({ page }) => {
    await login(page, 'prestataire@santeplus.bj', 'Demo1234!', /\/prestataire/);
    await audit(page, [
      '/prestataire',
      '/prestataire/verifier',
      '/prestataire/hospitalisation',
      '/prestataire/nouvelle',
      '/prestataire/activite',
      '/prestataire/consultations',
      '/prestataire/ordonnances',
      '/prestataire/delivrances',
      '/prestataire/dossiers',
      '/prestataire/prises',
      '/prestataire/paiements',
      '/prestataire/etablissement',
      '/prestataire/personnel',
      '/prestataire/notifications',
      '/prestataire/profil',
      '/prestataire/mobile',
      '/prestataire/mobile/tp',
      '/prestataire/mobile/tp/nouvelle',
      '/prestataire/mobile/factures',
      '/prestataire/mobile/factures/nouvelle',
      '/prestataire/mobile/rejets',
      '/prestataire/mobile/sync',
    ]);
  });

  test('membre', async ({ page }) => {
    const email = `scroll.membre.${Date.now()}@test.bj`;
    await registerMember(email);
    await login(page, email, 'Test1234!', /\/app/);
    await audit(page, [
      '/app',
      '/app/souscrire',
      '/app/contrat',
      '/app/contrat-old',
      '/app/carte',
      '/app/soins',
      '/app/ordonnances',
      '/app/consultations',
      '/app/beneficiaires',
      '/app/remboursements',
      '/app/remboursements/nouveau',
      '/app/prestataires',
      '/app/distributeur',
      '/app/profil',
      '/app/notifications',
    ]);
  });

  test('entreprise', async ({ page }) => {
    const email = `scroll.entreprise.${Date.now()}@test.bj`;
    const ctx = await apiContext();
    const res = await ctx.post('/api/companies/register', {
      data: {
        companyName: 'Scroll Test ' + uid(),
        city: 'Cotonou',
        email,
        password: 'Test1234!',
        contactName: 'Admin ' + uid(),
      },
    });
    expect(res.ok()).toBeTruthy();
    await ctx.dispose();

    await login(page, email, 'Test1234!', /\/entreprise/);
    await audit(page, ['/entreprise', '/entreprise/salaries', '/entreprise/contrat', '/entreprise/profil']);
  });

  test('public', async ({ page }) => {
    await audit(page, ['/', '/offres', '/faq', '/reclamation', '/simulateur', '/cga', '/reseau', '/register', '/register-entreprise']);
  });

  test('garde-fou : un débordement non focalisable est bien détecté', async ({ page }) => {
    await login(page, 'gestionnaire@santeplus.bj', 'Demo1234!', /\/admin/);
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle').catch(() => {});

    // Zone témoin fabriquée de toutes pièces : si le détecteur ne la voit pas,
    // les autres tests ne prouvent rien.
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'temoin-debordement';
      d.setAttribute('style', 'overflow-x:auto;width:100px');
      d.innerHTML = '<div style="width:600px;height:8px">x</div>';
      document.body.appendChild(d);
    });

    const zones = await zonesHorizontales(page);
    const temoin = zones.find(z => z.tab < 0 && z.dx > 400);
    expect(temoin, 'le détecteur doit voir la zone témoin non focalisable').toBeTruthy();

    await page.evaluate(() => document.getElementById('temoin-debordement')?.remove());
  });

  test('chaque région porte un nom et défile réellement aux flèches', async ({ page }) => {
    await login(page, 'gestionnaire@santeplus.bj', 'Demo1234!', /\/admin/);

    const pages = ['/admin/users', '/admin/claims', '/admin/payments'];
    let verifiees = 0;

    for (const route of pages) {
      await page.goto(route);
      await page.waitForLoadState('networkidle').catch(() => {});

      const regions = page.locator('[role="region"][tabindex="0"]');
      const total = await regions.count();
      expect(total, `${route} doit exposer au moins une région défilante`).toBeGreaterThan(0);

      for (let i = 0; i < total; i++) {
        const region = regions.nth(i);
        const nom = await region.getAttribute('aria-label');
        expect(nom, `${route} — région #${i} sans nom accessible`).toMatch(/défilement/);

        const avant = await region.evaluate(el => ({
          client: el.clientWidth,
          scrollWidth: el.scrollWidth,
          left: el.scrollLeft,
        }));
        if (avant.scrollWidth <= avant.client) continue; // rien à faire défiler

        await region.focus();
        await expect(region).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(200);

        const gauche = await region.evaluate(el => el.scrollLeft);
        expect(gauche, `${route} — les flèches doivent faire défiler « ${nom} »`).toBeGreaterThan(0);
        verifiees++;
      }
    }

    expect(verifiees, 'au moins un tableau large doit être vérifié au clavier').toBeGreaterThan(0);

    // Barre de navigation mobile : 21 entrées côté admin, donc défilante.
    const nav = page.locator('nav[aria-label^="Navigation principale"]');
    await expect(nav).toHaveAttribute('tabindex', '0');
    const navAvant = await nav.evaluate(el => ({
      client: el.clientWidth,
      scrollWidth: el.scrollWidth,
    }));
    expect(navAvant.scrollWidth, 'la barre mobile doit déborder').toBeGreaterThan(navAvant.client);
    await nav.focus();
    await expect(nav).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(200);
    expect(await nav.evaluate(el => el.scrollLeft), 'la barre doit défiler aux flèches').toBeGreaterThan(0);
  });

  test('aucune violation axe scrollable-region-focusable sur les listes', async ({ page }) => {
    await login(page, 'gestionnaire@santeplus.bj', 'Demo1234!', /\/admin/);
    for (const route of ['/admin/users', '/admin/claims', '/admin/commissions', '/admin/billing']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle').catch(() => {});
      const res = await new AxeBuilder({ page }).withRules([REGLE]).analyze();
      expect(res.violations, `${route} : ${res.violations.map(v => v.id).join(', ')}`).toEqual([]);
    }
  });
});

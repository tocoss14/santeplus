/**
 * Anti-régression de la landing publique (/) — verrouille les contrôles faits
 * à la main lors de la refonte (skill UI/UX Pro Max) :
 *   · aucune erreur console au chargement ;
 *   · JSON-LD FAQPage strictement cohérent avec la FAQ visible ;
 *   · accordéon FAQ : aria-expanded / aria-controls ;
 *   · cibles tactiles ≥ 44 px (boutons ±, pastilles de formule) ;
 *   · cotisation annoncée dans une région aria-live ;
 *   · aucun débordement horizontal en 375 px (mobile) ;
 *   · anneau de focus visible au clavier.
 *
 * Prérequis : `npm run dev` (API :4000 + Vite :3000) — voir playwright.config.ts.
 */
import { test, expect, type Page } from '@playwright/test';

/** Le bandeau cookies et le bandeau PWA masqueraient le bas de page (fixed). */
async function gotoLanding(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('cookie-consent', 'accepted');
    localStorage.setItem('pwa-dismiss', '1');
  });
  await page.goto('/');
}

test.describe('Landing publique', () => {
  test('rendu, JSON-LD FAQ cohérent avec la FAQ visible, console propre', async ({ page }) => {
    const erreursConsole: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') erreursConsole.push(msg.text());
    });
    page.on('pageerror', err => erreursConsole.push(String(err)));

    // Attente armée AVANT la navigation (sinon la réponse est déjà passée).
    const reponseProviders = page.waitForResponse(r => r.url().includes('/api/providers'));

    await gotoLanding(page);

    await expect(page.getByRole('heading', { level: 1, name: /Votre santé/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Chiffres clés' })).toBeVisible();

    // L'image du hero doit exister et se charger (asset public).
    const img = page.locator('img[fetchpriority="high"]');
    await expect(img).toHaveCount(1);
    await expect.poll(() => img.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    // Le compteur d'établissements vient de l'API (/api/providers).
    expect((await reponseProviders).status()).toBe(200);
    const premierChiffre = page.getByRole('region', { name: 'Chiffres clés' }).locator('dd').first();
    await expect(premierChiffre).toContainText(/\d/);

    // JSON-LD : 4 questions, strictement celles affichées.
    const brut = await page.locator('script[type="application/ld+json"]').textContent();
    const donnees = JSON.parse(brut!);
    expect(donnees['@type']).toBe('FAQPage');
    expect(donnees.mainEntity).toHaveLength(4);
    for (const q of donnees.mainEntity) {
      await expect(page.getByRole('button', { name: q.name }), `question JSON-LD absente du visible : ${q.name}`).toHaveCount(1);
    }
    await expect(page.locator('#faq button')).toHaveCount(4);

    expect(erreursConsole, 'erreurs console au chargement de la landing').toEqual([]);
  });

  test('FAQ : aria-expanded et aria-controls pilotent bien la région', async ({ page }) => {
    await gotoLanding(page);

    const q1 = page.getByRole('button', { name: 'Comment souscrire ?' });
    const q2 = page.getByRole('button', { name: /Quels moyens de paiement/ });

    // La première question est ouverte par défaut.
    await expect(q1).toHaveAttribute('aria-expanded', 'true');
    const panneau1 = await q1.getAttribute('aria-controls');
    await expect(page.locator(`#${panneau1}`)).toBeVisible();

    await q2.click();
    await expect(q2).toHaveAttribute('aria-expanded', 'true');
    await expect(q1).toHaveAttribute('aria-expanded', 'false');
    const panneau2 = await q2.getAttribute('aria-controls');
    expect(panneau2).not.toBe(panneau1);
    await expect(page.locator(`#${panneau2}`)).toBeVisible();
    await expect(page.locator(`#${panneau1}`)).toHaveCount(0);

    // Replier : plus aucun panneau ouvert.
    await q2.click();
    await expect(q2).toHaveAttribute('aria-expanded', 'false');
  });

  test('simulateur : cibles ≥ 44 px, formule en aria-pressed, cotisation en aria-live', async ({ page }) => {
    await gotoLanding(page);

    // Les pastilles de formule n'apparaissent qu'après /api/products.
    const pastilles = page.getByRole('group', { name: 'Choisir une formule' }).getByRole('button');
    await expect(pastilles.first()).toBeVisible({ timeout: 15_000 });

    // Aucun bouton de la landing sous 44×44 (règle tactiles du skill).
    const petits = await page.locator('main button').evaluateAll(btns =>
      btns
        .map(b => {
          const r = b.getBoundingClientRect();
          return { label: b.getAttribute('aria-label') ?? b.textContent?.trim().slice(0, 30), l: Math.round(r.width), h: Math.round(r.height) };
        })
        .filter(b => b.l < 44 || b.h < 44),
    );
    expect(petits, 'boutons sous 44 px').toEqual([]);

    // Une seule formule pressée à la fois.
    await expect(page.locator('main [aria-pressed="true"]')).toHaveCount(1);
    await pastilles.first().click();
    await expect(pastilles.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('main [aria-pressed="true"]')).toHaveCount(1);

    // Cotisation : région aria-live qui suit réellement l'état.
    const cotisation = page.locator('main div[aria-live="polite"]');
    await expect(cotisation).toHaveCount(1);
    await expect(cotisation).toContainText('Famille 2 adultes + 1 enfant');
    await page.getByRole('button', { name: 'Ajouter un enfant' }).click();
    await expect(cotisation).toContainText('Famille 2 adultes + 2 enfants');
    await page.getByRole('button', { name: 'Retirer un adulte' }).click();
    await expect(cotisation).toContainText('Famille 1 adulte + 2 enfants');
  });

  // Balayage des largeurs réelles : 320 (petit Android), 360 (le plus courant
  // au Bénin), 375 (iPhone), 768 (tablette, où le menu desktop s'ouvre).
  // Régression historique : l'en-tête PublicLayout débordait de 43 px en 360
  // et de 67 px en 768 → scroll horizontal sur toute la page publique.
  for (const largeur of [320, 360, 375, 768]) {
    test(`aucun débordement horizontal à ${largeur} px`, async ({ page }) => {
      await page.setViewportSize({ width: largeur, height: 812 });
      await gotoLanding(page);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const debordement = await page.evaluate(() => ({
        contenu: document.documentElement.scrollWidth,
        vue: document.documentElement.clientWidth,
        coupables: Array.from(document.querySelectorAll<HTMLElement>('body *'))
          .filter(el => {
            if (el.getBoundingClientRect().right <= document.documentElement.clientWidth + 1) return false;
            // Un ancêtre qui clippe (overflow, filtre, transform) empêche le scroll.
            let p: HTMLElement | null = el.parentElement;
            while (p && p !== document.documentElement) {
              const o = getComputedStyle(p);
              if (o.overflowX !== 'visible' || o.filter !== 'none' || o.transform !== 'none') return false;
              p = p.parentElement;
            }
            return true;
          })
          .slice(0, 5)
          .map(el => `${el.tagName}.${el.className.toString().slice(0, 60)}`),
      }));
      expect(
        debordement.contenu,
        `débordement à ${largeur} px — causant : ${debordement.coupables.join(' | ') || 'inconnu'}`,
      ).toBeLessThanOrEqual(debordement.vue + 1);
    });
  }

  test('clavier : anneau de focus visible', async ({ page }) => {
    await gotoLanding(page);
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const cs = getComputedStyle(document.activeElement as Element);
      return { style: cs.outlineStyle, width: cs.outlineWidth };
    });
    expect(focus.style, 'aucun anneau de focus au clavier (:focus-visible absent ?)').toBe('solid');
    expect(focus.width).toBe('2px');
  });
});

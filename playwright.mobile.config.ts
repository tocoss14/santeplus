import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/**
 * Variante mobile du parcours E2E : même suite, viewport 390 × 844 (iPhone
 * 12/13/14, format le plus courant des assurés au Bénin).
 *
 *   npx playwright test e2e/subscribe-ocr.spec.ts -c playwright.mobile.config.ts
 *
 * Aucun autre réglage n'est dupliqué : tout vient de playwright.config.ts, la
 * seule différence est la taille de la fenêtre — donc le rendu réellement testé
 * est celui que Playwright utilise, pas une émulation posée par un test.
 */
export default defineConfig({
  ...base,
  use: {
    ...base.use,
    viewport: { width: 390, height: 844 },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    globals: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    // Pool 'forks' : chaque fichier de tests tourne dans son propre process.
    // Les specs mélangent des modules natifs lourds (tesseract legacy, pdf.js
    // + canvas) qui se plantaient mutuellement au teardown quand ils
    // partageaient le process du pool 'threads' (segfaults intermittents, exit
    // 139). L'isolation par fork coûte quelques secondes et garantit la
    // fiabilité du run complet.
    pool: 'forks',
  },
});

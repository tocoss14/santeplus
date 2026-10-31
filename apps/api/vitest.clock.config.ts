import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * Configuration de la matrice d'horloges (scripts-dev/clock-matrix.mjs).
 * Identique à la configuration normale, plus le gel de l'horloge piloté par
 * CLOCK_DATE. Sans la variable, ce fichier se comporte comme vitest.config.ts.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      setupFiles: ['tests/setup/frozen-clock.ts'],
    },
  }),
);

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    globals: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});

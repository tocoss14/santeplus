import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    globals: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});

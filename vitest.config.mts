import { defineConfig } from 'vitest/config';

// Unit_Suite configuration. Collects only tests/unit/ (and its subfolders),
// so the E2E_Suite under tests/e2e/ is never loaded by Vitest.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    environment: 'node',
    watch: false,
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './tests/globalSetup.ts',
    setupFiles: './tests/setupEnv.ts',
    // Todas las pruebas comparten la misma base de test: se ejecutan en serie.
    fileParallelism: false,
  },
});

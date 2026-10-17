/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: { port: 5174, proxy: { '/api': apiTarget } },
    preview: { port: 4174, proxy: { '/api': apiTarget } },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/setupTests.ts',
      css: false,
    },
  };
});

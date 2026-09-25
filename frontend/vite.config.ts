/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// In dev the browser only talks to Vite (http://localhost:5173). Requests to /api/*
// are proxied to the NestJS API, so the spv_session cookie stays first-party.
// Cookies ignore the port, so the cookie the backend sets through the proxy is
// also sent to https://localhost:3000/anaf/callback when ANAF redirects back.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.API_PROXY_TARGET || 'https://localhost:3000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true, // must match FRONTEND_URL in backend/.env
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: false, // the dev certificate from `npm run cert:dev` is self-signed
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});

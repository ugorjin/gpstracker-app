/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API runs separately (server/, port 3000) and is proxied,
// so the browser sees one origin, as in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_URL ?? 'http://localhost:3000', changeOrigin: false },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change less often than our code: separate files cache better.
        manualChunks: { react: ['react', 'react-dom', 'react-dom/client', 'react-router-dom', '@tanstack/react-query'], map: ['leaflet', 'react-leaflet'] },
      },
    },
  },
  test: {
    environment: 'node',
  },
});

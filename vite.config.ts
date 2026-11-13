import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  base: '/Metall-DEMO/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { host: '127.0.0.1', port: 5188, strictPort: true },
  preview: { host: '127.0.0.1', port: 4188, strictPort: true },
  build: { rollupOptions: { output: { manualChunks: {
    'react-runtime': ['react', 'react-dom', 'react-router-dom'],
    'demo-network': ['msw', 'msw/browser'],
  } } } },
});

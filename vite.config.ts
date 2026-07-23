import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1200
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: false
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true
  }
});

import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/client',
    target: 'es2022',
    chunkSizeWarningLimit: 1200
  },
  server: {
    // Bind the IPv4 loopback explicitly — on some Windows setups Vite's
    // default "localhost" binds only [::1], which browsers/proxies that
    // resolve localhost to 127.0.0.1 cannot reach.
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

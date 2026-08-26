import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs, so the build works both at a domain root and under a
  // repository subpath on GitHub Pages.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});

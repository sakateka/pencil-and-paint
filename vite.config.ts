import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/**
 * A stamp identifying the build, shown on the title card.
 *
 * Asset filenames are content-hashed and so are immune to caching, but the
 * index.html that points at them is not — a phone holding an old copy of it
 * keeps loading old code, and there is otherwise no way to tell from the
 * device which build you are looking at.
 */
function buildId(): string {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  try {
    const sha = process.env.GITHUB_SHA ?? execSync('git rev-parse --short HEAD').toString();
    return `${stamp} · ${sha.trim().slice(0, 7)}`;
  } catch {
    return stamp;
  }
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
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

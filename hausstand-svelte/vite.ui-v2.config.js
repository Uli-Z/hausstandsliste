import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  root: 'ui-v2',
  base: '/',
  plugins: [svelte()],
  build: {
    outDir: '../dist/ui-v2-bundle',
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 100000000,
    rollupOptions: {
      output: {
        manualChunks: undefined,
        codeSplitting: false,
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});

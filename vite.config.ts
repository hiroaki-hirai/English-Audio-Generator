import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  base: '/English-Audio-Generator/',
  build: {
    manifest: true,
    outDir: 'dist',
  },
});

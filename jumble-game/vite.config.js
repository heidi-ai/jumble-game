import { defineConfig } from 'vite';

export default defineConfig({
  base: '/jumble-game/',
  root: '.',
  build: {
    outDir: '../dist',
  },
});

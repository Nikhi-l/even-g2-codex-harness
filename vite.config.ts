import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'src/web',
  base: './',
  build: { outDir: '../../dist/web', emptyOutDir: true, rollupOptions: { input: { main: resolve('src/web/index.html'), gallery: resolve('src/web/gallery.html'), surfaces: resolve('src/web/surfaces.html') } } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});

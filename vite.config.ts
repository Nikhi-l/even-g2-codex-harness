import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: 'src/web',
  base: './',
  define: { __SIDEBAND_PACKAGED__: false },
  build: { outDir: '../../dist/web', emptyOutDir: true, rollupOptions: { input: { main: resolve('src/web/index.html'), gallery: resolve('src/web/gallery.html'), lab: resolve('src/web/lab.html'), surfaces: resolve('src/web/surfaces.html'), social: resolve('src/web/social.html') } } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});

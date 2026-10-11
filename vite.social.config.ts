import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const sourceRoot = `${resolve('src').replaceAll('\\', '/')}/`;
const allowedSource = /^(?:social\/[^/]+\.ts|core\/text\.ts|device\/(?:social|adapter)\.ts|web\/social\.(?:html|ts|css)|web\/social-tokens\.css)$/;

export default defineConfig({
  root: 'src/web',
  base: './',
  publicDir: false,
  define: { __SIDEBAND_PACKAGED__: true },
  plugins: [{
    name: 'sideband-isolation',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const moduleId of Object.keys(output.modules)) {
          const clean = moduleId.replaceAll('\\', '/').split('?')[0] ?? '';
          if (clean.startsWith(sourceRoot) && !allowedSource.test(clean.slice(sourceRoot.length))) {
            this.error(`Sideband must not bundle unrelated harness code: ${clean.slice(sourceRoot.length)}`);
          }
          if (clean.includes('/node_modules/') && !clean.includes('/node_modules/@evenrealities/even_hub_sdk/')) {
            this.error('A new bundled dependency needs an explicit Sideband license and isolation review.');
          }
        }
      }
    },
  }],
  build: {
    outDir: '../../dist/social',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: { input: resolve('src/web/social.html') },
  },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
});

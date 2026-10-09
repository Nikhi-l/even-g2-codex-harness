import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ build: {
  lib: { entry: { handler: fileURLToPath(new URL('./src/handler.ts', import.meta.url)), client: fileURLToPath(new URL('./src/client.ts', import.meta.url)) }, formats: ['es'], fileName: (_format, name) => `${name}.js` },
  target: 'es2022', minify: false, outDir: 'dist',
} });

import { registerImageAlias } from '../artifacts/index.js';
export function registerAssets() {
  for (const key of ['architecture', 'waveform', 'route', 'grid']) registerImageAlias(key, new URL(`assets/${key}.svg`, document.baseURI).href);
  for (const key of ['moonrise', 'ginkgo', 'portrait-mira', 'portrait-ren']) registerImageAlias(key, new URL(`assets/${key}.png`, document.baseURI).href);
}

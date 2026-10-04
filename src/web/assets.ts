import { registerImageAlias } from '../artifacts/index.js';
export function registerAssets() {
  for (const key of ['architecture', 'waveform', 'route', 'grid']) registerImageAlias(key, new URL(`assets/${key}.svg`, document.baseURI).href);
}

import './styles.css';
import { artifactSchema } from '../core/contracts.js';
import { examples } from '../core/examples.js';
import { maxScroll } from '../core/render.js';
import { stressArtifacts } from '../core/stress.js';
import { allTemplates, preloadArtifactImages, renderArtifact } from '../artifacts/index.js';
import { registerAssets } from './assets.js';
registerAssets();
const gallery = document.querySelector<HTMLDivElement>('#gallery')!;
// `?stress=1` renders worst-case data at the first and last scroll position and reports
// any canvas that draws into its outer two pixels, where content would be cut off.
const stress = new URL(location.href).searchParams.get('stress') === '1';
const touchesEdge = (canvas: HTMLCanvasElement) => {
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, 288, 288).data;
  for (let y = 0; y < 288; y++) for (let x = 0; x < 288; x++) {
    if (x > 1 && x < 286 && y > 1 && y < 286) continue;
    const i = (y * 288 + x) * 4;
    if (Math.max(pixels[i]!, pixels[i + 1]!, pixels[i + 2]!) > 30) return true;
  }
  return false;
};
const overflow: string[] = [];
for (const example of stress ? stressArtifacts : examples) {
  const artifact = { ...artifactSchema.parse(example), version: 1, expiresAt: 0 };
  for (const scroll of stress ? [...new Set([0, maxScroll(artifact)])] : [0]) {
    const figure = document.createElement('figure');
    const canvas = document.createElement('canvas'); canvas.width = 288; canvas.height = 288;
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${example.template} artifact example`);
    await preloadArtifactImages(example.template, artifact.data);
    renderArtifact(canvas.getContext('2d')!, example.template, artifact.data, { scroll, chosen: stress && example.template === 'choices' ? scroll : null });
    const caption = document.createElement('figcaption'); caption.textContent = allTemplates().find(template => template.id === example.template)!.title;
    const description = document.createElement('p'); description.textContent = stress ? `${example.id} · scroll ${scroll}` : `${example.template} · 288 × 288 artifact pane`;
    figure.append(canvas, caption, description);
    if (stress && example.template !== 'image' && example.template !== 'image_grid' && touchesEdge(canvas)) overflow.push(`${example.id}@${scroll}`);
    if (!stress) {
      const link = document.createElement('a'); link.href = `./?template=${example.template}`; link.textContent = 'Try this template →';
      figure.append(link);
    }
    gallery.append(figure);
  }
}
document.body.dataset.overflow = JSON.stringify(overflow);
document.body.dataset.ready = 'true';

import './styles.css';
import { examples } from '../core/examples.js';
import { allTemplates, preloadArtifactImages, renderArtifact } from '../artifacts/index.js';
import { registerAssets } from './assets.js';
registerAssets();
const gallery = document.querySelector<HTMLDivElement>('#gallery')!;
for (const example of examples) {
  const figure = document.createElement('figure');
  const canvas = document.createElement('canvas'); canvas.width = 288; canvas.height = 288;
  canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${example.template} artifact example`);
  await preloadArtifactImages(example.template, example.data);
  renderArtifact(canvas.getContext('2d')!, example.template, example.data, { scroll: 0 });
  const caption = document.createElement('figcaption'); caption.textContent = allTemplates().find(template => template.id === example.template)!.title;
  const description = document.createElement('p'); description.textContent = `${example.template} · 288 × 288 artifact pane`;
  const link = document.createElement('a'); link.href = `./?template=${example.template}`; link.textContent = 'Try this template →';
  figure.append(canvas, caption, description, link); gallery.append(figure);
}
document.body.dataset.ready = 'true';

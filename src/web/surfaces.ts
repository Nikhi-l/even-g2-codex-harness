import './surfaces.css';
import { artifactSchema, type ArtifactInput } from '../core/contracts.js';
import { quietExamples } from '../core/quiet-examples.js';
import { newId } from '../core/id.js';
import { render } from '../core/render.js';
import { preloadArtifactImages, renderArtifact } from '../artifacts/index.js';
import type { DisplayAdapter } from '../device/adapter.js';
import { connectEven } from '../device/even.js';
import { paintPreview } from './preview.js';
import { registerAssets } from './assets.js';
import { MotionPlayer } from './motion-player.js';

registerAssets();
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('display');
const scene = el<HTMLSelectElement>('scene');
const play = el<HTMLButtonElement>('play');
const step = el<HTMLButtonElement>('step');
const connect = el<HTMLButtonElement>('connect');
const device = el<HTMLInputElement>('device');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const sessionId = newId();
let selected = 0, phase = 0, revision = 0;
let adapter: DisplayAdapter | undefined;
let busy = false, connecting = false, failed = false;
const buttons: HTMLButtonElement[] = [];
const current = (): ArtifactInput => {
  const example = quietExamples[selected]!;
  return example.template === 'motion' ? { ...example, data: { ...example.data, phase } } : example;
};
function sync() {
  const motion = current().template === 'motion';
  scene.disabled = busy || connecting;
  buttons.forEach((button, index) => { button.disabled = busy || connecting; button.setAttribute('aria-pressed', String(index === selected)); });
  device.disabled = busy || connecting || failed;
  connect.disabled = busy || connecting || Boolean(adapter) || failed;
  play.disabled = !motion || reduced.matches || connecting || failed || (busy && !player.playing);
  step.disabled = !motion || busy || connecting || failed;
  play.textContent = player.playing ? 'Pause motion' : 'Play motion';
  el('motion-note').textContent = reduced.matches ? 'Reduced motion enabled. Step through frames manually.' : 'Still by default. At least 1 second between completed frames.';
}
function failure(error: unknown) {
  failed = true; player.pause(); adapter?.dispose(); device.checked = false;
  el('status').textContent = `${error instanceof Error ? error.message : 'Display update failed'}. Reload this page before reconnecting.`;
  sync();
}
async function paint() {
  busy = true; sync();
  try {
    const input = current();
    const artifact = { ...artifactSchema.parse(input), version: 1, expiresAt: Date.now() + 600000 };
    const frame = render(artifact, 0, 0, 'split', ++revision, sessionId);
    await paintPreview(canvas, frame);
    el('payload').textContent = JSON.stringify(input, null, 2);
    el('phase').textContent = input.template === 'motion' ? `FRAME ${String(phase + 1).padStart(2, '0')} / 16` : 'STILL';
    el<HTMLAnchorElement>('try').href = `./?template=${input.template}`;
    document.body.dataset.phase = String(phase);
    if (adapter && device.checked) {
      el('status').textContent = 'Sending to Even Hub…';
      await adapter.render(frame);
      el('status').textContent = 'Bridge accepted. Check the image on your glasses.';
    }
  } finally { busy = false; sync(); }
}
const player = new MotionPlayer(async () => {
  phase = (phase + 1) % 16; await paint();
}, failure);
async function select(index: number) {
  player.pause(); selected = index; phase = 0; scene.value = String(index); sync();
  try { await paint(); } catch (error) { failure(error); }
}
for (const [index, example] of quietExamples.entries()) {
  const name = example.template === 'portrait' ? example.data.name : 'title' in example.data ? example.data.title : example.id;
  scene.add(new Option(`${String(index + 1).padStart(2, '0')} / ${name}`, String(index)));
  const button = document.createElement('button'); button.className = 'tile'; button.type = 'button';
  button.setAttribute('aria-label', `Select ${name}`);
  const tile = document.createElement('canvas'); tile.width = 288; tile.height = 288; tile.setAttribute('aria-hidden', 'true');
  const parsed = artifactSchema.parse(example);
  await preloadArtifactImages(example.template, parsed.data);
  renderArtifact(tile.getContext('2d')!, example.template, parsed.data);
  const heading = document.createElement('span'); heading.className = 'tile-text'; heading.textContent = `${String(index + 1).padStart(2, '0')} / ${name}`;
  const description = document.createElement('span'); description.className = 'tile-description';
  description.textContent = example.template === 'portrait' ? 'AI-generated fictional person' : example.template === 'motion' ? `Motion / ${example.data.mode} / 16 frames` : `${example.template} / static backdrop`;
  button.append(tile, heading, description); button.onclick = () => void select(index); buttons.push(button); el('collection').append(button);
}
scene.onchange = () => void select(Number(scene.value));
play.onclick = () => { if (player.playing) player.pause(); else player.play(); sync(); };
step.onclick = () => { void player.step(); sync(); };
device.onchange = () => { player.pause(); if (!device.checked) el('status').textContent = adapter ? 'Device sending paused. Last image remains on glasses.' : 'Browser preview'; sync(); };
connect.onclick = async () => {
  player.pause(); connecting = true; sync(); el('status').textContent = 'Waiting for Even Hub…';
  try {
    adapter = await connectEven(() => { player.pause(); sync(); }, () => {}, failure);
    device.checked = true;
    await paint();
  } catch (error) { failure(error); }
  finally { connecting = false; sync(); }
};
el('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(current(), null, 2)); el('status').textContent = 'Artifact JSON copied.'; }
  catch { el('status').textContent = 'Select and copy the JSON shown above.'; }
};
document.addEventListener('visibilitychange', () => { if (document.hidden) { player.pause(); sync(); } });
reduced.addEventListener('change', () => { if (reduced.matches) player.pause(); sync(); });
window.addEventListener('pagehide', () => { player.pause(); adapter?.dispose(); });
await select(0);
document.body.dataset.ready = 'true';

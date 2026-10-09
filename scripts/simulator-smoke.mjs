/* global fetch, setTimeout */
// Drives the official Even Hub simulator through the running relay and checks the glasses screen.
// For each example (and, with --stress, each worst-case artifact) it publishes the artifact, waits for
// the real SDK's bridge-accepted receipt, saves the 576 × 288 glasses framebuffer, and fails if native
// text overflows: a lit firmware scrollbar column or an eleventh line means the text container scrolls.
//
//   npm run build && npm start                      # relay in another terminal
//   EVENHUB_SIMULATOR=/path/to/evenhub-simulator node scripts/simulator-smoke.mjs test-results/simulator [--stress]
//
// The simulator is vendor software for layout checks. It is not hardware evidence.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const args = process.argv.slice(2);
const out = args.find(arg => !arg.startsWith('--')) ?? 'test-results/simulator';
const relay = process.env.G2_HARNESS_URL ?? 'http://127.0.0.1:8787';
const port = Number(process.env.EVENHUB_AUTOMATION_PORT ?? 9898);
const automation = `http://127.0.0.1:${port}`;
const token = process.env.G2_HARNESS_TOKEN ?? JSON.parse(await readFile(new URL('../.local/connection.json', import.meta.url), 'utf8')).token;
const { examples } = await import('../dist/core/examples.js');
const { stressArtifacts } = await import('../dist/core/stress.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function api(path, method = 'GET', body) {
  const response = await fetch(relay + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.error ?? response.status}`);
  return data;
}
/** Minimal decoder for the simulator's 8-bit RGBA, non-interlaced PNG screenshots. */
function decodePng(buffer) {
  let offset = 8; let width = 0; let height = 0; const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset); const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') { width = buffer.readUInt32BE(offset + 8); height = buffer.readUInt32BE(offset + 12); }
    if (type === 'IDAT') data.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data)); const stride = width * 4; const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0; const up = y ? pixels[(y - 1) * stride + x] : 0;
      const corner = x >= 4 && y ? pixels[(y - 1) * stride + x - 4] : 0;
      const paeth = () => { const p = left + up - corner; const a = Math.abs(p - left), b = Math.abs(p - up), c = Math.abs(p - corner); return a <= b && a <= c ? left : b <= c ? up : corner; };
      pixels[y * stride + x] = (value + [0, left, up, (left + up) >> 1, paeth()][filter]) & 255;
    }
  }
  return { width, height, lit: (x, y) => pixels[(y * width + x) * 4 + 3] > 60 };
}
function overflow(image, layout) {
  // Text spans x 6..266 in split view and 6..536 full width. Firmware draws its scrollbar near the
  // container's right edge, and an eleventh 27 px line starts at y 282.
  const [from, to] = layout === 'split' ? [272, 287] : [545, 575];
  const problems = [];
  for (let y = 0; y < image.height && !problems.length; y++) for (let x = from; x <= to; x++) if (image.lit(x, y)) { problems.push(`lit pixel at x ${x}, y ${y} (scrollbar or overrun)`); break; }
  const textRight = layout === 'split' ? 271 : 575;
  for (let y = 282; y < image.height && problems.length < 2; y++) for (let x = 0; x <= textRight; x++) if (image.lit(x, y)) { problems.push(`text below line ten at y ${y}`); break; }
  return problems;
}
async function waitForReceipt(revision) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const state = await api('/api/state');
    if (state.revision !== revision) throw new Error(`state moved to revision ${state.revision} while waiting for ${revision}`);
    const receipt = state.deliveries.find(value => value.mode === 'even');
    if (receipt?.status === 'bridge-accepted') return;
    if (receipt?.status === 'failed') throw new Error(`SDK failure: ${receipt.detail ?? 'unknown'}`);
    await sleep(100);
  }
  throw new Error(`no bridge-accepted receipt for revision ${revision}`);
}
async function capture(name, layout) {
  await sleep(250); // the simulator paints after the bridge resolves
  const png = Buffer.from(await (await fetch(`${automation}/api/screenshot/glasses`)).arrayBuffer());
  await writeFile(`${out}/${name}.png`, png);
  return overflow(decodePng(png), layout);
}

await mkdir(out, { recursive: true });
const binary = process.env.EVENHUB_SIMULATOR ?? 'evenhub-simulator';
const simulator = spawn(binary, [`${relay}/?evenhub=1#token=${token}`, '--automation-port', String(port), '--no-glow'], { stdio: 'ignore' });
const results = [];
try {
  for (let attempt = 0; attempt < 60; attempt++) { if (await fetch(`${automation}/api/ping`).then(r => r.ok, () => false)) break; await sleep(500); }
  let state = await api('/api/state');
  for (const artifact of [...examples, ...(args.includes('--stress') ? stressArtifacts : [])]) {
    state = await api('/api/artifacts', 'POST', { artifact, expectedSessionId: state.sessionId, expectedRevision: state.revision });
    await waitForReceipt(state.revision);
    const split = await capture(`${artifact.id}-split`, 'split');
    state = await api('/api/layout', 'POST', { layout: 'answer', expectedSessionId: state.sessionId, expectedRevision: state.revision });
    await waitForReceipt(state.revision);
    const full = await capture(`${artifact.id}-answer`, 'answer');
    const pages = state.frame.pages;
    results.push({ id: artifact.id, template: artifact.template, pages, problems: [...split.map(p => `split: ${p}`), ...full.map(p => `answer: ${p}`)] });
    console.log(`${split.length || full.length ? 'FAIL' : 'ok  '} ${artifact.id} (${pages} answer page${pages > 1 ? 's' : ''})`);
    // The relay keeps at most 20 artifacts; remove each one once its screens are captured.
    state = await api('/api/artifacts', 'DELETE', { id: artifact.id, expectedSessionId: state.sessionId, expectedRevision: state.revision });
  }
} finally { simulator.kill(); }
await writeFile(`${out}/summary.json`, JSON.stringify(results, null, 2));
const failed = results.filter(result => result.problems.length);
console.log(`${results.length - failed.length}/${results.length} screens without text overflow. Screenshots: ${out}`);
for (const result of failed) console.log(`  ${result.id}: ${result.problems.join('; ')}`);
process.exitCode = failed.length ? 1 : 0;

import './styles.css';
import {
  CreateStartUpPageContainer, RebuildPageContainer, TextContainerProperty, TextContainerUpgrade, ImageContainerProperty,
  ImageRawDataUpdate, ImageRawDataUpdateResult, ListContainerProperty, ListItemContainerProperty, OsEventTypeList,
  ImuReportPace, StartUpPageCreateResult, EventSourceType, waitForEvenAppBridge,
  type EvenAppBridge, type EvenHubEvent, type DeviceStatus,
} from '@evenrealities/even_hub_sdk';
import { COMPENSATED } from '../device/tiles.js';
import { allTemplates, preloadArtifactImages, renderArtifact } from '../artifacts/index.js';
import { ARTIFACT_COLORS as C, ARTIFACT_FONT as FONT } from '../artifacts/render.js';
import { artifactSchema } from '../core/contracts.js';
import { examples } from '../core/examples.js';
import { maxScroll } from '../core/render.js';
import { G2_TEXT, wrapText } from '../core/text.js';
import { registerAssets } from './assets.js';

/*
 * Interface Lab: a self-running tour of interface ideas for the G2's 576 x 288 green display.
 * It drives the SDK directly (no relay), so scenes can animate frame by frame. Every SDK call is
 * serialized with a timeout, text always fits the measured ten-line budget, and tiles go through the
 * same tone compensation as the harness.
 */
registerAssets();
const LAB_VERSION = 'v5';
const relayToken = new URLSearchParams(location.hash.slice(1)).get('token');
if (relayToken) history.replaceState(null, '', location.pathname + location.search);
/** Send timing samples to the relay so the display can be tuned against real hardware numbers. */
function report(source: string, samples: Array<Record<string, string | number>>) {
  if (!relayToken) return;
  void fetch(`${location.origin}/api/metrics`, { method: 'POST', headers: { authorization: `Bearer ${relayToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ source, samples: samples.slice(0, 60) }) }).catch(() => {});
}
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
function log(text: string) {
  const row = document.createElement('div'); row.className = 'log-row';
  const time = document.createElement('time'); time.textContent = new Date().toLocaleTimeString('en-GB');
  const detail = document.createElement('span'); detail.textContent = text;
  row.append(time, detail); $('lab-log').prepend(row);
  while ($('lab-log').children.length > 30) $('lab-log').lastElementChild?.remove();
}
const sleepFor = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  if (signal.aborted) { resolve(); return; }
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
});
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

// ---------------------------------------------------------------------------------------------
// Surface: containers on the glasses, serialized SDK calls, restore after rebuilds.
type Box = { id: number; name: string; x: number; y: number; w: number; h: number };
type TextBox = Box & { content: string; color?: number; padding?: number; border?: number };
type ListBox = Box & { items: string[] };
interface Layout { texts: TextBox[]; images: Box[]; list?: ListBox }
const INPUT: TextBox = { id: 1, name: 'lab-input', x: 0, y: 0, w: 576, h: 288, content: ' ', padding: 0 };

class Surface {
  private chain: Promise<unknown> = Promise.resolve();
  private created = false;
  private layoutNow: Layout | null = null;
  private texts = new Map<number, string>();
  private images = new Map<number, Uint8Array>();
  private pending = new Map<number, () => HTMLCanvasElement>();
  private busy = new Set<number>();
  frames = 0; bytes = 0; imageMs = 0;
  /** Bumped on every screen change. Work queued by an earlier screen is dropped, so it cannot overwrite the new one. */
  generation = 0;
  constructor(private bridge: EvenAppBridge, private onError: (error: Error) => void) {}
  private run<T>(label: string, operation: () => Promise<T>, always = false): Promise<T | undefined> {
    const queuedFor = this.generation;
    const next = this.chain.then(() => (always || queuedFor === this.generation ? withTimeout(operation(), 8000, label) : undefined));
    this.chain = next.catch(error => { this.onError(error instanceof Error ? error : new Error(label)); });
    return next;
  }
  private props(layout: Layout) {
    const listCapture = Boolean(layout.list);
    const texts = [{ ...INPUT }, ...layout.texts].map((box, index) => new TextContainerProperty({
      containerID: box.id, containerName: box.name, xPosition: box.x, yPosition: box.y, width: box.w, height: box.h,
      borderWidth: box.border ?? 0, borderColor: 15, borderRadius: 4, paddingLength: box.padding ?? 6,
      isEventCapture: index === 0 && !listCapture ? 1 : 0, content: this.texts.get(box.id) ?? box.content, textColor: box.color ?? 4,
    }));
    const lists = layout.list ? [new ListContainerProperty({
      containerID: layout.list.id, containerName: layout.list.name, xPosition: layout.list.x, yPosition: layout.list.y,
      width: layout.list.w, height: layout.list.h, borderWidth: 0, paddingLength: 4, isEventCapture: 1,
      itemContainer: new ListItemContainerProperty({ itemCount: layout.list.items.length, itemWidth: layout.list.w - 8, isItemSelectBorderEn: 1, itemName: layout.list.items }),
    })] : [];
    const images = layout.images.map(box => new ImageContainerProperty({ containerID: box.id, containerName: box.name, xPosition: box.x, yPosition: box.y, width: box.w, height: box.h }));
    return { containerTotalNum: texts.length + images.length + lists.length, textObject: texts, imageObject: images, ...(lists.length ? { listObject: lists } : {}) };
  }
  /** Replace the page structure. Text and images already sent for kept containers are restored. */
  private structure = '';
  async layout(layout: Layout, keep = false, blank = true): Promise<void> {
    const structure = JSON.stringify([layout.texts.map(box => [box.id, box.x, box.y, box.w, box.h, box.color]), layout.images.map(box => [box.id, box.x, box.y, box.w, box.h]), layout.list ?? null]);
    // Same containers as the screen before: draw over it instead of rebuilding (no flash, no blank tiles).
    if (!keep && this.created && structure === this.structure) {
      this.layoutNow = layout; this.pending.clear();
      // A new screen must not show the last one's pictures; templates opt out to slide over them.
      if (blank) for (const box of layout.images) void this.image(box, canvas(box.w, box.h));
      return;
    }
    this.structure = structure;
    if (!keep) { this.texts.clear(); this.images.clear(); this.pending.clear(); }
    this.layoutNow = layout;
    await this.run('layout', async () => {
      for (const box of layout.texts) if (!this.texts.has(box.id)) this.texts.set(box.id, box.content);
      const props = this.props(layout);
      if (!this.created) {
        const result = await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(props));
        // A reloaded page may already own a surface; rebuild it instead.
        if (result !== StartUpPageCreateResult.success && await this.bridge.rebuildPageContainer(new RebuildPageContainer(props)) !== true) throw new Error(`Page creation rejected (${result})`);
        this.created = true;
      } else if (await this.bridge.rebuildPageContainer(new RebuildPageContainer(props)) !== true) throw new Error('Layout rejected');
      for (const box of layout.images) {
        const data = this.images.get(box.id);
        if (data) await this.send(box, data);
      }
    });
  }
  /** Set a text container. Growing text is rewritten in place; shorter text rebuilds the page (no padding). */
  async text(box: TextBox, content: string): Promise<void> {
    const previous = this.texts.get(box.id) ?? '';
    if (content === previous) return;
    const generation = this.generation;
    this.texts.set(box.id, content);
    if (generation !== this.generation) return;
    if (content.length < previous.length && this.layoutNow) return this.layout(this.layoutNow, true);
    await this.run('text', async () => {
      if (await this.bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: box.id, containerName: box.name, contentOffset: 0, contentLength: content.length, content })) !== true) throw new Error('Text rejected');
    });
  }
  private async send(box: Box, data: Uint8Array) {
    const started = performance.now();
    const result = await this.bridge.updateImageRawData(new ImageRawDataUpdate({ containerID: box.id, containerName: box.name, imageData: data }));
    if (!ImageRawDataUpdateResult.isSuccess(ImageRawDataUpdateResult.normalize(result))) throw new Error(`Image ${box.name} rejected`);
    this.frames++; this.bytes += data.length; this.imageMs += performance.now() - started;
  }
  /** Draw and send an image, waiting for the glasses to accept it. */
  async image(box: Box, canvas: HTMLCanvasElement, options: EncodeOptions = {}): Promise<void> {
    const generation = this.generation;
    const data = await encode(canvas, options.crisp ? { crisp: true, format: options.format ?? preferredFormat } : options);
    if (generation !== this.generation) return;
    const previous = this.images.get(box.id);
    if (previous && previous.length === data.length && previous.every((byte, index) => byte === data[index])) return;
    this.images.set(box.id, data);
    await this.run(`image ${box.name}`, () => this.send(box, data));
  }
  /** Send raw image bytes and report how long the glasses took, or -1 when the format is rejected. */
  async timed(box: Box, data: Uint8Array): Promise<number> {
    let ms = -1;
    await this.run(`bench ${box.name}`, async () => {
      const started = performance.now();
      const result = await this.bridge.updateImageRawData(new ImageRawDataUpdate({ containerID: box.id, containerName: box.name, imageData: data }));
      ms = ImageRawDataUpdateResult.isSuccess(ImageRawDataUpdateResult.normalize(result)) ? performance.now() - started : -1;
    }).catch(() => {});
    return ms;
  }
  async timedText(box: TextBox, content: string): Promise<number> {
    let ms = -1;
    await this.run('bench text', async () => {
      const started = performance.now();
      if (await this.bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: box.id, containerName: box.name, contentOffset: 0, contentLength: content.length, content })) === true) ms = performance.now() - started;
    }).catch(() => {});
    this.texts.set(box.id, content);
    return ms;
  }
  /** Latest-wins image updates for live data (IMU): frames that arrive while one is sending are coalesced. */
  latest(box: Box, draw: () => HTMLCanvasElement, options: EncodeOptions = {}) {
    this.pending.set(box.id, draw);
    if (this.busy.has(box.id)) return;
    this.busy.add(box.id);
    void (async () => {
      while (this.pending.has(box.id)) {
        const next = this.pending.get(box.id)!; this.pending.delete(box.id);
        try { await this.image(box, next(), options); } catch { break; }
      }
      this.busy.delete(box.id);
    })();
  }
  exit() { return this.run('exit', () => this.bridge.shutDownPageContainer(1), true); }
  imu(open: boolean) { return this.run('imu', () => this.bridge.imuControl(open, ImuReportPace.P100), true); }
}
export type Format = 'png' | 'raw8' | 'raw4';
export interface EncodeOptions { crisp?: boolean; format?: Format }
/** Fastest format measured on this link (set by the speed test); PNG until proven otherwise. */
let preferredFormat: Format = 'png';
async function encode(source: HTMLCanvasElement, options: EncodeOptions = {}): Promise<Uint8Array> {
  const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const format = options.format ?? 'png';
  if (format !== 'png') {
    // Raw grey bytes skip PNG encoding on the phone: one byte per pixel, or two pixels per byte.
    const grey = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < grey.length; i++) {
      const value = Math.max(pixels.data[i * 4]!, pixels.data[i * 4 + 1]!, pixels.data[i * 4 + 2]!);
      grey[i] = options.crisp ? (value >= 96 ? 255 : 0) : COMPENSATED[value]!;
    }
    if (format === 'raw8') return grey;
    const packed = new Uint8Array(Math.ceil(grey.length / 2));
    for (let i = 0; i < grey.length; i += 2) packed[i / 2] = ((grey[i]! >> 4) << 4) | (grey[i + 1] ?? 0) >> 4;
    return packed;
  }
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = Math.max(pixels.data[i]!, pixels.data[i + 1]!, pixels.data[i + 2]!);
    // Crisp: two levels only. Fewer distinct bytes compress better, so frames reach the glasses sooner.
    const level = options.crisp ? (value >= 96 ? 255 : 0) : COMPENSATED[value]!;
    pixels.data[i] = level; pixels.data[i + 1] = level; pixels.data[i + 2] = level; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG encode failed')), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------------------------------
// Drawing helpers. Bright strokes on black read best; mid-grey fills behind text do not.
function canvas(w = 288, h = 144, draw?: (ctx: CanvasRenderingContext2D) => void) {
  const element = document.createElement('canvas'); element.width = w; element.height = h;
  const ctx = element.getContext('2d')!; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; draw?.(ctx); return element;
}
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 13, color: string = C.green, weight = 800) {
  ctx.fillStyle = color; ctx.font = `${weight} ${size}px ${FONT}`; ctx.fillText(text, x, y);
}
function centered(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 13, color: string = C.green) {
  ctx.font = `800 ${size}px ${FONT}`; ctx.fillStyle = color; ctx.fillText(text, x - ctx.measureText(text).width / 2, y);
}
/** Split a 288 x 288 drawing into the two 288 x 144 tiles the glasses accept. */
function halves(full: HTMLCanvasElement): [HTMLCanvasElement, HTMLCanvasElement] {
  return [canvas(288, 144, ctx => ctx.drawImage(full, 0, 0, 288, 144, 0, 0, 288, 144)), canvas(288, 144, ctx => ctx.drawImage(full, 0, 144, 288, 144, 0, 0, 288, 144))];
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered dithering to four brightness steps: a photo-like texture the display shows crisply. */
function dither(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const image = ctx.getImageData(x, y, w, h); const steps = [0, 96, 180, 255];
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const i = (py * w + px) * 4; const value = Math.max(image.data[i]!, image.data[i + 1]!, image.data[i + 2]!) / 255 * 3;
    const level = Math.min(3, Math.floor(value + BAYER[(py % 4) * 4 + (px % 4)]! / 16));
    image.data[i] = 0; image.data[i + 1] = steps[level]!; image.data[i + 2] = 0;
  }
  ctx.putImageData(image, x, y);
}
type Person = { name: string; role: string; where: string; distance: string; hair: 'long' | 'short' | 'bun' | 'curly'; glasses: boolean; beard: boolean; skin: number };
const PEOPLE: Person[] = [
  { name: 'Maya Lin', role: 'Design lead, Northwind', where: 'Met at Founders Lunch', distance: '2 m away', hair: 'long', glasses: false, beard: false, skin: 0.82 },
  { name: 'Arjun Mehta', role: 'CTO, Fieldwork', where: 'Shared 3 contacts', distance: '5 m away', hair: 'short', glasses: true, beard: true, skin: 0.7 },
  { name: 'Lena Ortiz', role: 'Investor, Seedline', where: 'Asked about Eldr', distance: '8 m away', hair: 'bun', glasses: true, beard: false, skin: 0.9 },
  { name: 'Kofi Asante', role: 'Founder, Loop Health', where: 'Speaker at 4 pm', distance: '12 m away', hair: 'curly', glasses: false, beard: false, skin: 0.62 },
];
/** A synthetic, procedurally drawn portrait. No photos are bundled. */
function portrait(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, person: Person) {
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  const bg = ctx.createRadialGradient(cx, cy - r * 0.2, r * 0.2, cx, cy, r); bg.addColorStop(0, '#0d3322'); bg.addColorStop(1, '#000'); ctx.fillStyle = bg; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  const skin = (shade: number) => `rgb(0,${Math.round(255 * shade)},0)`;
  // shoulders
  const body = ctx.createLinearGradient(cx, cy + r * 0.3, cx, cy + r); body.addColorStop(0, '#2f8f5f'); body.addColorStop(1, '#0a2a1a');
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(cx, cy + r * 1.05, r * 0.8, r * 0.55, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = skin(person.skin * 0.6); ctx.fillRect(cx - r * 0.13, cy + r * 0.18, r * 0.26, r * 0.25);
  // hair behind
  ctx.fillStyle = '#1c5c3c';
  if (person.hair === 'long') { ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.02, r * 0.5, r * 0.62, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(cx - r * 0.5, cy - r * 0.05, r, r * 0.55); }
  if (person.hair === 'curly') for (let a = 0; a < 12; a++) { ctx.beginPath(); ctx.arc(cx + Math.cos(a / 12 * Math.PI * 2) * r * 0.36, cy - r * 0.18 + Math.sin(a / 12 * Math.PI * 2) * r * 0.32, r * 0.16, 0, Math.PI * 2); ctx.fill(); }
  // face with side light
  const face = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.25, r * 0.05, cx, cy - r * 0.05, r * 0.5);
  face.addColorStop(0, skin(person.skin)); face.addColorStop(1, skin(person.skin * 0.45));
  ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.08, r * 0.34, r * 0.43, 0, 0, Math.PI * 2); ctx.fill();
  // hair on top
  ctx.fillStyle = '#165036';
  if (person.hair !== 'curly') { ctx.beginPath(); ctx.ellipse(cx, cy - r * 0.38, r * 0.37, r * 0.2, 0, Math.PI, 0); ctx.fill(); }
  if (person.hair === 'short') { ctx.fillRect(cx - r * 0.37, cy - r * 0.4, r * 0.08, r * 0.2); ctx.fillRect(cx + r * 0.29, cy - r * 0.4, r * 0.08, r * 0.2); }
  if (person.hair === 'bun') { ctx.beginPath(); ctx.arc(cx, cy - r * 0.6, r * 0.15, 0, Math.PI * 2); ctx.fill(); }
  // features
  ctx.fillStyle = '#04140c';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + side * r * 0.13, cy - r * 0.1, r * 0.045, r * 0.03, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#082a18'; ctx.lineWidth = Math.max(1.5, r * 0.025);
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + side * r * 0.06, cy - r * 0.2); ctx.lineTo(cx + side * r * 0.2, cy - r * 0.22); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(cx, cy - r * 0.06); ctx.lineTo(cx - r * 0.04, cy + r * 0.07); ctx.lineTo(cx + r * 0.02, cy + r * 0.08); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy + r * 0.1, r * 0.11, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
  if (person.beard) { ctx.fillStyle = 'rgba(6,40,24,0.85)'; ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.16, r * 0.27, r * 0.2, 0, 0, Math.PI); ctx.fill(); }
  if (person.glasses) { ctx.strokeStyle = '#7dffc0'; ctx.lineWidth = Math.max(1.5, r * 0.03); for (const side of [-1, 1]) ctx.strokeRect(cx + side * r * 0.13 - r * 0.1, cy - r * 0.16, r * 0.2, r * 0.12); ctx.beginPath(); ctx.moveTo(cx - r * 0.03, cy - r * 0.1); ctx.lineTo(cx + r * 0.03, cy - r * 0.1); ctx.stroke(); }
  dither(ctx, Math.round(cx - r), Math.round(cy - r), Math.round(r * 2), Math.round(r * 2));
  ctx.restore();
  ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}
/** Temple touchpad legend: which finger motion does what. */
function gestureLegend(ctx: CanvasRenderingContext2D, highlight: string | null) {
  const rows: Array<[string, string, string]> = [['tap', 'TAP', 'action'], ['down', 'SCROLL', 'next screen'], ['hold', 'HOLD', 'pause / play'], ['double', '2x TAP', 'exit']];
  rows.forEach(([key, name, meaning], index) => {
    const y = 18 + index * 31; const on = highlight === key || (key === 'down' && highlight === 'up');
    ctx.strokeStyle = on ? C.green : C.panel; ctx.lineWidth = on ? 2 : 1; ctx.strokeRect(10, y - 13, 268, 25);
    label(ctx, name, 20, y + 4, 13, on ? C.green : C.dim); label(ctx, meaning, 120, y + 4, 13, on ? C.green : C.dim, 700);
  });
}

// ---------------------------------------------------------------------------------------------
// Scenes
const LEFT: TextBox = { id: 10, name: 'lab-left', x: 0, y: 0, w: 288, h: 288, content: ' ' };
const FULL: TextBox = { id: 10, name: 'lab-left', x: 0, y: 0, w: 576, h: 288, content: ' ' };
const TOP: Box = { id: 20, name: 'lab-top', x: 288, y: 0, w: 288, h: 144 };
const BOTTOM: Box = { id: 21, name: 'lab-bottom', x: 288, y: 144, w: 288, h: 144 };
const SPRITE: Box = { id: 22, name: 'lab-sprite', x: 360, y: 72, w: 144, h: 144 };
const SPLIT: Layout = { texts: [LEFT], images: [TOP, BOTTOM] };
/** Fit lines to the split pane: at most ten firmware lines, each within the pixel budget. */
function pane(lines: string[], fit: boolean | Box = false): string {
  // A box: wrap to its own width and keep to the lines its height shows (27 px each, 6 px padding).
  const width = typeof fit === 'object' ? Math.max(40, fit.w - 28) : fit ? G2_TEXT.fullWidth : G2_TEXT.splitWidth;
  const chars = typeof fit === 'object' ? Math.max(4, Math.floor(width / 5)) : fit ? G2_TEXT.fullChars : G2_TEXT.splitChars;
  const max = typeof fit === 'object' ? Math.max(1, Math.floor((fit.h - 12) / 27)) : G2_TEXT.maxLines;
  return lines.flatMap(line => wrapText(line, width, chars)).slice(0, max).join('\n');
}
type Gesture = { kind: 'tap' | 'up' | 'down' | 'double' | 'hold' | 'release'; source: string } | { kind: 'list'; index: number; name: string };
interface Ctx { s: Surface; signal: AbortSignal; sleep(ms: number): Promise<void>; imu: { x: number; y: number; z: number; at: number } | null; status: DeviceStatus | null }
interface Scene { id: string; title: string; seconds: number; run(ctx: Ctx): Promise<void>; gesture?(g: Gesture, ctx: Ctx): boolean }
let sceneState: Record<string, unknown> = {};

const SCENE_LIST: Scene[] = [
  { id: 'boot', title: 'Welcome', seconds: 4, async run({ s, sleep, signal }) {
    await s.layout(SPLIT);
    await s.text(LEFT, pane([`INTERFACE LAB  ${LAB_VERSION}`, '', 'Motion, templates and', 'new screen ideas for', 'the green display.', 'Each screen: 4 seconds.', '', 'SCROLL: next / back', 'HOLD: pause', ...(linkReport ? ['', 'Last speed test ran'] : [])]));
    void s.image(BOTTOM, canvas(288, 144, ctx => gestureLegend(ctx, null)));
    for (let frame = 0; !signal.aborted; frame++) {
      await s.image(TOP, canvas(288, 144, ctx => {
        for (let ring = 0; ring < 4; ring++) {
          const radius = ((frame * 9 + ring * 22) % 88) + 4; ctx.strokeStyle = radius < 60 ? C.green : C.dim; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(144, 72, radius, 0, Math.PI * 2); ctx.stroke();
        }
        centered(ctx, 'G2', 144, 78, 22);
      }));
      await sleep(60);
    }
  } },
  { id: 'gestures', title: 'Gesture trainer', seconds: 12, async run({ s }) {
    sceneState = { seen: [] as string[] };
    await s.layout(SPLIT);
    await s.text(LEFT, pane(['GESTURE TRAINER', '', 'Tap or hold on either', 'temple or the ring to', 'see where it came from.', '', 'SCROLL still changes', 'screens.']));
    await s.image(TOP, canvas(288, 144, ctx => gestureLegend(ctx, null)));
    await s.image(BOTTOM, canvas(288, 144, ctx => centered(ctx, 'WAITING FOR A GESTURE', 144, 78, 13, C.dim)));
  }, gesture(g, { s }) {
    if (g.kind === 'double' || g.kind === 'list' || g.kind === 'up' || g.kind === 'down') return false;
    const seen = sceneState.seen as string[];
    const name = { tap: 'TAP', up: 'SCROLL UP', down: 'SCROLL DOWN', hold: 'HOLD', release: 'RELEASE', double: '2x TAP' }[g.kind];
    seen.unshift(`${name} (${g.source})`); seen.length = Math.min(seen.length, 5);
    void s.image(TOP, canvas(288, 144, ctx => gestureLegend(ctx, g.kind)));
    void s.image(BOTTOM, canvas(288, 144, ctx => {
      centered(ctx, name, 144, 62, 26); centered(ctx, `from ${g.source}`, 144, 92, 13, C.cyan);
      if (g.kind === 'up' || g.kind === 'down') { ctx.fillStyle = C.green; const y = g.kind === 'down' ? 120 : 108; ctx.beginPath(); ctx.moveTo(134, y); ctx.lineTo(154, y); ctx.lineTo(144, g.kind === 'down' ? 132 : 96); ctx.fill(); }
    }));
    void s.text(LEFT, pane(['GESTURE TRAINER', '', ...seen, '', 'Double tap still exits.']));
    return true;
  } },
  { id: 'stream', title: 'Streaming answer', seconds: 12, async run({ s, sleep, signal }) {
    await s.layout(SPLIT);
    const answer = 'CLAUDE\n\nYour afternoon: design review at 2, call with Arjun at 3:30, gym at 6. The review room moved to Hall B.';
    let thinking = 0; let done = false;
    const orb = (async () => { while (!signal.aborted && !done) {
      await s.image(TOP, canvas(288, 144, ctx => { for (let dot = 0; dot < 3; dot++) { const on = (thinking + dot) % 3 === 0; ctx.fillStyle = on ? C.green : C.panel; ctx.beginPath(); ctx.arc(110 + dot * 34, 72, on ? 12 : 8, 0, Math.PI * 2); ctx.fill(); } centered(ctx, 'THINKING', 144, 118, 12, C.dim); }));
      thinking++; await sleep(120);
    } })();
    await sleep(1600);
    let text = '';
    for (const word of answer.split(/(?<=\s)/u)) { if (signal.aborted) return; text += word; await s.text(LEFT, pane(text.split('\n'))); await sleep(90); }
    done = true; await orb;
    const schedule = { ...artifactSchema.parse(examples.find(example => example.template === 'schedule')!), version: 1, expiresAt: 0 };
    const full = canvas(288, 288, ctx => renderArtifact(ctx, 'schedule', schedule.data, { scroll: 0 }));
    const [top, bottom] = halves(full); await s.image(TOP, top); await s.image(BOTTOM, bottom);
    await s.text(LEFT, pane([...text.split('\n'), '', 'Text streams natively;', 'the artifact lands after.']));
  } },
  { id: 'side', title: 'Side window', seconds: 12, async run({ s, sleep, signal }) {
    const card = { ...artifactSchema.parse(examples.find(example => example.template === 'card')!), version: 1, expiresAt: 0 };
    await preloadArtifactImages('card', card.data);
    const art = canvas(288, 288, ctx => renderArtifact(ctx, 'card', card.data, { scroll: 0 }));
    for (let loop = 0; loop < 2 && !signal.aborted; loop++) {
      await s.layout({ texts: [FULL], images: [] });
      await s.text(FULL, pane(['SIDE WINDOW', '', 'Full width while there is only an answer. When the agent has something to show, a 288 px window slides in on the right.', '', 'TAP: replay'], true));
      await sleep(1800);
      await s.layout(SPLIT);
      await s.text(LEFT, pane(['SIDE WINDOW', '', 'The answer reflows to', 'the left half while', 'the window opens.']));
      for (const t of [0.25, 0.5, 0.75, 1]) {
        if (signal.aborted) return;
        const frame = canvas(288, 288, ctx => { const x = Math.round(288 * (1 - t)); ctx.drawImage(art, x, 0); ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 1, 0); ctx.lineTo(x + 1, 288); ctx.stroke(); });
        const [top, bottom] = halves(frame); await s.image(TOP, top); await s.image(BOTTOM, bottom);
      }
      await sleep(2500);
    }
  } },
  { id: 'people', title: 'People nearby', seconds: 16, async run({ s, sleep, signal }) {
    await s.layout(SPLIT);
    sceneState = { index: 0, shown: -1 };
    while (!signal.aborted) {
      const index = (sceneState.index as number) % PEOPLE.length;
      if (index !== sceneState.shown) {
        sceneState.shown = index; const person = PEOPLE[index]!;
        await s.text(LEFT, pane([`PEOPLE NEARBY ${index + 1}/${PEOPLE.length}`, '', person.name.toUpperCase(), person.role, '', person.where, person.distance, '', 'TAP: next person']));
        await s.image(TOP, canvas(288, 144, ctx => { portrait(ctx, 72, 72, 64, person); label(ctx, person.name.split(' ')[0]!.toUpperCase(), 150, 56, 18); label(ctx, person.distance.toUpperCase(), 150, 82, 12, C.cyan); }));
        await s.image(BOTTOM, canvas(288, 144, ctx => {
          PEOPLE.forEach((other, at) => { const x = 36 + at * 72; ctx.strokeStyle = at === index ? C.green : C.panel; ctx.lineWidth = at === index ? 2.5 : 1; ctx.beginPath(); ctx.arc(x, 56, 24, 0, Math.PI * 2); ctx.stroke(); centered(ctx, other.name.split(' ').map(part => part[0]).join(''), x, 61, 13, at === index ? C.green : C.dim); });
          centered(ctx, 'SYNTHETIC PEOPLE, DRAWN IN CODE', 144, 118, 10, C.dim);
        }));
      }
      await sleep(4000); if (!signal.aborted && sceneState.shown === index) sceneState.index = index + 1;
    }
  }, gesture(g) { if (g.kind !== 'tap') return false; sceneState.index = (sceneState.index as number) + 1; return true; } },
  { id: 'imu', title: 'Head tracking (IMU)', seconds: 16, async run(ctx) {
    const { s, sleep, signal } = ctx;
    await s.layout(SPLIT);
    await s.text(LEFT, pane(['HEAD TRACKING', '', 'Tilt your head slowly.', 'The horizon follows the', 'glasses IMU. Nod for', 'yes, tilt twice for no.', '', 'Waiting for IMU data...']));
    try { await s.imu(true); } catch { await s.text(LEFT, pane(['HEAD TRACKING', '', 'The IMU did not start.'])); return; }
    let zero: { x: number; y: number; z: number } | null = null; let lastText = 0; const pitches: Array<[number, number]> = []; let gestureLabel = '';
    while (!signal.aborted) {
      const sample = ctx.imu;
      if (sample) {
        zero ??= { ...sample };
        const roll = Math.atan2(sample.y, sample.z) - Math.atan2(zero.y, zero.z);
        const pitch = Math.atan2(-sample.x, Math.hypot(sample.y, sample.z)) - Math.atan2(-zero.x, Math.hypot(zero.y, zero.z));
        pitches.push([performance.now(), pitch]); while (pitches.length && pitches[0]![0] < performance.now() - 1200) pitches.shift();
        const range = Math.max(...pitches.map(p => p[1])) - Math.min(...pitches.map(p => p[1]));
        if (range > 0.35 && Math.abs(pitch) < 0.12) { gestureLabel = 'NOD: YES'; pitches.length = 0; }
        s.latest(TOP, () => canvas(288, 144, g => {
          g.save(); g.translate(144, 72 + pitch * 120); g.rotate(-roll); g.strokeStyle = C.green; g.lineWidth = 3; g.beginPath(); g.moveTo(-200, 0); g.lineTo(200, 0); g.stroke();
          g.lineWidth = 1; g.strokeStyle = C.dim; for (const d of [-40, -20, 20, 40]) { g.beginPath(); g.moveTo(-30, d); g.lineTo(30, d); g.stroke(); } g.restore();
          g.strokeStyle = C.green; g.lineWidth = 2; g.beginPath(); g.moveTo(114, 72); g.lineTo(134, 72); g.lineTo(144, 82); g.lineTo(154, 72); g.lineTo(174, 72); g.stroke();
        }));
        if (performance.now() - lastText > 700) {
          lastText = performance.now();
          const deg = (value: number) => `${value >= 0 ? '+' : ''}${(value * 180 / Math.PI).toFixed(0)}`;
          void s.text(LEFT, pane(['HEAD TRACKING', '', `ROLL ${deg(roll)}  PITCH ${deg(pitch)}`, `RAW ${sample.x.toFixed(2)} ${sample.y.toFixed(2)} ${sample.z.toFixed(2)}`, '', gestureLabel || 'Nod to try a gesture', '', 'Data: imuControl, 100 ms']));
          if (gestureLabel) s.latest(BOTTOM, () => canvas(288, 144, g => { centered(g, gestureLabel, 144, 80, 28); }));
        }
      }
      await sleep(80);
    }
  } },
  { id: 'toast', title: 'Notification', seconds: 8, async run({ s, sleep, signal }) {
    await s.layout({ texts: [LEFT], images: [TOP] });
    await s.text(LEFT, pane(['NOTIFICATIONS', '', 'A toast slides in,', 'counts down and leaves', 'without moving the', 'answer.']));
    const toast = (x: number, remaining: number) => canvas(288, 144, ctx => {
      ctx.save(); ctx.translate(x, 0); ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.strokeRect(12, 22, 264, 100);
      label(ctx, 'PRIYA', 28, 52, 16); label(ctx, 'now', 220, 52, 12, C.dim, 700); label(ctx, 'Running 5 min late,', 28, 78, 14, C.green, 700); label(ctx, 'start without me', 28, 98, 14, C.green, 700);
      ctx.fillStyle = C.green; ctx.fillRect(14, 116, Math.round(260 * remaining), 4); ctx.restore();
    });
    for (const x of [220, 140, 60, 0]) { if (signal.aborted) return; await s.image(TOP, toast(x, 1)); }
    for (let step = 10; step >= 0 && !signal.aborted; step--) { await s.image(TOP, toast(0, step / 10)); await sleep(200); }
    for (const x of [80, 180, 288]) { if (signal.aborted) return; await s.image(TOP, toast(x, 0)); }
  } },
  { id: 'progress', title: 'Progress', seconds: 8, async run({ s, sleep, signal }) {
    await s.layout({ texts: [LEFT], images: [TOP, BOTTOM] });
    await s.text(LEFT, pane(['PROGRESS', '', 'Uploading the build', 'to TestFlight...']));
    for (let p = 0; p <= 100 && !signal.aborted; p += 10) {
      const full = canvas(288, 288, ctx => {
        ctx.strokeStyle = C.panel; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(144, 144, 90, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = C.green; ctx.beginPath(); ctx.arc(144, 144, 90, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p / 100); ctx.stroke();
        if (p < 100) centered(ctx, `${p}%`, 144, 156, 34);
        else { ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(108, 146); ctx.lineTo(134, 172); ctx.lineTo(184, 116); ctx.stroke(); }
      });
      const [top, bottom] = halves(full); await s.image(TOP, top); await s.image(BOTTOM, bottom); await sleep(150);
    }
    await s.text(LEFT, pane(['PROGRESS', '', 'Uploading the build', 'to TestFlight... done.', '', 'Build 42 is live.']));
  } },
  { id: 'list', title: 'Native list (fast)', seconds: 12, async run({ s }) {
    const items = ['Inbox  12', 'Calendar  3 today', 'Messages  Priya', 'Build status', 'Weather  24 C', 'Navigation', 'Notes', 'Settings'];
    sceneState = { items };
    await s.layout({ texts: [], images: [TOP, BOTTOM], list: { id: 30, name: 'lab-list', x: 0, y: 0, w: 288, h: 288, items } });
    await s.image(TOP, canvas(288, 144, ctx => { label(ctx, 'NATIVE LIST', 16, 30, 16); label(ctx, 'The firmware moves', 16, 60, 13, C.green, 700); label(ctx, 'the highlight itself:', 16, 80, 13, C.green, 700); label(ctx, 'no image transfer.', 16, 100, 13, C.green, 700); }));
    await s.image(BOTTOM, canvas(288, 144, ctx => centered(ctx, 'SCROLL, THEN TAP AN ITEM', 144, 76, 13, C.dim)));
  }, gesture(g, { s }) {
    if (g.kind !== 'list') return false;
    void s.image(BOTTOM, canvas(288, 144, ctx => { centered(ctx, 'SELECTED', 144, 50, 12, C.dim); centered(ctx, g.name.toUpperCase().slice(0, 18), 144, 86, 20); centered(ctx, `index ${g.index}`, 144, 114, 12, C.cyan); }));
    return true;
  } },
  { id: 'brightness', title: 'Brightness levels', seconds: 8, async run({ s }) {
    const rows = [0, 1, 2, 3, 4].map(level => ({ id: 11 + level, name: `lab-l${level}`, x: 0, y: 40 + level * 48, w: 288, h: 46, content: `TEXT LEVEL ${level}`, color: level, padding: 4 }));
    await s.layout({ texts: [{ id: 10, name: 'lab-left', x: 0, y: 0, w: 288, h: 40, content: 'NATIVE TEXT BRIGHTNESS', padding: 6 }, ...rows], images: [TOP, BOTTOM] });
    const full = canvas(288, 288, ctx => {
      label(ctx, 'IMAGE LEVELS AFTER', 16, 24, 12); label(ctx, 'TONE COMPENSATION', 16, 42, 12);
      [0, 96, 131, 157, 179, 197, 214, 230, 244, 255].forEach((v, i) => { ctx.fillStyle = `rgb(0,${v},0)`; ctx.fillRect(16 + i * 26, 64, 22, 150); });
      label(ctx, 'Dim fills read as', 16, 244, 12, C.dim, 700); label(ctx, 'grey, not white.', 16, 262, 12, C.dim, 700);
    });
    const [top, bottom] = halves(full); await s.image(TOP, top); await s.image(BOTTOM, bottom);
  } },
  { id: 'device', title: 'Your glasses', seconds: 12, async run(ctx) {
    const { s, sleep, signal } = ctx;
    await s.layout(SPLIT);
    const info = await bridge?.getDeviceInfo().catch(() => null) ?? null;
    const user = await bridge?.getUserInfo().catch(() => null) ?? null;
    while (!signal.aborted) {
      const status = ctx.status ?? info?.status ?? null;
      const battery = status?.batteryLevel;
      await s.text(LEFT, pane(['YOUR GLASSES', '', `${(info?.model ?? 'g2').toUpperCase()} · SN ...${(info?.sn ?? '????').slice(-4)}`, `Battery ${battery ?? '?'}%${status?.isCharging ? ' charging' : ''}`, status?.isWearing === undefined ? 'Wearing: unknown' : status.isWearing ? 'Wearing: yes' : 'Wearing: no', status?.isInCase ? 'In the case' : `Link: ${status?.connectType ?? '?'}`, `Opened from: ${launchSource}`, user?.name ? `Hi ${user.name.split(' ')[0]}` : '']));
      await s.image(TOP, canvas(288, 144, g => {
        g.strokeStyle = C.green; g.lineWidth = 3; g.strokeRect(70, 40, 130, 64); g.fillRect(200, 60, 10, 24);
        const level = Math.max(0, Math.min(100, battery ?? 0)); g.fillStyle = C.green; g.fillRect(76, 46, Math.round(118 * level / 100), 52);
        centered(g, battery === undefined ? '?' : `${level}%`, 135, 130, 14, C.cyan);
      }));
      await s.image(BOTTOM, canvas(288, 144, g => { label(g, 'SDK DATA POINTS', 16, 26, 12); ['device info + live status', 'battery, wearing, case', 'user name, country', 'launch source', 'IMU x y z (100-1000 ms)', 'touch source L / R / ring', 'phone location, camera'].forEach((line, i) => label(g, line, 16, 46 + i * 14, 11, C.dim, 700)); }));
      await sleep(4000);
    }
  } },
  { id: 'end', title: 'The end', seconds: 8, async run({ s }) {
    await s.layout({ texts: [FULL], images: [] });
    await s.text(FULL, pane(['THAT IS THE LAB', '', 'Streaming text, a side window, motion, people, head tracking, toasts, progress, native lists, brightness, device data and twelve templates.', '', 'SCROLL UP to go back. DOUBLE TAP to exit.'], true));
  } },
];


// ---------------------------------------------------------------------------------------------
// Motion reel: time-based animations, so they look right at whatever frame rate Bluetooth allows.
type Anim = { id: string; title: string; use: string; wide: boolean; draw(g: CanvasRenderingContext2D, t: number, w: number, h: number): void };
const rand = (seed: number) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };
const ANIMATIONS: Anim[] = [
  { id: 'cube', title: 'Wireframe cube', use: '3D objects, product views', wide: false, draw(g, t) {
    const a = t * 1.6; const points = [-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z])));
    const project = ([x, y, z]: number[]) => { const rx = x! * Math.cos(a) - z! * Math.sin(a); const rz = x! * Math.sin(a) + z! * Math.cos(a); const ry = y! * Math.cos(a * 0.7) - rz * Math.sin(a * 0.7); const depth = 3 + y! * Math.sin(a * 0.7) + rz * Math.cos(a * 0.7); return [72 + rx * 120 / depth, 72 + ry * 120 / depth]; };
    g.strokeStyle = C.green; g.lineWidth = 2;
    points.forEach((p, i) => points.forEach((q, j) => { if (j > i && p.filter((v, k) => v !== q[k]).length === 1) { const [x1, y1] = project(p); const [x2, y2] = project(q); g.beginPath(); g.moveTo(x1!, y1!); g.lineTo(x2!, y2!); g.stroke(); } }));
  } },
  { id: 'radar', title: 'Radar sweep', use: 'People and places nearby', wide: false, draw(g, t) {
    g.strokeStyle = C.panel; g.lineWidth = 1; for (const r of [22, 44, 66]) { g.beginPath(); g.arc(72, 72, r, 0, Math.PI * 2); g.stroke(); }
    const angle = t * 2.4; g.strokeStyle = C.green; g.lineWidth = 3; g.beginPath(); g.moveTo(72, 72); g.lineTo(72 + Math.cos(angle) * 66, 72 + Math.sin(angle) * 66); g.stroke();
    for (const [bx, by] of [[104, 40], [38, 96], [112, 104], [50, 34]]) { const since = ((angle - Math.atan2(by! - 72, bx! - 72)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); if (since < 2.5) { g.fillStyle = since < 0.8 ? C.green : C.dim; g.beginPath(); g.arc(bx!, by!, 5, 0, Math.PI * 2); g.fill(); } }
  } },
  { id: 'equalizer', title: 'Equalizer', use: 'Music, recording level', wide: true, draw(g, t, _w, h) {
    for (let bar = 0; bar < 18; bar++) { const v = 0.15 + 0.85 * Math.abs(Math.sin(t * 4 + bar * 0.7) * Math.cos(t * 1.3 + bar * 0.31)); const bh = v * (h - 30); g.fillStyle = v > 0.7 ? C.green : C.dim; g.fillRect(12 + bar * 15, h - 14 - bh, 10, bh); }
  } },
  { id: 'orbit', title: 'Orbits', use: 'Syncing, waiting on the agent', wide: false, draw(g, t) {
    g.strokeStyle = C.panel; g.lineWidth = 1; for (const r of [36, 58]) { g.beginPath(); g.arc(72, 72, r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = C.green; g.beginPath(); g.arc(72, 72, 13, 0, Math.PI * 2); g.fill();
    for (const [r, speed, size] of [[36, 2.2, 6], [58, -1.4, 8]]) for (let trail = 4; trail >= 0; trail--) { const a = (t - trail * 0.06) * speed!; g.fillStyle = trail ? C.panel : C.green; g.beginPath(); g.arc(72 + Math.cos(a) * r!, 72 + Math.sin(a) * r!, trail ? size! * 0.6 : size!, 0, Math.PI * 2); g.fill(); }
  } },
  { id: 'heartbeat', title: 'Heartbeat', use: 'Health, live vitals', wide: true, draw(g, t, w, h) {
    const beat = (x: number) => { const p = ((x % 90) + 90) % 90; return p < 30 ? 0 : p < 36 ? -(p - 30) * 6 : p < 42 ? -36 + (p - 36) * 12 : p < 48 ? 36 - (p - 42) * 6 : 0; };
    g.strokeStyle = C.panel; g.lineWidth = 1; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    g.strokeStyle = C.green; g.lineWidth = 2.5; g.beginPath();
    for (let x = 0; x < w - 40; x += 2) { const y = h / 2 + 10 + beat(x + t * 140) ; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke(); label(g, `${72 + Math.round(Math.sin(t) * 3)} BPM`, w - 80, 24, 14, C.cyan);
  } },
  { id: 'clock', title: 'Clock', use: 'Glance time, timers', wide: false, draw(g) {
    const now = new Date(); const s = now.getSeconds() + now.getMilliseconds() / 1000; const m = now.getMinutes() + s / 60; const hr = (now.getHours() % 12) + m / 60;
    g.strokeStyle = C.dim; g.lineWidth = 2; g.beginPath(); g.arc(72, 72, 62, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.strokeStyle = C.green; g.beginPath(); g.moveTo(72 + Math.cos(a) * 54, 72 + Math.sin(a) * 54); g.lineTo(72 + Math.cos(a) * 60, 72 + Math.sin(a) * 60); g.stroke(); }
    const hand = (value: number, length: number, width: number, color: string) => { const a = value * Math.PI * 2 - Math.PI / 2; g.strokeStyle = color; g.lineWidth = width; g.beginPath(); g.moveTo(72, 72); g.lineTo(72 + Math.cos(a) * length, 72 + Math.sin(a) * length); g.stroke(); };
    hand(hr / 12, 32, 5, C.green); hand(m / 60, 46, 3, C.green); hand(s / 60, 52, 1.5, C.cyan);
  } },
  { id: 'starfield', title: 'Warp starfield', use: 'Launches, transitions', wide: true, draw(g, t, w, h) {
    for (let i = 0; i < 70; i++) { const a = rand(i) * Math.PI * 2; const z = (rand(i + 99) + t * 0.45) % 1; const r = z * z * 170; const len = 2 + z * 18;
      g.strokeStyle = z > 0.6 ? C.green : C.dim; g.lineWidth = z > 0.6 ? 2 : 1; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); g.lineTo(w / 2 + Math.cos(a) * (r + len), h / 2 + Math.sin(a) * (r + len)); g.stroke(); }
  } },
  { id: 'bounce', title: 'Bouncing ball', use: 'Playful empty states', wide: true, draw(g, t, w, h) {
    const x = 20 + ((t * 70) % (2 * (w - 40))); const px = x > w - 20 ? 2 * (w - 20) - x : x; const phase = Math.abs(Math.sin(t * 3.2)); const y = h - 22 - phase * 90; const squash = phase < 0.12 ? 1.35 : 1;
    g.fillStyle = C.panel; g.beginPath(); g.ellipse(px, h - 12, 16 * (1.2 - phase * 0.6), 4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.green; g.beginPath(); g.ellipse(px, y, 12 * squash, 12 / squash, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.dim; g.lineWidth = 1; g.beginPath(); g.moveTo(10, h - 10); g.lineTo(w - 10, h - 10); g.stroke();
  } },
  { id: 'rain', title: 'Code rain', use: 'Agent busy, background work', wide: true, draw(g, t, _w, h) {
    g.font = `700 12px ${FONT}`; const glyphs = '01<>{}[]=+*/';
    for (let col = 0; col < 24; col++) { const speed = 60 + rand(col) * 90; const head = ((t * speed + rand(col + 7) * 400) % (h + 120)) - 20;
      for (let k = 0; k < 8; k++) { const y = head - k * 14; if (y < 0 || y > h) continue; g.fillStyle = k === 0 ? C.green : k < 3 ? C.dim : C.panel; g.fillText(glyphs[Math.floor(rand(col * 31 + Math.floor((t * 6 + k))) * glyphs.length)]!, 6 + col * 12, y); } }
  } },
  { id: 'loaders', title: 'Loaders', use: 'Waiting, uploads, syncing', wide: true, draw(g, t, _w, h) {
    const a = t * 5; g.strokeStyle = C.panel; g.lineWidth = 6; g.beginPath(); g.arc(52, h / 2, 26, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = C.green; g.beginPath(); g.arc(52, h / 2, 26, a, a + 1.6); g.stroke();
    for (let d = 0; d < 3; d++) { const on = Math.floor(t * 4) % 3 === d; g.fillStyle = on ? C.green : C.panel; g.beginPath(); g.arc(122 + d * 20, h / 2, on ? 8 : 6, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = C.dim; g.lineWidth = 1.5; g.strokeRect(194, h / 2 - 8, 82, 16); const p = (t * 0.6) % 1; g.fillStyle = C.green; g.fillRect(196 + Math.max(0, (p - 0.3)) * 78, h / 2 - 6, Math.min(p, 0.3) * 78 + Math.max(0, 0.3 - Math.max(0, p - 0.7)) * 0, 12);
  } },
  { id: 'waves', title: 'Voice waves', use: 'Listening, speaking', wide: true, draw(g, t, w, h) {
    for (const [freq, amp, speed, color, width] of [[0.045, 26, 3, C.panel, 1.5], [0.03, 34, -2, C.dim, 1.5], [0.06, 18, 4.5, C.green, 2.5]] as Array<[number, number, number, string, number]>) {
      g.strokeStyle = color; g.lineWidth = width; g.beginPath();
      for (let x = 0; x <= w; x += 3) { const env = Math.sin(Math.PI * x / w); const y = h / 2 + Math.sin(x * freq + t * speed) * amp * env * (0.6 + 0.4 * Math.sin(t * 2)); if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke(); }
  } },
  { id: 'compass', title: 'Compass', use: 'Walking directions', wide: false, draw(g, t) {
    const heading = Math.sin(t * 0.9) * 70; g.save(); g.translate(72, 72); g.rotate(-heading * Math.PI / 180);
    g.strokeStyle = C.dim; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.stroke();
    ['N', 'E', 'S', 'W'].forEach((d, i) => { g.save(); g.rotate(i * Math.PI / 2); g.fillStyle = i === 0 ? C.green : C.dim; g.font = `800 14px ${FONT}`; g.fillText(d, -5, -40); g.restore(); });
    g.fillStyle = C.green; g.beginPath(); g.moveTo(0, -30); g.lineTo(7, 0); g.lineTo(-7, 0); g.fill(); g.restore();
    centered(g, `${Math.round((heading + 360) % 360)}°`, 72, 140, 11, C.cyan);
  } },
  { id: 'helix', title: 'Helix', use: 'Data, science, loading', wide: true, draw(g, t, w, h) {
    for (let x = 8; x < w - 8; x += 12) { const a = x * 0.05 + t * 2.5; const y1 = h / 2 + Math.sin(a) * 40; const y2 = h / 2 - Math.sin(a) * 40; const front = Math.cos(a) > 0;
      g.strokeStyle = C.panel; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y1); g.lineTo(x, y2); g.stroke();
      g.fillStyle = front ? C.green : C.dim; g.beginPath(); g.arc(x, y1, front ? 4 : 3, 0, Math.PI * 2); g.fill(); g.fillStyle = front ? C.dim : C.green; g.beginPath(); g.arc(x, y2, front ? 3 : 4, 0, Math.PI * 2); g.fill(); }
  } },
  { id: 'tunnel', title: 'Tunnel', use: 'Focus mode, deep work', wide: false, draw(g, t) {
    for (let i = 0; i < 7; i++) { const z = (t * 0.5 + i / 7) % 1; const size = 6 + z * z * 136; g.strokeStyle = z > 0.55 ? C.green : z > 0.25 ? C.dim : C.panel; g.lineWidth = 1 + z * 2; g.save(); g.translate(72, 72); g.rotate(z * 0.8); g.strokeRect(-size / 2, -size / 2, size, size); g.restore(); }
  } },
  { id: 'ping', title: 'Notification ping', use: 'Incoming message', wide: false, draw(g, t) {
    for (let i = 0; i < 3; i++) { const p = (t * 0.8 + i / 3) % 1; g.strokeStyle = p < 0.5 ? C.green : C.dim; g.lineWidth = 2 * (1 - p) + 0.5; g.beginPath(); g.arc(72, 72, 16 + p * 54, 0, Math.PI * 2); g.stroke(); }
    const swing = Math.sin(t * 9) * 0.25 * Math.max(0, Math.sin(t * 1.6)); g.save(); g.translate(72, 58); g.rotate(swing);
    g.fillStyle = C.green; g.beginPath(); g.moveTo(-16, 22); g.quadraticCurveTo(-16, -6, 0, -8); g.quadraticCurveTo(16, -6, 16, 22); g.closePath(); g.fill(); g.fillRect(-20, 20, 40, 5); g.beginPath(); g.arc(0, 30, 5, 0, Math.PI * 2); g.fill(); g.restore();
  } },
  { id: 'type', title: 'Big type', use: 'Headlines, scores, alerts', wide: true, draw(g, t, w, h) {
    const word = 'HELLO G2'; const shown = Math.min(word.length, Math.floor((t % 4) * 4));
    g.font = `800 40px ${FONT}`; const text = word.slice(0, shown); const x = (w - g.measureText(word).width) / 2;
    g.fillStyle = C.green; g.fillText(text, x, h / 2 + 14);
    if (Math.floor(t * 3) % 2 === 0) { g.fillRect(x + g.measureText(text).width + 4, h / 2 - 16, 14, 32); }
  } },
];
const MOTION_SCENES: Scene[] = ANIMATIONS.map((anim, index) => ({
  id: `motion-${anim.id}`, title: `Motion · ${anim.title}`, seconds: 4,
  async run({ s, sleep, signal }) {
    const box = anim.wide ? TOP : SPRITE;
    await s.layout(anim.wide ? { texts: [LEFT], images: [TOP] } : { texts: [LEFT], images: [SPRITE] });
    const caption = (fps: string) => pane([`MOTION ${index + 1}/${ANIMATIONS.length}`, '', anim.title.toUpperCase(), `For: ${anim.use}`, '', fps, '', 'SCROLL: next', 'HOLD: pause']);
    await s.text(LEFT, caption('measuring fps...'));
    const started = performance.now(); let frames = 0;
    while (!signal.aborted) {
      const t = (performance.now() - started) / 1000;
      await s.image(box, canvas(anim.wide ? 288 : 144, anim.wide ? 144 : 144, g => anim.draw(g, t, anim.wide ? 288 : 144, 144)), { crisp: true });
      frames++;
      if (frames === 6) await s.text(LEFT, caption(`${(frames / ((performance.now() - started) / 1000)).toFixed(1)} fps on your link`));
      await sleep(5);
    }
  },
}));
const TEMPLATE_TIPS: Record<string, string> = {
  list: 'SCROLL moves one row. TAP opens the answer.', schedule: 'SCROLL moves through events.', image: 'A fixed picture. TAP for the answer.',
  image_grid: 'Up to four pictures in one view.', list_thumbnails: 'SCROLL through rows with pictures.', card: 'One entity: title, image, facts.',
  calendar: 'A month with marked days.', checklist: 'Live plan: the active step glows.', choices: 'SCROLL to an option, TAP to answer.',
  stat: 'Big numbers with a trend line.', directions: 'SCROLL advances to the next turn.', code: 'A diff hunk, + and - marked.',
};
let previousArt: HTMLCanvasElement | null = null;
const TEMPLATE_SCENES: Scene[] = examples.map((example, index) => ({
  id: `template-${example.template}`, title: `Template · ${allTemplates().find(template => template.id === example.template)?.title ?? example.template}`, seconds: 4,
  async run({ s, sleep, signal }) {
    const artifact = { ...artifactSchema.parse(example), version: 1, expiresAt: 0 };
    const title = allTemplates().find(template => template.id === example.template)?.title ?? example.template;
    await s.layout(SPLIT, false, false);
    await s.text(LEFT, pane([`TEMPLATE ${index + 1}/${examples.length}`, '', title.toUpperCase(), '', TEMPLATE_TIPS[example.template] ?? '', '', 'In the harness the agent', 'picks these for you.']));
    await preloadArtifactImages(example.template, artifact.data);
    const art = (scroll: number) => canvas(288, 288, g => renderArtifact(g, example.template, artifact.data, { scroll, chosen: null }));
    const first = art(0); const old = previousArt;
    // Slide the new template in over the previous one.
    for (const t of old ? [0.34, 0.67] : []) {
      if (signal.aborted) return;
      const [top, bottom] = halves(canvas(288, 288, g => { g.drawImage(old!, -Math.round(288 * t), 0); g.drawImage(first, Math.round(288 * (1 - t)), 0); g.strokeStyle = C.green; g.lineWidth = 2; g.beginPath(); g.moveTo(Math.round(288 * (1 - t)), 0); g.lineTo(Math.round(288 * (1 - t)), 288); g.stroke(); }));
      await s.image(TOP, top); await s.image(BOTTOM, bottom);
    }
    previousArt = first;
    const steps = Math.min(3, maxScroll(artifact));
    for (let scroll = 0; scroll <= steps && !signal.aborted; scroll++) {
      const frame = scroll ? art(scroll) : first; previousArt = frame;
      const [top, bottom] = halves(frame); await s.image(TOP, top); await s.image(BOTTOM, bottom);
      await sleep(steps ? 2600 / (steps + 1) : 2600);
    }
  },
}));


// ---------------------------------------------------------------------------------------------
// Speed test and full-screen scenes. Full screen = a detailed backdrop sent once, native text for
// anything that changes often, and one small crisp sprite for motion: the only way to stay smooth.
const BENCH_TEXT: TextBox = { id: 10, name: 'lab-left', x: 0, y: 0, w: 288, h: 180, content: ' ' };
const BENCH_TT: TextBox = { id: 11, name: 'lab-tt', x: 0, y: 180, w: 288, h: 108, content: ' ' };
const BENCH_A: Box = { id: 20, name: 'lab-top', x: 288, y: 0, w: 288, h: 144 };
const BENCH_B: Box = { id: 21, name: 'lab-b', x: 288, y: 144, w: 144, h: 144 };
const BENCH_C: Box = { id: 22, name: 'lab-c', x: 432, y: 168, w: 96, h: 96 };
const TILE = (id: number, x: number, y: number): Box => ({ id, name: `lab-t${id}`, x, y, w: 288, h: 144 });
const QUAD = [TILE(20, 0, 0), TILE(21, 288, 0), TILE(22, 0, 144), TILE(23, 288, 144)];
const busy = (w: number, h: number, t: number) => canvas(w, h, g => { for (let bar = 0; bar < w / 12; bar++) { const v = Math.abs(Math.sin(t + bar * 0.6)); g.fillStyle = v > 0.6 ? C.green : C.dim; g.fillRect(4 + bar * 12, h - 8 - v * (h - 16), 8, v * (h - 16)); } g.strokeStyle = C.green; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 3, t, t + 2); g.stroke(); });
let linkReport = '';
const rate = (ms: number) => (ms <= 0 ? 0 : Math.round(10000 / Math.max(ms, 1)) / 10);
const benchScene: Scene = { id: 'bench', title: 'Link speed test', seconds: 40, async run({ s, signal, sleep }) {
  await s.layout({ texts: [BENCH_TEXT, BENCH_TT], images: [BENCH_A, BENCH_B, BENCH_C] });
  const samples: Array<Record<string, string | number>> = [];
  const variants: Array<{ name: string; box: Box; options: EncodeOptions }> = [
    { name: '288x144 smooth png', box: BENCH_A, options: {} },
    { name: '288x144 crisp png', box: BENCH_A, options: { crisp: true } },
    { name: '144x144 crisp png', box: BENCH_B, options: { crisp: true } },
    { name: '96x96 crisp png', box: BENCH_C, options: { crisp: true } },
    { name: '144x144 raw8', box: BENCH_B, options: { crisp: true, format: 'raw8' } },
    { name: '144x144 raw4', box: BENCH_B, options: { crisp: true, format: 'raw4' } },
  ];
  const lines: string[] = [];
  const show = (status: string) => s.text(BENCH_TEXT, pane(['LINK SPEED TEST', status, '', ...lines.slice(-5)]));
  for (const [index, variant] of variants.entries()) {
    if (signal.aborted) return;
    await show(`${index + 1}/9 ${variant.name}`);
    const times: number[] = []; let bytes = 0;
    for (let frame = 0; frame < 6 && !signal.aborted; frame++) {
      const data = await encode(busy(variant.box.w, variant.box.h, frame * 0.9), variant.options); bytes += data.length;
      times.push(await s.timed(variant.box, data));
      if (frame === 0 && times[0]! < 0) break; // rejected or timed out: do not wait on it five more times
    }
    const ok = times.filter(ms => ms >= 0); const avg = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : -1;
    samples.push({ test: variant.name, ms: Math.round(avg), fps: rate(avg), bytes: Math.round(bytes / times.length), rejected: times.length - ok.length });
    lines.push(avg > 0 ? `${variant.name.replace(' png', '')} ${rate(avg)}` : `${variant.name} rejected`);
    if (variant.name === '144x144 raw8' && avg > 0) {
      const png = samples.find(sample => sample.test === '144x144 crisp png');
      if (png && Number(png.ms) > avg) preferredFormat = 'raw8';
    }
  }
  for (const length of [120, 400]) {
    if (signal.aborted) return;
    await show(`${length === 120 ? 7 : 8}/9 text ${length} chars`);
    const times: number[] = [];
    for (let frame = 0; frame < 6 && !signal.aborted; frame++) times.push(await s.timedText(BENCH_TT, `${frame % 2 ? 'Tick' : 'Tock'} ${'native text update '.repeat(30)}`.slice(0, length)));
    const ok = times.filter(ms => ms >= 0); const avg = ok.reduce((a, b) => a + b, 0) / Math.max(1, ok.length);
    samples.push({ test: `text ${length}`, ms: Math.round(avg), perSecond: rate(avg) });
    lines.push(`text ${length} ${rate(avg)}/s`);
  }
  if (signal.aborted) return;
  await show('9/9 full screen, 4 tiles'); await sleep(300);
  await s.layout({ texts: [], images: QUAD });
  const started = performance.now(); let frames = 0;
  for (let frame = 0; frame < 3 && !signal.aborted; frame++) { for (const box of QUAD) await s.timed(box, await encode(busy(288, 144, frame + box.id), { crisp: true, format: preferredFormat })); frames++; }
  const full = (performance.now() - started) / Math.max(1, frames);
  samples.push({ test: 'full screen 4 tiles', ms: Math.round(full), fps: rate(full) });
  lines.push(`full screen ${rate(full)}`);
  report('lab-bench', [...samples, { test: 'preferred', format: preferredFormat, version: LAB_VERSION }]);
  linkReport = lines.join(' · ');
  if (signal.aborted) return;
  await s.layout({ texts: [{ ...FULL, content: ' ' }], images: [] });
  // Two results per row so everything fits the ten visible lines.
  const rows: string[] = []; for (let i = 0; i < lines.length; i += 2) rows.push(lines.slice(i, i + 2).join('   ·   '));
  await s.text(FULL, pane(['YOUR LINK (frames or updates per second)', '', ...rows, '', `Animations now use: ${preferredFormat === 'png' ? 'crisp PNG' : 'raw grey bytes'}`], true));
} };

const callScene: Scene = { id: 'call', title: 'Full screen · Incoming call', seconds: 12, async run({ s, sleep, signal }) {
  const RING: Box = { id: 24, name: 'lab-ring', x: 300, y: 168, w: 96, h: 96 };
  const INFO: TextBox = { id: 10, name: 'lab-left', x: 296, y: 0, w: 280, h: 160, content: ' ' };
  const STATUS: TextBox = { id: 11, name: 'lab-tt', x: 404, y: 176, w: 172, h: 112, content: ' ' };
  sceneState = { answered: false, since: performance.now() };
  await s.layout({ texts: [INFO, STATUS], images: [QUAD[0]!, QUAD[2]!, RING] });
  const person: Person = { name: 'Priya Sharma', role: '', where: '', distance: '', hair: 'long', glasses: false, beard: false, skin: 0.85 };
  const art = canvas(288, 288, g => { portrait(g, 144, 150, 128, person); });
  const [top, bottom] = halves(art); await s.image(QUAD[0]!, top); await s.image(QUAD[2]!, bottom);
  await s.text(INFO, pane(['INCOMING CALL', '', 'PRIYA SHARMA', 'Mobile · Bengaluru', '', 'Calls you most evenings'], INFO));
  while (!signal.aborted) {
    const answered = sceneState.answered as boolean; const t = (performance.now() - (sceneState.since as number)) / 1000;
    const clock = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    void s.text(STATUS, pane(answered ? ['ON CALL', clock, '', 'TAP: hang up'] : ['RINGING', clock, '', 'TAP: answer'], STATUS));
    await s.image(RING, canvas(96, 96, g => {
      if (!answered) { for (let i = 0; i < 2; i++) { const p = (t * 0.9 + i / 2) % 1; g.strokeStyle = C.green; g.lineWidth = 3 * (1 - p) + 1; g.beginPath(); g.arc(48, 48, 14 + p * 32, 0, Math.PI * 2); g.stroke(); } g.fillStyle = C.green; g.beginPath(); g.arc(48, 48, 12, 0, Math.PI * 2); g.fill(); }
      else for (let bar = 0; bar < 7; bar++) { const v = Math.abs(Math.sin(t * 5 + bar)); g.fillStyle = C.green; g.fillRect(8 + bar * 12, 48 - v * 34, 8, v * 68); }
    }), { crisp: true });
    await sleep(30);
  }
}, gesture(g) { if (g.kind !== 'tap') return false; sceneState.answered = !(sceneState.answered as boolean); sceneState.since = performance.now(); return true; } };

const musicScene: Scene = { id: 'music', title: 'Full screen · Music', seconds: 12, async run({ s, sleep, signal }) {
  const EQ: Box = { id: 24, name: 'lab-eq', x: 300, y: 200, w: 264, h: 72 };
  const INFO: TextBox = { id: 10, name: 'lab-left', x: 296, y: 0, w: 280, h: 196, content: ' ' };
  sceneState = { playing: true };
  await s.layout({ texts: [INFO], images: [QUAD[0]!, QUAD[2]!, EQ] });
  const cover = canvas(288, 288, g => {
    const sky = g.createLinearGradient(0, 0, 0, 288); sky.addColorStop(0, '#000'); sky.addColorStop(1, '#2a9d6a'); g.fillStyle = sky; g.fillRect(0, 0, 288, 288);
    g.fillStyle = '#7dffc0'; g.beginPath(); g.arc(144, 150, 70, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#000'; for (let band = 0; band < 7; band++) g.fillRect(70, 150 + band * 11, 150, 4 + band);
    g.fillStyle = '#0b2f1f'; g.beginPath(); g.moveTo(0, 230); for (let x = 0; x <= 288; x += 24) g.lineTo(x, 200 + Math.sin(x * 0.04) * 26 + (x % 48 ? 0 : -18)); g.lineTo(288, 288); g.lineTo(0, 288); g.fill();
    dither(g, 0, 0, 288, 288); g.strokeStyle = C.green; g.lineWidth = 2; g.strokeRect(10, 10, 268, 268);
  });
  const [top, bottom] = halves(cover); await s.image(QUAD[0]!, top); await s.image(QUAD[2]!, bottom);
  const started = performance.now();
  while (!signal.aborted) {
    const playing = sceneState.playing as boolean; const t = (performance.now() - started) / 1000; const position = 84 + (playing ? t : 0);
    const bar = Math.round(position / 220 * 12);
    void s.text(INFO, pane(['NOW PLAYING', '', 'MIDNIGHT CITY', 'M83 · Hurry Up', '', `${Math.floor(position / 60)}:${String(Math.floor(position % 60)).padStart(2, '0')} [${'#'.repeat(bar)}${'-'.repeat(12 - bar)}] 3:40`, '', playing ? 'TAP: pause' : 'TAP: play'], INFO));
    await s.image(EQ, canvas(264, 72, g => { for (let i = 0; i < 22; i++) { const v = playing ? Math.abs(Math.sin(t * 5 + i * 0.7) * Math.cos(t * 2 + i * 0.3)) : 0.08; g.fillStyle = C.green; g.fillRect(4 + i * 12, 70 - v * 66, 8, Math.max(2, v * 66)); } }), { crisp: true });
    await sleep(30);
  }
}, gesture(g) { if (g.kind !== 'tap') return false; sceneState.playing = !(sceneState.playing as boolean); return true; } };

const navScene: Scene = { id: 'nav', title: 'Full screen · Navigation', seconds: 16, async run({ s, sleep, signal }) {
  const ARROW: Box = { id: 24, name: 'lab-arrow', x: 12, y: 12, w: 96, h: 96 };
  const INFO: TextBox = { id: 10, name: 'lab-left', x: 112, y: 0, w: 176, h: 140, content: ' ' };
  const STEPS: TextBox = { id: 11, name: 'lab-tt', x: 0, y: 140, w: 288, h: 148, content: ' ' };
  await s.layout({ texts: [INFO, STEPS], images: [QUAD[1]!, QUAD[3]!, ARROW] });
  const route: Array<[number, number]> = [[40, 270], [40, 200], [130, 200], [130, 110], [230, 110], [230, 40]];
  const length = route.slice(1).reduce((sum, point, i) => sum + Math.hypot(point[0] - route[i]![0], point[1] - route[i]![1]), 0);
  const at = (d: number): [number, number, number] => { let left = d; for (let i = 1; i < route.length; i++) { const [x1, y1] = route[i - 1]!; const [x2, y2] = route[i]!; const seg = Math.hypot(x2 - x1, y2 - y1); if (left <= seg) return [x1 + (x2 - x1) * left / seg, y1 + (y2 - y1) * left / seg, i]; left -= seg; } return [...route.at(-1)!, route.length - 1]; };
  const map = (d: number) => canvas(288, 288, g => {
    g.fillStyle = '#0a2a1a'; for (let bx = 0; bx < 288; bx += 45) for (let by = 0; by < 288; by += 45) g.fillRect(bx + 6, by + 6, 33, 33);
    g.fillStyle = '#1a5a3a'; g.beginPath(); g.ellipse(200, 220, 60, 40, 0.3, 0, Math.PI * 2); g.fill(); label(g, 'PARK', 180, 224, 10, C.dim);
    g.strokeStyle = C.dim; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 150); g.bezierCurveTo(90, 130, 160, 180, 288, 150); g.stroke(); label(g, 'HILL RD', 8, 145, 9, C.dim, 700);
    g.strokeStyle = C.green; g.lineWidth = 6; g.beginPath(); route.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    const [px, py] = at(d); g.fillStyle = '#000'; g.beginPath(); g.arc(px, py, 10, 0, Math.PI * 2); g.fill(); g.fillStyle = C.green; g.beginPath(); g.arc(px, py, 7, 0, Math.PI * 2); g.fill();
    const [dx, dy] = route.at(-1)!; g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx - 9, dy - 18); g.lineTo(dx + 9, dy - 18); g.fill(); g.beginPath(); g.arc(dx, dy - 20, 9, 0, Math.PI * 2); g.fill();
  });
  const turns = ['Head north on Lake St', 'Turn right onto Hill Rd', 'Turn left at the cafe', 'Turn right onto 5th Ave', 'Turn left: arrive at Hall B'];
  const started = performance.now(); let lastStep = -1;
  while (!signal.aborted) {
    const d = Math.min(length, ((performance.now() - started) / 1000) * 42);
    const [, , step] = at(d); const remaining = Math.round((length - d) * 1.8);
    const [top, bottom] = halves(map(d)); await s.image(QUAD[1]!, top, { crisp: false }); await s.image(QUAD[3]!, bottom, { crisp: false });
    if (step !== lastStep) {
      lastStep = step;
      await s.image(ARROW, canvas(96, 96, g => { g.strokeStyle = C.green; g.lineWidth = 8; g.beginPath(); const right = step % 2 === 1; g.moveTo(48, 86); g.lineTo(48, 40); g.lineTo(right ? 78 : 18, 40); g.stroke(); g.fillStyle = C.green; g.beginPath(); g.moveTo(right ? 90 : 6, 40); g.lineTo(right ? 70 : 26, 24); g.lineTo(right ? 70 : 26, 56); g.fill(); }), { crisp: true });
      await s.text(STEPS, pane(['NEXT', ...turns.slice(step, step + 3)], STEPS));
    }
    void s.text(INFO, pane([`IN ${remaining} M`, turns[Math.min(step, turns.length - 1)]!, `ETA ${Math.max(1, Math.ceil(remaining / 80))} min`], INFO));
    await sleep(40);
  }
} };

const hudScene: Scene = { id: 'hud', title: 'Full screen · Head HUD', seconds: 16, async run(ctx) {
  const { s, sleep, signal } = ctx;
  const HORIZON: Box = { id: 24, name: 'lab-horizon', x: 144, y: 72, w: 288, h: 144 };
  const LEFTN: TextBox = { id: 10, name: 'lab-left', x: 0, y: 60, w: 140, h: 170, content: ' ' };
  const RIGHTN: TextBox = { id: 11, name: 'lab-tt', x: 440, y: 60, w: 136, h: 170, content: ' ' };
  const TOPN: TextBox = { id: 12, name: 'lab-hud-top', x: 0, y: 0, w: 576, h: 60, content: ' ' };
  await s.layout({ texts: [LEFTN, RIGHTN, TOPN], images: [HORIZON] });
  await s.text(TOPN, pane(['HEAD-TRACKED HUD: tilt and nod. The horizon follows your head.'], TOPN));
  try { await s.imu(true); } catch { await s.text(LEFTN, pane(['IMU', 'unavailable'], LEFTN)); }
  let zero: { x: number; y: number; z: number } | null = null; let lastText = 0; const history: number[] = []; let nods = 0;
  const started = performance.now();
  while (!signal.aborted) {
    const sample = ctx.imu; const t = (performance.now() - started) / 1000;
    // Without IMU data (the simulator), sway gently so the HUD still demonstrates itself.
    const roll = sample ? Math.atan2(sample.y, sample.z) - (zero ? Math.atan2(zero.y, zero.z) : 0) : Math.sin(t) * 0.25;
    const pitch = sample ? Math.atan2(-sample.x, Math.hypot(sample.y, sample.z)) - (zero ? Math.atan2(-zero.x, Math.hypot(zero.y, zero.z)) : 0) : Math.sin(t * 0.7) * 0.15;
    if (sample && !zero) zero = { ...sample };
    history.push(pitch); if (history.length > 12) history.shift();
    if (history.length === 12 && Math.max(...history) - Math.min(...history) > 0.35 && Math.abs(pitch) < 0.1) { nods++; history.length = 0; }
    await s.image(HORIZON, canvas(288, 144, g => {
      g.save(); g.translate(144, 72 + pitch * 140); g.rotate(-roll); g.strokeStyle = C.green; g.lineWidth = 3; g.beginPath(); g.moveTo(-220, 0); g.lineTo(220, 0); g.stroke();
      g.lineWidth = 2; for (const d of [-50, -25, 25, 50]) { g.beginPath(); g.moveTo(-34, d); g.lineTo(34, d); g.stroke(); label(g, `${-d / 2.5}`, 40, d + 4, 10); } g.restore();
      g.strokeStyle = C.green; g.lineWidth = 3; g.beginPath(); g.moveTo(104, 72); g.lineTo(130, 72); g.lineTo(144, 86); g.lineTo(158, 72); g.lineTo(184, 72); g.stroke();
    }), { crisp: true });
    if (performance.now() - lastText > 500) {
      lastText = performance.now(); const deg = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 180 / Math.PI)}`;
      void s.text(LEFTN, pane(['ROLL', deg(roll), '', sample ? 'live IMU' : 'demo motion'], LEFTN));
      void s.text(RIGHTN, pane(['PITCH', deg(pitch), '', `NODS ${nods}`], RIGHTN));
    }
    await sleep(20);
  }
} };

const scene = (id: string) => SCENE_LIST.find(value => value.id === id)!;
const SCENES: Scene[] = [scene('boot'), benchScene, callScene, musicScene, navScene, hudScene, ...MOTION_SCENES, ...TEMPLATE_SCENES, scene('stream'), scene('side'), scene('people'), scene('toast'),
  scene('progress'), scene('list'), scene('imu'), scene('brightness'), scene('device'), scene('gestures'), scene('end')];

// ---------------------------------------------------------------------------------------------
// Runner
let bridge: EvenAppBridge | null = null;
let surface: Surface | null = null;
let current = 0; let paused = false; let controller: AbortController | null = null; let advance: ReturnType<typeof setTimeout> | undefined;
let launchSource = 'unknown';
const ctx: Ctx = { s: null as unknown as Surface, signal: new AbortController().signal, sleep: () => Promise.resolve(), imu: null, status: null };
function schedule() {
  clearTimeout(advance);
  if (!paused) advance = setTimeout(() => show(current + 1), SCENES[current]!.seconds * 1000);
}
function show(index: number) {
  if (!surface) return;
  if (SCENES[current]?.id === 'imu' && SCENES[(index + SCENES.length) % SCENES.length]?.id !== 'imu') void surface.imu(false).catch(() => {});
  current = (index + SCENES.length) % SCENES.length;
  controller?.abort(); controller = new AbortController(); surface.generation++;
  const signal = controller.signal; sceneState = {};
  Object.assign(ctx, { s: surface, signal, sleep: (ms: number) => sleepFor(ms, signal) });
  const scene = SCENES[current]!;
  $('lab-scene').textContent = `${current + 1}/${SCENES.length} · ${scene.title}${paused ? ' · paused' : ''}`;
  for (const button of document.querySelectorAll<HTMLButtonElement>('.lab-scene')) button.classList.toggle('active', Number(button.dataset.index) === current);
  log(`Screen · ${scene.title}`);
  void scene.run(ctx).catch(error => log(`Scene error · ${error instanceof Error ? error.message : 'unknown'}`));
  schedule();
}
function togglePause() {
  paused = !paused; $('lab-pause').textContent = paused ? 'Play' : 'Pause';
  $('lab-scene').textContent = `${current + 1}/${SCENES.length} · ${SCENES[current]!.title}${paused ? ' · paused' : ''}`;
  log(paused ? 'Paused' : 'Playing'); schedule();
}
function sourceName(event: EvenHubEvent) {
  switch (event.sysEvent?.eventSource) {
    case EventSourceType.TOUCH_EVENT_FROM_GLASSES_R: return 'right temple';
    case EventSourceType.TOUCH_EVENT_FROM_GLASSES_L: return 'left temple';
    case EventSourceType.TOUCH_EVENT_FROM_RING: return 'ring';
    default: return 'glasses';
  }
}
function onEvent(event: EvenHubEvent) {
  if (event.audioEvent) return;
  if (event.sysEvent?.eventType === OsEventTypeList.IMU_DATA_REPORT) {
    const data = event.sysEvent.imuData;
    if (data) ctx.imu = { x: data.x ?? 0, y: data.y ?? 0, z: data.z ?? 0, at: Date.now() };
    return;
  }
  let gesture: Gesture | null = null;
  if (event.listEvent) {
    const type = event.listEvent.eventType ?? OsEventTypeList.CLICK_EVENT;
    if (type === OsEventTypeList.CLICK_EVENT) gesture = { kind: 'list', index: event.listEvent.currentSelectItemIndex ?? 0, name: event.listEvent.currentSelectItemName ?? '' };
    else if (type === OsEventTypeList.DOUBLE_CLICK_EVENT) gesture = { kind: 'double', source: 'list' };
  } else {
    const payload = event.sysEvent ?? event.textEvent; if (!payload) return;
    const type = payload.eventType ?? OsEventTypeList.CLICK_EVENT; const source = sourceName(event);
    if (type === OsEventTypeList.FOREGROUND_EXIT_EVENT) return;
    if (type === OsEventTypeList.FOREGROUND_ENTER_EVENT) { show(current); return; }
    const kind = ({ [OsEventTypeList.CLICK_EVENT]: 'tap', [OsEventTypeList.SCROLL_TOP_EVENT]: 'up', [OsEventTypeList.SCROLL_BOTTOM_EVENT]: 'down',
      [OsEventTypeList.DOUBLE_CLICK_EVENT]: 'double', [OsEventTypeList.LONG_PRESS_EVENT]: 'hold', [OsEventTypeList.LONG_PRESS_RELEASE_EVENT]: 'release' } as Record<number, Gesture['kind']>)[type];
    if (!kind) return;
    gesture = { kind, source } as Gesture;
  }
  if (!gesture) return;
  log(`Gesture · ${gesture.kind}${'source' in gesture ? ` · ${gesture.source}` : ''}`);
  if (SCENES[current]!.gesture?.(gesture, ctx)) return;
  if (gesture.kind === 'double') { void surface?.exit(); return; }
  if (gesture.kind === 'down') show(current + 1);
  else if (gesture.kind === 'up') show(current - 1);
  else if (gesture.kind === 'hold') togglePause();
  else if (gesture.kind === 'tap') show(current + 1);
}
async function start() {
  if (surface) return;
  $('lab-status').textContent = 'Connecting to Even Hub';
  try {
    bridge = await withTimeout(waitForEvenAppBridge(), 5000, 'Even Hub bridge');
    surface = new Surface(bridge, error => { log(`Glasses error · ${error.message}`); $('lab-status').textContent = 'Glasses error · it retries on the next screen'; });
    bridge.onEvenHubEvent(onEvent);
    bridge.onDeviceStatusChanged(status => { ctx.status = status; });
    bridge.onLaunchSource(source => { launchSource = source === 'glassesMenu' ? 'glasses menu' : 'phone app'; });
    $('lab-status').textContent = `Running on glasses · ${LAB_VERSION}`;
    setInterval(() => { if (surface?.frames) $('lab-stats').textContent = `${surface.frames} images · ${(surface.bytes / surface.frames / 1024).toFixed(1)} KB · ${(surface.imageMs / surface.frames).toFixed(0)} ms each`; }, 1000);
    show(0);
  } catch (error) { $('lab-status').textContent = error instanceof Error ? error.message : 'Even Hub not found'; log('Open this page inside the Even app (Even Hub) to drive the glasses.'); }
}
SCENES.forEach((scene, index) => {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'lab-scene'; button.dataset.index = String(index);
  button.textContent = `${String(index + 1).padStart(2, '0')} ${scene.title}`;
  button.addEventListener('click', () => { if (surface) show(index); });
  $('lab-scenes').append(button);
});
$('lab-start').addEventListener('click', () => { void start(); });
$('lab-pause').addEventListener('click', togglePause);
$('lab-prev').addEventListener('click', () => show(current - 1));
$('lab-next').addEventListener('click', () => show(current + 1));
window.addEventListener('pagehide', () => { void surface?.imu(false).catch(() => {}); });
if (new URL(location.href).searchParams.get('evenhub') === '1') void start();

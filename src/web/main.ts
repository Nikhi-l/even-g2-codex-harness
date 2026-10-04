import './styles.css';
import { StateStore } from '../core/store.js';
import { artifactSchema, type ArtifactInput, type DisplayInput, type Snapshot } from '../core/contracts.js';
import { examples } from '../core/examples.js';
import { allTemplates } from '../artifacts/index.js';
import { PreviewAdapter, RenderQueue, type Receipt } from '../device/adapter.js';
import { connectEven } from '../device/even.js';
import { registerAssets } from './assets.js';
import { paintPreview } from './preview.js';

function element<T extends HTMLElement>(id: string) { return document.getElementById(id) as T; }
const canvas = element<HTMLCanvasElement>('display');
const jsonEditor = element<HTMLTextAreaElement>('artifact-json');
const answerEditor = element<HTMLTextAreaElement>('answer');
const relayUrl = element<HTMLInputElement>('relay-url');
const relayToken = element<HTMLInputElement>('relay-token');
const local = new StateStore();
registerAssets();
for (const example of examples) local.upsert(example);
const initialTemplate = new URL(location.href).searchParams.get('template');
let selected = examples.find(example => example.template === initialTemplate) ?? examples[0]!;
local.select(selected.id);
let snapshot = local.snapshot();
let connection: { origin: string; token: string } | null = null;
let generation = 0;
let lastFrameKey = '';
let lastHealthy = Date.now();
let backoff = 750;
let pollTimer: ReturnType<typeof setTimeout>;
let evenQueue: RenderQueue | null = null;
let evenFailed = false;
let evenReceipt: Receipt | null = null;
let inputBusy = false;
const clientId = `web-${crypto.randomUUID()}`;

function message(text: string) { element('message').textContent = text; }
function log(text: string) {
  const row = document.createElement('div'); row.className = 'log-row';
  const time = document.createElement('time'); time.textContent = new Date().toLocaleTimeString('en-GB');
  const detail = document.createElement('span'); detail.textContent = text;
  row.append(time, detail); const container = element('activity-log'); container.prepend(row);
  while (container.children.length > 12) container.lastElementChild?.remove();
}
async function api(path: string, method = 'GET', data?: unknown): Promise<Snapshot> {
  if (!connection) throw new Error('Connect the relay first');
  const response = await fetch(`${connection.origin}${path}`, {
    method, redirect: 'error', signal: AbortSignal.timeout(4000),
    headers: { Authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const result = await response.json() as Snapshot & { error?: string };
  if (!response.ok) throw new Error(result.error ?? `Relay returned ${response.status}`);
  return result;
}
async function acknowledge(receipt: Receipt, mode: 'preview' | 'even') {
  element('delivery-label').textContent = receipt.status === 'bridge-accepted' ? 'Bridge accepted · not hardware verified' : 'Browser rendered';
  if (!connection || receipt.revision !== snapshot.revision || receipt.sessionId !== snapshot.sessionId || lastFrameKey.startsWith('stale:')) return;
  try { await api('/api/delivery', 'POST', { clientId: `${mode}-${clientId}`, revision: receipt.revision, sessionId: receipt.sessionId, mode, status: receipt.status }); }
  catch { /* A stale receipt must never replace newer state. Poll will refresh. */ }
}
const previewQueue = new RenderQueue(new PreviewAdapter(frame => paintPreview(canvas, frame)), receipt => {
  void acknowledge(receipt, 'preview'); document.body.dataset.ready = 'true';
}, error => message(error.message));

function syncEditor(artifact: ArtifactInput) {
  selected = artifact;
  jsonEditor.value = JSON.stringify(artifact.data, null, 2);
  answerEditor.value = artifact.answer ?? '';
  element('template-name').textContent = artifact.template;
}
function apply(next: Snapshot) {
  snapshot = next;
  const key = `${next.sessionId}:${next.revision}`;
  if (key !== lastFrameKey) {
    lastFrameKey = key;
    previewQueue.submit(next.frame); evenQueue?.submit(next.frame);
    const active = next.artifacts.find(artifact => artifact.id === next.activeId);
    if (active) {
      element('artifact-label').textContent = active.id;
      if (document.activeElement !== jsonEditor && document.activeElement !== answerEditor) syncEditor(active);
    } else element('artifact-label').textContent = 'Display cleared';
    element('revision-label').textContent = `Revision ${next.revision}`;
    element('layout-button').textContent = next.frame.layout === 'split' ? 'Close artifact' : 'Open artifact';
    for (const button of document.querySelectorAll<HTMLButtonElement>('.template-button')) button.classList.toggle('active', button.dataset.template === active?.template);
  }
}
async function mutate(path: string, data: Record<string, unknown>) {
  if (!connection) throw new Error('No relay');
  const before = generation;
  const next = await api(path, 'POST', data);
  if (generation === before) { lastHealthy = Date.now(); apply(next); }
}
async function publish(artifact: ArtifactInput) {
  const validated = artifactSchema.parse(artifact);
  if (connection) await mutate('/api/artifacts', { artifact: validated, expectedRevision: snapshot.revision });
  else apply(local.upsert(validated));
  message(''); log(`Showing ${artifact.template} · ${artifact.id}`);
}
async function input(type: DisplayInput['type'], expected = { revision: snapshot.revision, sessionId: snapshot.sessionId }) {
  if (inputBusy) return;
  inputBusy = true;
  try {
    const data = { type, eventId: crypto.randomUUID(), sessionId: expected.sessionId, revision: expected.revision };
    if (connection) await mutate('/api/input', data); else apply(local.input(data));
    message(''); log(`Input · ${type}`);
  } catch (error) { message(error instanceof Error ? error.message : 'Input failed'); }
  finally { inputBusy = false; }
}
function fail(error: unknown) { message(error instanceof Error ? error.message : 'Operation failed'); }
async function poll() {
  const currentGeneration = generation;
  try {
    if (connection) {
      const next = await api('/api/state');
      if (currentGeneration !== generation) return;
      lastHealthy = Date.now(); backoff = 750;
      element('relay-status').textContent = 'Connected'; apply(next);
    } else apply(local.snapshot());
  } catch {
    if (currentGeneration !== generation) return;
    backoff = Math.min(backoff * 2, 8000);
    element('relay-status').textContent = 'Offline · retrying';
  } finally {
    if (currentGeneration === generation) pollTimer = setTimeout(() => { void poll(); }, backoff);
  }
}
async function connect(origin: string, token: string) {
  const url = new URL(origin);
  if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('Enter a full HTTP(S) origin without a path');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname) && !confirm('Use this HTTP relay only on a trusted development LAN. Continue?')) return;
  generation++; clearTimeout(pollTimer); connection = { origin, token };
  try {
    const next = await api('/api/state');
    lastFrameKey = ''; lastHealthy = Date.now(); apply(next); backoff = 750;
    element('mode-label').textContent = 'Connected relay'; element('relay-status').textContent = 'Connected';
    element('connection-panel').hidden = true; relayToken.value = ''; message(''); log('Relay connected');
  } catch (error) { connection = null; throw error; }
  finally { void poll(); }
}
for (const [index, example] of examples.entries()) {
  const button = document.createElement('button'); button.className = 'template-button'; button.type = 'button'; button.dataset.template = example.template;
  const number = document.createElement('span'); number.className = 'index'; number.textContent = String(index + 1).padStart(2, '0');
  const name = document.createElement('span'); name.textContent = allTemplates().find(template => template.id === example.template)!.title;
  button.append(number, name); button.addEventListener('click', () => { syncEditor(example); void publish(example).catch(fail); }); element('template-list').append(button);
}
element('artifact-form').addEventListener('submit', event => {
  event.preventDefault();
  try { void publish({ ...selected, data: JSON.parse(jsonEditor.value) as ArtifactInput['data'], answer: answerEditor.value } as ArtifactInput).catch(fail); }
  catch { message('Template payload must be valid JSON.'); }
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-input]')) button.addEventListener('click', () => { void input(button.dataset.input as DisplayInput['type']); });
element('layout-button').addEventListener('click', () => { void input('select'); });
element('clear-button').addEventListener('click', () => {
  const action = connection ? mutate('/api/clear', { expectedRevision: snapshot.revision }) : Promise.resolve(apply(local.clear()));
  void action.then(() => log('Display cleared')).catch(fail);
});
element('connection-toggle').addEventListener('click', () => { element('connection-panel').hidden = !element('connection-panel').hidden; });
element('connection-form').addEventListener('submit', event => { event.preventDefault(); void connect(relayUrl.value.trim(), relayToken.value).catch(fail); });
element('demo-button').addEventListener('click', () => {
  generation++; connection = null; clearTimeout(pollTimer); lastFrameKey = '';
  element('mode-label').textContent = 'Local demo'; element('relay-status').textContent = 'Demo · in memory'; element('connection-panel').hidden = true;
  apply(local.snapshot()); void poll(); log('Local demo selected');
});
element('even-button').addEventListener('click', () => {
  if (evenFailed) { message('Reopen the Even Hub app to recover the SDK surface.'); return; }
  if (evenQueue) { message('Even Hub adapter is already connected.'); return; }
  const button = element<HTMLButtonElement>('even-button'); button.disabled = true;
  void connectEven(type => { if (evenReceipt) void input(type, evenReceipt); }, log).then(adapter => {
    evenQueue = new RenderQueue(adapter, receipt => { evenReceipt = receipt; void acknowledge(receipt, 'even'); element('adapter-status').textContent = 'Even Hub · accepted'; }, (error, revision) => {
      evenFailed = true; element('adapter-status').textContent = 'Failed · reopen Even Hub'; message(error.message); log('Even adapter failed');
      if (connection) void api('/api/delivery', 'POST', { clientId: `even-${clientId}`, mode: 'even', status: 'failed', revision, sessionId: snapshot.sessionId, detail: 'SDK operation failed; reopen the Even Hub app' }).catch(() => {});
    });
    evenQueue.submit(snapshot.frame); element('adapter-status').textContent = 'Even Hub · rendering'; log('Even Hub adapter connected');
  }).catch(fail).finally(() => { button.disabled = false; });
});
// Network loss and TTL are evaluated locally as well, so stale private content is blanked.
setInterval(() => {
  const expired = snapshot.frame.artifact && snapshot.frame.artifact.expiresAt <= Date.now();
  if ((connection && Date.now() - lastHealthy > 10000) || expired) {
    const key = `stale:${snapshot.sessionId}:${snapshot.revision}`;
    if (lastFrameKey !== key) {
      lastFrameKey = key;
      const blank = { ...snapshot.frame, artifact: null, layout: 'answer' as const, text: '' };
      previewQueue.submit(blank); evenQueue?.submit(blank); log('Blanked stale display');
    }
  }
}, 1000);
window.addEventListener('pagehide', () => { clearTimeout(pollTimer); previewQueue.dispose(); evenQueue?.dispose(); });
relayUrl.value = location.origin;
try { const config = await (await fetch('./harness-config.json')).json() as { relayOrigin?: string }; if (config.relayOrigin) relayUrl.value = config.relayOrigin; } catch { /* demo config is optional */ }
syncEditor(selected); apply(snapshot); log('Local demo · no glasses or API key required');
const fragment = new URLSearchParams(location.hash.slice(1));
const token = fragment.get('token');
if (token) {
  history.replaceState(null, '', location.pathname + location.search);
  await connect(relayUrl.value, token).catch(fail);
} else void poll();

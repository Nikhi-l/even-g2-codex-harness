import './social.css';
import { createSocialState, reduceSocial, renderSocial, type SocialAction, type SocialDestination } from '../social/index.js';
import { G2_TEXT } from '../core/text.js';
import type { DisplayFrame } from '../core/contracts.js';
import { RenderQueue } from '../device/adapter.js';
import { connectSocialDevice } from '../device/social.js';

declare const __SIDEBAND_PACKAGED__: boolean;
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>('display');
const transcript = el<HTMLTextAreaElement>('transcript');
const connect = el<HTMLButtonElement>('connect');
const voice = el<HTMLButtonElement>('voice');
const review = el<HTMLButtonElement>('use-transcript');
const parameters = new URLSearchParams(location.search);
const fixture = parameters.get('fixture') === 'stress' ? 'stress' : parameters.get('fixture') === 'empty' ? 'empty' : 'default';
let state = createSocialState({ fixture });
if (!__SIDEBAND_PACKAGED__) state = reduceSocial(state, { type: 'open', destination: 'trending' });
let revision = 0;
let queue: RenderQueue | undefined;
let acceptedRevision = -1;
let connecting = false;
let failed = false;
let disposed = false;
let transportStatus = 'Browser preview · no glasses connected';
const sessionId = 'sideband-local-design';

function frame(): DisplayFrame {
  const rendered = renderSocial(state);
  return { sessionId, revision, artifact: null, layout: 'answer', scroll: 0, text: rendered.text, page: rendered.page, pages: rendered.pages, chosen: null };
}

function syncStatus() {
  el('status').textContent = failed ? transportStatus : renderSocial(state).notice || transportStatus;
  connect.disabled = connecting || Boolean(queue) || failed || disposed;
  connect.textContent = failed ? 'Reopen Even Hub' : connecting ? 'Connecting…' : queue ? 'G2 connected' : 'Open on G2 ↗';
}

function paint() {
  const rendered = renderSocial(state);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas preview unavailable');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 576, 288);
  ctx.fillStyle = '#00ff00'; ctx.font = '400 18px Arial, sans-serif';
  ctx.textBaseline = 'alphabetic';
  rendered.lines.forEach((line, index) => ctx.fillText(line, 8, 26 + index * G2_TEXT.lineHeight));
  canvas.setAttribute('aria-label', rendered.text);
  el('screen-text').textContent = rendered.text;
  el('view-title').textContent = rendered.title.charAt(0) + rendered.title.slice(1).toLowerCase();
  el('line-budget').textContent = `${rendered.lines.length} / 10 lines`;
  document.body.dataset.screen = state.screen;
  document.body.dataset.phase = state.draft?.phase ?? 'read';
  document.body.dataset.online = String(state.online);
  document.body.dataset.messageCount = String(state.messages.length);
  document.body.dataset.ready = 'true';
  const nav = state.screen === 'post-actions' || state.screen === 'report' ? state.postOrigin : state.screen === 'conversation' || state.screen === 'compose' || state.screen === 'review' || state.screen === 'profile' ? 'people' : state.screen;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-destination]')) {
    const selected = button.dataset.destination === nav;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-current', selected ? 'page' : 'false');
    button.disabled = Boolean(state.draft);
  }
  el<HTMLButtonElement>('menu').disabled = Boolean(state.draft);
  const options = rendered.options.map(option => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = option.label;
    button.dataset.option = option.id;
    button.setAttribute('aria-pressed', String(option.selected));
    button.addEventListener('click', () => act({ type: 'choose', id: option.id }));
    return button;
  });
  el('screen-actions').replaceChildren(...options);
  const listening = state.draft?.phase === 'listening';
  const canSpeak = state.screen === 'conversation' || state.screen === 'post-actions' || state.screen === 'compose';
  voice.disabled = !canSpeak;
  el('voice-label').textContent = listening ? 'Stop & review' : 'Start voice demo';
  review.disabled = !listening || !transcript.value.trim();
  el('voice-hint').textContent = listening ? 'Simulated input only. Review your words on the glasses before sending.' : state.screen === 'review' ? 'Read the whole draft, then choose Send demo message on the display.' : 'Open a reply and start the voice demo first.';
  el('network-label').textContent = state.online ? 'Online · simulated' : 'Offline · draft stays here';
  el('network').setAttribute('aria-checked', String(state.online));
  const step = state.screen === 'compose' ? 'speak' : state.screen === 'review' ? 'review' : state.notice.startsWith('Demo sent') ? 'send' : 'read';
  document.querySelectorAll<HTMLElement>('[data-step]').forEach(node => node.classList.toggle('active', node.dataset.step === step));
  syncStatus();
}

function act(action: SocialAction) {
  if (disposed) return;
  const next = reduceSocial(state, action);
  if (next === state) return;
  state = next; revision++; paint(); queue?.submit(frame());
}

function failure(error: Error) {
  if (failed || disposed) return;
  failed = true;
  queue?.dispose();
  transportStatus = `${error.message} Device updates stopped. Reopen the app in Even Hub.`;
  syncStatus();
}

async function startDevice() {
  if (queue || connecting || failed || disposed) return;
  connecting = true; transportStatus = 'Waiting for Even Hub…'; syncStatus();
  try {
    const adapter = await connectSocialDevice(type => {
      // Only the frame confirmed by the bridge can act on the current selection.
      if (acceptedRevision !== revision || failed || disposed) return;
      if (type === 'previous') act({ type: 'prev' });
      else if (type === 'next') act({ type: 'next' });
      else if (type === 'select') act({ type: 'select' });
    }, {
      press() { if (acceptedRevision === revision && !failed && !disposed) act({ type: 'voice-start' }); },
      release() { if (!failed && !disposed) act({ type: 'voice-stop' }); },
    }, failure);
    if (disposed) { adapter.dispose(); return; }
    queue = new RenderQueue(adapter, receipt => {
      if (failed || disposed) return;
      acceptedRevision = receipt.revision;
      transportStatus = 'Bridge accepted · physical display still needs verification';
      syncStatus();
    }, failure);
    queue.submit(frame());
  } catch (error) { failure(error instanceof Error ? error : new Error('Even Hub connection failed')); }
  finally { connecting = false; syncStatus(); }
}

document.querySelectorAll<HTMLButtonElement>('[data-destination]').forEach(button => {
  button.addEventListener('click', () => act({ type: 'open', destination: button.dataset.destination as SocialDestination }));
});
el('prev').onclick = () => act({ type: 'prev' });
el('next').onclick = () => act({ type: 'next' });
el('select').onclick = () => act({ type: 'select' });
el('menu').onclick = () => act({ type: 'open', destination: 'home' });
voice.onclick = () => act({ type: state.draft?.phase === 'listening' ? 'voice-stop' : 'voice-start' });
review.onclick = () => {
  const session = renderSocial(state).voiceSessionId;
  if (session === null || !transcript.value.trim()) return;
  act({ type: 'transcript', sessionId: session, text: transcript.value });
  act({ type: 'voice-stop' });
};
transcript.oninput = () => { review.disabled = state.draft?.phase !== 'listening' || !transcript.value.trim(); };
el('network').onclick = () => act({ type: 'set-online', online: !state.online });
el('reset').onclick = () => {
  state = createSocialState({ fixture });
  if (!__SIDEBAND_PACKAGED__) state = reduceSocial(state, { type: 'open', destination: 'trending' });
  revision++; paint(); queue?.submit(frame());
};
connect.onclick = () => { void startDevice(); };
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  if (event.key === 'Enter' && (event.target instanceof HTMLButtonElement || event.target instanceof HTMLAnchorElement || event.target instanceof HTMLElement && event.target.tagName === 'SUMMARY')) return;
  const action = event.key === 'ArrowUp' ? 'prev' : event.key === 'ArrowDown' ? 'next' : event.key === 'Enter' ? 'select' : null;
  if (action) { event.preventDefault(); act({ type: action }); }
});
document.addEventListener('visibilitychange', () => {
  // Even simulated listening must end when the wearer leaves the page.
  if (document.hidden && state.draft?.phase === 'listening') act({ type: 'voice-stop' });
});
window.addEventListener('pagehide', () => { disposed = true; queue?.dispose(); });
document.body.dataset.packaged = String(__SIDEBAND_PACKAGED__);
revision++; paint();
if (__SIDEBAND_PACKAGED__) void startDevice();

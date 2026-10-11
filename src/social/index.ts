import { fitText, G2_TEXT, wrapText } from '../core/text.js';
import { socialFixture, SOCIAL_LIMITS, type SocialMessage, type SocialPerson, type SocialPost } from './fixtures.js';

export { SOCIAL_DEMO_DATA, SOCIAL_LIMITS } from './fixtures.js';
export type { SocialMessage, SocialPerson, SocialPost } from './fixtures.js';

export type SocialDestination = 'home' | 'trending' | 'people' | 'inbox' | 'saved' | 'blocked';
export type SocialScreen = SocialDestination | 'post-actions' | 'conversation' | 'compose' | 'review' | 'profile' | 'report';
export interface SocialDraft {
  /** The target is fixed when compose begins, including across re-record and retry. */
  recipientId: string;
  text: string;
  sessionId: number;
  phase: 'ready' | 'listening' | 'review';
  failed: boolean;
  reviewedThrough: number;
  tooLong: boolean;
}
export interface SocialState {
  screen: SocialScreen;
  cursor: number;
  online: boolean;
  people: SocialPerson[];
  posts: SocialPost[];
  messages: SocialMessage[];
  selectedPersonId: string | null;
  selectedPostId: string | null;
  postIndex: number;
  messageIndex: number;
  page: number;
  savedIds: string[];
  hiddenIds: string[];
  blockedIds: string[];
  reports: { postId: string; reason: string }[];
  draft: SocialDraft | null;
  sequence: number;
  notice: string;
  postOrigin: 'trending' | 'saved';
}
export type SocialAction =
  | { type: 'prev' | 'next' | 'select' | 'back' | 'voice-start' | 'voice-stop' }
  | { type: 'choose'; id: string }
  | { type: 'open'; destination: SocialDestination }
  | { type: 'set-online'; online: boolean }
  | { type: 'transcript'; sessionId: number; text: string };
export interface SocialOption { id: string; label: string; selected: boolean }
export interface SocialFrame {
  title: string;
  context: string;
  text: string;
  lines: string[];
  options: SocialOption[];
  /** End is exclusive. Scroll selection reveals options outside this native window. */
  optionWindow: { start: number; end: number; total: number };
  screen: SocialScreen;
  cursor: number;
  demo: true;
  notice: string;
  voiceSessionId: number | null;
  page: number;
  pages: number;
}

const CONTENT_ROWS = 3;
const MOCK_TRANSCRIPT = 'That sounds lovely. Let us meet there tomorrow afternoon.';
const clip = (value: string, limit: number = SOCIAL_LIMITS.text) => [...value.replace(/[\u0000-\u001f\u007f]/gu, ' ')].slice(0, limit).join('').trim();
const row = (value: string) => fitText(clip(value, G2_TEXT.fullChars), G2_TEXT.fullWidth);
const pagesFor = (value: string) => {
  const rows = wrapText(value, G2_TEXT.fullWidth, G2_TEXT.fullChars);
  return Array.from({ length: Math.max(1, Math.ceil(rows.length / CONTENT_ROWS)) }, (_, index) => rows.slice(index * CONTENT_ROWS, (index + 1) * CONTENT_ROWS));
};

export function createSocialState(options: { online?: boolean; fixture?: 'default' | 'stress' | 'empty' } = {}): SocialState {
  return {
    ...socialFixture(options.fixture ?? 'default'),
    screen: 'home', cursor: 0, online: options.online ?? true,
    selectedPersonId: null, selectedPostId: null, postIndex: 0, messageIndex: 0, page: 0,
    savedIds: [], hiddenIds: [], blockedIds: [], reports: [], draft: null,
    sequence: 0, notice: '', postOrigin: 'trending',
  };
}

function visiblePosts(state: SocialState) {
  return state.posts.filter(post => !state.hiddenIds.includes(post.id) && !state.blockedIds.includes(post.authorId) && (state.screen !== 'saved' && state.postOrigin !== 'saved' || state.savedIds.includes(post.id)));
}
function personName(state: SocialState, id: string | null) { return state.people.find(person => person.id === id)?.name ?? 'Someone'; }
function currentPost(state: SocialState) {
  if ((state.screen === 'post-actions' || state.screen === 'report') && state.selectedPostId) {
    const selected = state.posts.find(post => post.id === state.selectedPostId);
    if (selected && !state.hiddenIds.includes(selected.id) && !state.blockedIds.includes(selected.authorId)) return selected;
  }
  const posts = visiblePosts(state);
  return posts.find(post => post.id === state.selectedPostId) ?? posts[Math.min(state.postIndex, posts.length - 1)];
}
function threadMessages(state: SocialState) {
  return state.messages.filter(message => message.personId === state.selectedPersonId).slice().reverse();
}
function visiblePeople(state: SocialState) { return state.people.filter(person => !state.blockedIds.includes(person.id)); }
function inboxPeople(state: SocialState) {
  return [...new Set(state.messages.slice().reverse().map(message => message.personId))]
    .map(id => state.people.find(person => person.id === id)).filter((person): person is SocialPerson => Boolean(person) && !state.blockedIds.includes(person!.id));
}

interface ScreenContent { title: string; context: string; body: string[]; options: { id: string; label: string }[]; page?: number; pages?: number }
function contentFor(state: SocialState): ScreenContent {
  const connection = state.online ? 'LOCAL DEMO' : 'LOCAL DEMO / OFFLINE';
  const option = (id: string, label: string) => ({ id, label });
  const menu = option('home', 'Back to menu');
  switch (state.screen) {
    case 'home':
      return { title: 'SIDEBAND', context: connection, body: ['A little closer. Eyes up.'], options: [option('trending', 'Trending'), option('people', 'People'), option('inbox', 'Inbox'), option('saved', 'Saved posts'), option('blocked', 'Blocked people')] };
    case 'people': {
      const people = visiblePeople(state);
      return { title: 'PEOPLE', context: connection, body: people.length ? [] : ['No people here yet.'], options: [...people.slice(0, SOCIAL_LIMITS.people).map(person => option(`person:${person.id}`, person.name)), menu] };
    }
    case 'blocked': {
      const people = state.people.filter(person => state.blockedIds.includes(person.id));
      return { title: 'BLOCKED PEOPLE', context: connection, body: people.length ? [] : ['No blocked people.'], options: [...people.slice(0, SOCIAL_LIMITS.people).map(person => option(`blocked:${person.id}`, person.name)), menu] };
    }
    case 'inbox': {
      const people = inboxPeople(state);
      return { title: 'INBOX', context: `${connection} / NEWEST FIRST`, body: people.length ? [] : ['No messages yet.'], options: [...people.slice(0, SOCIAL_LIMITS.people).map(person => option(`person:${person.id}`, person.name)), menu] };
    }
    case 'trending':
    case 'saved': {
      const posts = visiblePosts(state); const post = currentPost(state);
      if (!post) return { title: state.screen === 'saved' ? 'SAVED POSTS' : 'TRENDING', context: connection, body: [state.screen === 'saved' ? 'Save a post to find it here.' : 'You are all caught up.'], options: [menu] };
      const pages = pagesFor(post.text); const page = Math.min(state.page, pages.length - 1);
      return { title: `${state.screen === 'saved' ? 'SAVED' : 'TRENDING'}  ${posts.indexOf(post) + 1}/${posts.length}`, context: `${personName(state, post.authorId)} / ${page + 1}/${pages.length} / DEMO`, body: pages[page]!, options: [...(pages.length > 1 ? [option('post-page', `Read page ${page + 1 === pages.length ? 1 : page + 2}/${pages.length}`)] : []), option('post-actions', 'Reply & actions'), option('next-post', 'Next post'), menu], page, pages: pages.length };
    }
    case 'post-actions': {
      const post = currentPost(state);
      return { title: 'POST ACTIONS', context: `${personName(state, post?.authorId ?? null)} / ${connection}`, body: [], options: post ? [option('reply', 'Reply privately'), option('save', state.savedIds.includes(post.id) ? 'Unsave post' : 'Save post'), option('hide', 'Hide post'), option('report', 'Report post'), option('profile', 'Person & block'), option('back-post', 'Back to post')] : [menu] };
    }
    case 'conversation': {
      const messages = threadMessages(state); const message = messages[Math.min(state.messageIndex, messages.length - 1)];
      const pages = pagesFor(message?.text ?? 'Start a conversation with your voice.'); const page = Math.min(state.page, pages.length - 1);
      return { title: personName(state, state.selectedPersonId).toUpperCase(), context: message ? `${message.direction === 'outgoing' ? 'YOU' : 'THEM'} / ${message.status} / ${page + 1}/${pages.length}` : connection, body: pages[page]!, options: [
        ...(pages.length > 1 ? [option('message-page', `Read page ${page + 1 === pages.length ? 1 : page + 2}/${pages.length}`)] : []),
        option('reply', 'Reply with voice'),
        ...(messages.length > 1 ? [option('older-message', state.messageIndex + 1 < messages.length ? 'Older message' : 'Newest message')] : []),
        option('profile', 'Person & block'),
        menu,
      ], page, pages: pages.length };
    }
    case 'compose': {
      const listening = state.draft?.phase === 'listening';
      return { title: listening ? 'LISTENING / DEMO' : 'VOICE REPLY', context: `To ${personName(state, state.draft?.recipientId ?? null)}`, body: listening ? ['Microphone simulation.', 'Stop to review a sample transcript.', 'Nothing sends until you confirm.'] : ['Speak a short thought.', 'You can review it before sending.', 'This demo uses a sample transcript.'], options: [option(listening ? 'voice-stop' : 'voice-start', listening ? 'Stop & review' : 'Start speaking'), option('cancel', 'Cancel / back')] };
    }
    case 'review': {
      const draft = state.draft; const pages = pagesFor(draft?.text ?? ''); const page = Math.min(state.page, pages.length - 1);
      return { title: `REVIEW ${page + 1}/${pages.length} / To ${personName(state, draft?.recipientId ?? null)}`, context: state.online ? 'Confirm before sending / LOCAL DEMO' : 'OFFLINE / LOCAL DEMO', body: pages[page]!, options: [
        ...(pages.length > 1 ? [option('review-page', `Read page ${page + 1 === pages.length ? 1 : page + 2}/${pages.length}`)] : []),
        option('send', draft?.tooLong ? 'Too long - record again' : draft?.failed ? 'Retry demo send' : 'Send demo message'), option('rerecord', 'Record again'), option('cancel', 'Cancel / back'),
      ], page, pages: pages.length };
    }
    case 'profile': {
      const id = state.selectedPersonId; const person = state.people.find(item => item.id === id);
      const pages = pagesFor(person?.bio ?? 'No profile available.'); const page = Math.min(state.page, pages.length - 1);
      return { title: personName(state, id).toUpperCase(), context: connection, body: pages[page]!, options: [
        ...(pages.length > 1 ? [option('profile-page', 'Read next page')] : []),
        option('conversation', 'Open conversation'), option('block', state.blockedIds.includes(id ?? '') ? 'Unblock locally' : 'Block locally'), menu,
      ], page, pages: pages.length };
    }
    case 'report':
      return { title: 'REPORT POST', context: connection, body: ['Choose a reason.', 'Stored in this demo only.'], options: [option('report:spam', 'Spam'), option('report:harassment', 'Harassment'), option('report:other', 'Other concern'), option('back-actions', 'Cancel / back')] };
  }
}

/** Every frame is native text, at most ten rows within the measured G2 width. */
export function renderSocial(state: SocialState): SocialFrame {
  const content = contentFor(state);
  const cursor = Math.max(0, Math.min(state.cursor, content.options.length - 1));
  const options = content.options.map((option, index) => ({ ...option, selected: index === cursor }));
  const context = state.notice || content.context;
  const capacity = G2_TEXT.maxLines - 3 - content.body.length;
  const start = Math.max(0, Math.min(cursor - capacity + 1, options.length - capacity));
  const end = Math.min(options.length, start + capacity);
  const optionWindow = { start, end, total: options.length };
  const windowLabel = options.length > capacity ? `SCROLL OPTIONS ${start + 1}-${end}/${options.length}` : '';
  const lines = [row(content.title), row(context), row(windowLabel), ...content.body.map(row), ...options.slice(start, end).map(option => row(`${option.selected ? '>' : ' '} ${option.label}`))];
  return { title: content.title, context, text: lines.join('\n'), lines, options, optionWindow, screen: state.screen, cursor, demo: true, notice: state.notice, voiceSessionId: state.draft?.phase === 'listening' ? state.draft.sessionId : null, page: content.page ?? 0, pages: content.pages ?? 1 };
}

function go(state: SocialState, screen: SocialScreen): SocialState { return { ...state, screen, cursor: 0, page: 0, notice: '' }; }
function beginCompose(state: SocialState): SocialState {
  const recipientId = state.screen === 'post-actions' ? currentPost(state)?.authorId : state.selectedPersonId;
  if (!recipientId || state.blockedIds.includes(recipientId) || !state.people.some(person => person.id === recipientId)) return state;
  // A future caller cannot silently replace a pending draft's recipient.
  if (state.draft) return { ...state, notice: 'Finish or cancel your current draft.' };
  return { ...go(state, 'compose'), sequence: state.sequence + 1, draft: { recipientId, text: '', sessionId: state.sequence + 1, phase: 'ready', failed: false, reviewedThrough: 0, tooLong: false } };
}
function startVoice(state: SocialState): SocialState {
  const current = state.screen === 'conversation' || state.screen === 'post-actions' ? beginCompose(state) : state;
  if (current.screen !== 'compose' || !current.draft || current.draft.phase !== 'ready') return current;
  return { ...current, draft: { ...current.draft, phase: 'listening' }, cursor: 0, notice: 'Demo voice input. No microphone is recording.' };
}
function stopVoice(state: SocialState): SocialState {
  if (state.screen !== 'compose' || state.draft?.phase !== 'listening') return state;
  return { ...go(state, 'review'), draft: { ...state.draft, phase: 'review', text: state.draft.text || MOCK_TRANSCRIPT, reviewedThrough: 0 }, notice: state.draft.tooLong ? 'Transcript too long. Record a shorter reply.' : '' };
}
function pageForward(state: SocialState, count: number) { return { ...state, page: (state.page + 1) % count, cursor: 0, notice: '' }; }

function activate(state: SocialState, id: string): SocialState {
  if (id === 'home') return go(state, 'home');
  if (id === 'trending' || id === 'saved') return { ...go(state, id), postOrigin: id, postIndex: 0, selectedPostId: null };
  if (id === 'people' || id === 'inbox' || id === 'blocked') return go(state, id);
  if (id.startsWith('person:')) return { ...go(state, 'conversation'), selectedPersonId: id.slice(7), messageIndex: 0 };
  if (id.startsWith('blocked:')) return { ...go(state, 'profile'), selectedPersonId: id.slice(8) };
  if (id === 'post-actions') return { ...go(state, 'post-actions'), selectedPostId: currentPost(state)?.id ?? null };
  if (id === 'back-post') return go(state, state.postOrigin);
  if (id === 'back-actions') return go(state, 'post-actions');
  if (id === 'next-post') return { ...state, postIndex: (state.postIndex + 1) % Math.max(1, visiblePosts(state).length), selectedPostId: null, page: 0, cursor: 0, notice: '' };
  if (id === 'post-page') return pageForward(state, pagesFor(currentPost(state)?.text ?? '').length);
  if (id === 'message-page') return pageForward(state, pagesFor(threadMessages(state)[state.messageIndex]?.text ?? '').length);
  if (id === 'older-message') return { ...state, messageIndex: (state.messageIndex + 1) % Math.max(1, threadMessages(state).length), page: 0, cursor: 0 };
  if (id === 'reply') return beginCompose(state);
  if (id === 'voice-start') return startVoice(state);
  if (id === 'voice-stop') return stopVoice(state);
  if (id === 'cancel') return { ...go(state, 'conversation'), selectedPersonId: state.draft?.recipientId ?? state.selectedPersonId, messageIndex: 0, draft: null, notice: 'Draft discarded.' };
  if (id === 'rerecord' && state.draft) return { ...go(state, 'compose'), sequence: state.sequence + 1, draft: { ...state.draft, sessionId: state.sequence + 1, text: '', phase: 'ready', failed: false, reviewedThrough: 0, tooLong: false } };
  if (id === 'review-page' && state.draft) {
    const next = pageForward(state, pagesFor(state.draft.text).length);
    return { ...next, draft: { ...state.draft, reviewedThrough: Math.max(state.draft.reviewedThrough, next.page) } };
  }
  if (id === 'send' && state.draft?.phase === 'review') {
    const draft = state.draft;
    if (draft.tooLong) return { ...state, notice: 'Transcript too long. Record a shorter reply.' };
    if (!draft.text.trim()) return { ...state, notice: 'Record a message before sending.' };
    if (draft.reviewedThrough < pagesFor(draft.text).length - 1) return { ...state, notice: 'Read every transcript page before sending.' };
    if (!state.online) return { ...state, draft: { ...draft, failed: true }, notice: 'Offline. Draft kept. Retry when online.' };
    if (state.blockedIds.includes(draft.recipientId)) return { ...state, notice: 'Recipient blocked. Draft kept.' };
    const sequence = state.sequence + 1;
    const message: SocialMessage = { id: `demo-${sequence}`, personId: draft.recipientId, direction: 'outgoing', text: draft.text, status: 'Demo sent' };
    return { ...go(state, 'conversation'), selectedPersonId: draft.recipientId, messageIndex: 0, messages: [...state.messages, message].slice(-SOCIAL_LIMITS.messages), sequence, draft: null, notice: 'Demo sent. This message stays on this device.' };
  }
  if (id === 'save') {
    const post = currentPost(state); if (!post) return state;
    const saved = state.savedIds.includes(post.id);
    return { ...state, savedIds: saved ? state.savedIds.filter(value => value !== post.id) : [...state.savedIds, post.id].slice(-SOCIAL_LIMITS.posts), notice: saved ? 'Removed from saved posts.' : 'Saved in this demo.' };
  }
  if (id === 'hide') {
    const post = currentPost(state); if (!post) return state;
    return { ...go(state, state.postOrigin), hiddenIds: [...state.hiddenIds, post.id].slice(-SOCIAL_LIMITS.posts), selectedPostId: null, postIndex: 0, notice: 'Post hidden locally.' };
  }
  if (id === 'report') return go(state, 'report');
  if (id.startsWith('report:')) {
    const post = currentPost(state); if (!post) return state;
    return { ...go(state, 'post-actions'), reports: [...state.reports, { postId: post.id, reason: id.slice(7) }].slice(-SOCIAL_LIMITS.posts), notice: 'Demo report saved locally. No report was sent.' };
  }
  if (id === 'profile') return { ...go(state, 'profile'), selectedPersonId: state.screen === 'post-actions' ? currentPost(state)?.authorId ?? null : state.selectedPersonId };
  if (id === 'profile-page') return pageForward(state, pagesFor(state.people.find(person => person.id === state.selectedPersonId)?.bio ?? '').length);
  if (id === 'conversation') {
    if (state.blockedIds.includes(state.selectedPersonId ?? '')) return { ...state, notice: 'Unblock this person before chatting.' };
    return { ...go(state, 'conversation'), messageIndex: 0 };
  }
  if (id === 'block' && state.selectedPersonId) {
    const blocked = state.blockedIds.includes(state.selectedPersonId);
    return { ...state, blockedIds: blocked ? state.blockedIds.filter(value => value !== state.selectedPersonId) : [...state.blockedIds, state.selectedPersonId].slice(-SOCIAL_LIMITS.people), notice: blocked ? 'Person unblocked locally.' : 'Person blocked locally. Their posts and chats are hidden.' };
  }
  return state;
}

/** Pure local state transitions. No SDK, network, storage, microphone, or clocks. */
export function reduceSocial(state: SocialState, action: SocialAction): SocialState {
  if (action.type === 'set-online') return { ...state, online: action.online, notice: action.online && state.draft?.failed ? 'Online. Review your draft and retry.' : action.online ? 'Demo connection online.' : 'Demo connection offline.' };
  if (action.type === 'transcript') {
    if (state.screen !== 'compose' || state.draft?.phase !== 'listening' || state.draft.sessionId !== action.sessionId) return state;
    return { ...state, draft: { ...state.draft, text: clip(action.text), tooLong: [...action.text].length > SOCIAL_LIMITS.text } };
  }
  if (action.type === 'open') {
    if (state.draft) return { ...state, notice: 'Finish or cancel your current draft.' };
    return activate(state, action.destination);
  }
  if (action.type === 'voice-start') return startVoice(state);
  if (action.type === 'voice-stop') return stopVoice(state);
  const frame = renderSocial(state);
  if (action.type === 'prev' || action.type === 'next') return { ...state, cursor: (frame.cursor + (action.type === 'next' ? 1 : -1) + frame.options.length) % frame.options.length };
  if (action.type === 'back') {
    const back = frame.options.find(option => option.id === 'cancel' || option.id === 'back-post' || option.id === 'back-actions' || option.id === 'home');
    return back ? activate(state, back.id) : state;
  }
  const id = action.type === 'choose' ? action.id : frame.options[frame.cursor]?.id;
  // Browser shortcuts can only activate an option that is actually on this screen.
  return id && frame.options.some(option => option.id === id) ? activate(state, id) : state;
}

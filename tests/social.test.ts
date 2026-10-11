import { describe, expect, it } from 'vitest';
import { fitText, G2_TEXT, textWidth } from '../src/core/text.js';
import { createSocialState, reduceSocial, renderSocial, SOCIAL_LIMITS, type SocialAction, type SocialDestination, type SocialState } from '../src/social/index.js';

const choose = (state: SocialState, id: string) => reduceSocial(state, { type: 'choose', id });
const open = (state: SocialState, destination: SocialDestination) => reduceSocial(state, { type: 'open', destination });
function listening(state = createSocialState(), personId = 'mira') {
  return reduceSocial(choose(open(state, 'people'), `person:${personId}`), { type: 'voice-start' });
}
function review(state = createSocialState(), text?: string) {
  let next = listening(state);
  if (text !== undefined) next = reduceSocial(next, { type: 'transcript', sessionId: next.draft!.sessionId, text });
  return reduceSocial(next, { type: 'voice-stop' });
}
function reviewAll(state: SocialState) {
  let next = state;
  for (let page = 1; page < renderSocial(state).pages; page++) next = choose(next, 'review-page');
  return next;
}
function expectBudget(state: SocialState) {
  const frame = renderSocial(state);
  expect(frame.text, state.screen).toBe(frame.lines.join('\n'));
  expect(frame.lines.length, frame.text).toBeLessThanOrEqual(G2_TEXT.maxLines);
  expect(frame.text.length, frame.text).toBeLessThan(1000);
  for (const line of frame.lines) {
    expect(textWidth(line), line).toBeLessThanOrEqual(G2_TEXT.fullWidth);
    expect([...line].length, line).toBeLessThanOrEqual(G2_TEXT.fullChars);
  }
  expect(frame.options.filter(option => option.selected)).toHaveLength(1);
  expect(frame.cursor).toBeGreaterThanOrEqual(frame.optionWindow.start);
  expect(frame.cursor).toBeLessThan(frame.optionWindow.end);
  expect(frame.lines).toContain(fitText(`> ${frame.options[frame.cursor]!.label}`, G2_TEXT.fullWidth));
  if (state.screen !== 'home') expect(frame.options.some(option => /back|menu/i.test(option.label)), frame.text).toBe(true);
}

describe('Sideband local social state', () => {
  it('operates menu, post actions, voice review, and confirmed send using only scroll and tap', () => {
    let state = createSocialState();
    const select = () => { state = reduceSocial(state, { type: 'select' }); };
    const next = () => { state = reduceSocial(state, { type: 'next' }); };
    select();
    expect(state.screen).toBe('trending');
    while (renderSocial(state).options[renderSocial(state).cursor]!.id !== 'post-actions') next();
    select(); select();
    expect(state.screen).toBe('compose');
    expect(state.draft?.recipientId).toBe('mira');
    const count = state.messages.length;
    select();
    expect(state.draft?.phase).toBe('listening');
    select();
    expect(state.screen).toBe('review');
    expect(state.messages).toHaveLength(count);
    select();
    expect(state.screen).toBe('conversation');
    expect(state.draft).toBeNull();
    expect(state.messages).toHaveLength(count + 1);
    expect(state.messages.at(-1)).toMatchObject({ personId: 'mira', direction: 'outgoing', status: 'Demo sent' });
    expect(renderSocial(state).text).toContain('Demo sent');
  });

  it('keeps an offline draft and requires a fresh explicit send after reconnect', () => {
    let state = review(createSocialState({ online: false }), 'Meet me by the bookshop.');
    const count = state.messages.length;
    state = choose(state, 'send');
    expect(state.draft).toMatchObject({ recipientId: 'mira', text: 'Meet me by the bookshop.', failed: true });
    expect(state.messages).toHaveLength(count);
    expect(renderSocial(state).text).toContain('Offline. Draft kept.');
    expect(renderSocial(state).text).toContain('To Mira');
    state = reduceSocial(state, { type: 'set-online', online: true });
    expect(state.messages).toHaveLength(count);
    expect(state.draft).not.toBeNull();
    expect(renderSocial(state).text).toContain('To Mira');
    expect(renderSocial(state).options.find(option => option.id === 'send')?.label).toBe('Retry demo send');
    state = choose(state, 'send');
    expect(state.messages.at(-1)?.text).toBe('Meet me by the bookshop.');
    expect(state.messages).toHaveLength(count + 1);
    const after = reduceSocial(state, { type: 'choose', id: 'send' });
    expect(after).toBe(state);
  });

  it('locks the recipient and ignores stale transcripts after stop, cancel, and re-record', () => {
    let state = listening(); const sessionId = state.draft!.sessionId;
    state = reduceSocial(state, { type: 'transcript', sessionId, text: 'First thought' });
    const locked = open(state, 'people');
    expect(locked.screen).toBe('compose');
    expect(locked.draft?.recipientId).toBe('mira');
    state = reduceSocial(state, { type: 'voice-stop' });
    expect(reduceSocial(state, { type: 'transcript', sessionId, text: 'Late thought' })).toBe(state);
    state = choose(state, 'rerecord');
    expect(state.draft?.recipientId).toBe('mira');
    expect(state.draft?.sessionId).toBeGreaterThan(sessionId);
    state = reduceSocial(state, { type: 'voice-start' });
    expect(reduceSocial(state, { type: 'transcript', sessionId, text: 'Wrong session' })).toBe(state);
    state = choose(state, 'cancel');
    expect(state.draft).toBeNull();
    expect(reduceSocial(state, { type: 'transcript', sessionId: sessionId + 1, text: 'Too late' })).toBe(state);
  });

  it('requires all transcript pages to be reviewed and never sends silently truncated input', () => {
    let state = review(createSocialState(), 'W'.repeat(SOCIAL_LIMITS.text));
    expect(renderSocial(state).pages).toBeGreaterThan(1);
    const count = state.messages.length;
    state = choose(state, 'send');
    expect(state.messages).toHaveLength(count);
    expect(renderSocial(state).text).toContain('Read every transcript page');
    state = reviewAll(state);
    state = choose(state, 'send');
    expect(state.messages.at(-1)?.text).toBe('W'.repeat(SOCIAL_LIMITS.text));
    state = review(createSocialState(), '漢'.repeat(SOCIAL_LIMITS.text + 1));
    expect([...state.draft!.text]).toHaveLength(SOCIAL_LIMITS.text);
    expect(state.draft?.tooLong).toBe(true);
    state = choose(reviewAll(state), 'send');
    expect(state.messages).toHaveLength(count);
    expect(state.draft).not.toBeNull();
    expect(renderSocial(state).text).toContain('Transcript too long');
  });

  it('only activates visible choices and preserves the original immutable state', () => {
    const state = createSocialState(); const before = JSON.stringify(state);
    expect(choose(state, 'send')).toBe(state);
    expect(choose(state, 'report:spam')).toBe(state);
    expect(reduceSocial(state, { type: 'voice-stop' })).toBe(state);
    expect(reduceSocial(state, { type: 'voice-start' })).toBe(state);
    choose(review(state), 'send');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('saves, hides, reports and blocks locally, including visible empty states', () => {
    let state = choose(open(createSocialState(), 'trending'), 'post-actions');
    state = choose(state, 'save');
    expect(state.savedIds).toEqual(['post-mira']);
    state = choose(choose(state, 'report'), 'report:spam');
    expect(state.reports).toEqual([{ postId: 'post-mira', reason: 'spam' }]);
    expect(renderSocial(state).text).toContain('Demo report saved locally.');
    state = choose(choose(state, 'profile'), 'block');
    expect(state.blockedIds).toEqual(['mira']);
    expect(renderSocial(open(state, 'people')).options.some(option => option.id === 'person:mira')).toBe(false);
    expect(renderSocial(open(state, 'inbox')).options.some(option => option.id === 'person:mira')).toBe(false);
    expect(renderSocial(open(state, 'saved')).text).toContain('Save a post');
    for (let post = 0; post < 2; post++) state = choose(choose(open(state, 'trending'), 'post-actions'), 'hide');
    expect(renderSocial(state).text).toContain('You are all caught up');
  });

  it('keeps an unsaved post action tied to its original author until leaving the screen', () => {
    let state = choose(open(createSocialState(), 'trending'), 'post-actions');
    state = choose(state, 'save');
    state = choose(open(state, 'saved'), 'post-actions');
    state = choose(state, 'save');
    expect(state.savedIds).toHaveLength(0);
    state = choose(state, 'reply');
    expect(state.draft?.recipientId).toBe('mira');
  });

  it('can block from a longer conversation and later find and unblock that person from the home menu', () => {
    let state = choose(reviewAll(review(createSocialState(), 'W'.repeat(SOCIAL_LIMITS.text))), 'send');
    const frame = renderSocial(state);
    expect(frame.options.map(option => option.id)).toEqual(['message-page', 'reply', 'older-message', 'profile', 'home']);
    expect(frame.optionWindow.end).toBeLessThan(frame.options.length);
    const nativeChoices = new Set<string>();
    for (let index = 0; index < frame.options.length; index++) {
      expectBudget(state);
      const current = renderSocial(state);
      nativeChoices.add(current.options[current.cursor]!.id);
      state = reduceSocial(state, { type: 'next' });
    }
    expect(nativeChoices).toEqual(new Set(frame.options.map(option => option.id)));
    state = choose(choose(state, 'profile'), 'block');
    expect(state.blockedIds).toEqual(['mira']);
    state = reduceSocial(state, { type: 'back' });
    expect(state.screen).toBe('home');
    state = choose(state, 'blocked');
    expect(state.screen).toBe('blocked');
    expect(renderSocial(state).text).toContain('Mira');
    state = choose(state, 'blocked:mira');
    expect(state.screen).toBe('profile');
    expect(renderSocial(state).text).toContain('Unblock locally');
    state = choose(state, 'block');
    expect(state.blockedIds).toEqual([]);
    expect(renderSocial(open(state, 'people')).options.some(option => option.id === 'person:mira')).toBe(true);
    expect(renderSocial(open(state, 'blocked')).text).toContain('No blocked people.');
  });

  it('bounds sent history and lists the latest local conversation first', () => {
    let state = createSocialState();
    for (let index = 0; index < SOCIAL_LIMITS.messages + 3; index++) state = choose(review(state, `Message ${index}`), 'send');
    expect(state.messages).toHaveLength(SOCIAL_LIMITS.messages);
    expect(new Set(state.messages.map(message => message.id)).size).toBe(SOCIAL_LIMITS.messages);
    expect(renderSocial(open(state, 'inbox')).options[0]?.id).toBe('person:mira');
    expect(createSocialState().messages).toHaveLength(2);
  });
});

describe('Sideband native display budget', () => {
  it('fits every screen and every content page for normal, wide Latin, CJK, and empty fixtures', () => {
    const seen = new Set<string>();
    function capture(state: SocialState, pageAction?: string) {
      seen.add(state.screen);
      const count = renderSocial(state).pages;
      let current = state;
      for (let page = 0; page < count; page++) {
        for (let cursor = 0; cursor < renderSocial(current).options.length; cursor++) {
          expectBudget({ ...current, cursor });
        }
        if (pageAction) current = choose(current, pageAction);
      }
      return current;
    }
    for (const fixture of ['default', 'stress', 'empty'] as const) {
      const initial = createSocialState({ fixture });
      capture(initial);
      for (const destination of ['trending', 'saved', 'people', 'inbox', 'blocked'] as const) capture(open(initial, destination));
      let posts = open(initial, 'trending');
      for (let index = 0; index < initial.posts.length; index++) {
        capture(posts, 'post-page');
        const actions = capture(choose(posts, 'post-actions'));
        capture(choose(actions, 'report'));
        capture(choose(choose(actions, 'report'), 'report:harassment'));
        capture(open(choose(actions, 'save'), 'saved'), 'post-page');
        capture(choose(actions, 'profile'), 'profile-page');
        capture(open(choose(choose(actions, 'profile'), 'block'), 'blocked'));
        posts = choose(posts, 'next-post');
      }
      for (const person of initial.people) {
        const conversation = capture(choose(open(initial, 'people'), `person:${person.id}`), 'message-page');
        capture(choose(conversation, 'reply'));
        capture(reduceSocial(conversation, { type: 'voice-start' }));
      }
      if (initial.people.length) {
        for (const text of ['Short reply.', 'W'.repeat(SOCIAL_LIMITS.text), '漢字'.repeat(SOCIAL_LIMITS.text / 2)]) {
          const reviewed = capture(review(initial, text), 'review-page');
          const offline = capture(choose(reduceSocial(reviewed, { type: 'set-online', online: false }), 'send'));
          capture(reduceSocial(offline, { type: 'set-online', online: true }));
          capture(choose(reviewAll(reviewed), 'send'), 'message-page');
        }
      }
    }
    expect([...seen].sort()).toEqual(['blocked', 'compose', 'conversation', 'home', 'inbox', 'people', 'post-actions', 'profile', 'report', 'review', 'saved', 'trending'].sort());
  });

  it('keeps controls and a visible way back after each ordinary input', () => {
    let state = createSocialState();
    const actions: SocialAction[] = [{ type: 'select' }, { type: 'next' }, { type: 'prev' }, { type: 'select' }, { type: 'select' }, { type: 'select' }, { type: 'select' }, { type: 'back' }, { type: 'back' }];
    for (const action of actions) { state = reduceSocial(state, action); expectBudget(state); }
    expect(state.screen).toBe('home');
  });
});

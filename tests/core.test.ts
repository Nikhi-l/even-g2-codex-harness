import { describe, expect, it } from 'vitest';
import { artifactSchema, templateSchemas } from '../src/core/contracts.js';
import { examples } from '../src/core/examples.js';
import { StateStore } from '../src/core/store.js';
import { maxScroll, render } from '../src/core/render.js';
import { G2_TEXT, fitText, textWidth, wrapText } from '../src/core/text.js';
import { stressArtifacts } from '../src/core/stress.js';
import { allTemplates } from '../src/artifacts/index.js';

describe('artifact registry and validation', () => {
 it('keeps the registry and schemas aligned and validates every example and stress fixture', () => {
  expect(allTemplates().map(value => value.id).sort()).toEqual(Object.keys(templateSchemas).sort());
  expect(Object.keys(templateSchemas)).toHaveLength(16);
  for (const example of [...examples, ...stressArtifacts]) expect(artifactSchema.safeParse(example).success).toBe(true);
  expect(new Set(examples.map(example => example.template)).size).toBe(16);
 });
 it('rejects arbitrary URLs, unknown properties, unbounded data and invalid calendar dates', () => {
  expect(artifactSchema.safeParse({ id: 'img', template: 'image', data: { src: 'https://example.com/private' } }).success).toBe(false);
  expect(artifactSchema.safeParse({ ...examples[0], shell: 'do something' }).success).toBe(false);
  expect(artifactSchema.safeParse({ id: 'x', template: 'list', data: { rows: Array(41).fill('item') } }).success).toBe(false);
  expect(artifactSchema.safeParse({ id: 'cal', template: 'calendar', data: { month: '2026-02', marks: [{ day: 30 }] } }).success).toBe(false);
 });
 it('wraps by measured pixel width, including wide glyphs and CJK', () => {
  for (const sample of ['W'.repeat(90), 'i'.repeat(300), '\u6f22\u5b57'.repeat(60), 'The quick brown fox jumps. '.repeat(20)]) {
   for (const [width, chars] of [[G2_TEXT.splitWidth, G2_TEXT.splitChars], [G2_TEXT.fullWidth, G2_TEXT.fullChars]] as const)
    expect(wrapText(sample, width, chars).every(row => textWidth(row) <= width && [...row].length <= chars)).toBe(true);
  }
  expect(wrapText('alpha beta', 260, 48)).toEqual(['alpha beta']);
  expect(wrapText('one\n\ntwo', 260, 48)).toEqual(['one', '', 'two']);
  expect(textWidth(fitText('W'.repeat(40), 100))).toBeLessThanOrEqual(100); expect(fitText('W'.repeat(40), 100)).toMatch(/\.\.\.$/);
 });
 it('keeps every answer page inside the ten visible lines of the G2 text container', () => {
  for (const input of [...examples, ...stressArtifacts]) {
   const artifact = { ...artifactSchema.parse(input), version: 1, expiresAt: 0 };
   for (const layout of ['split', 'answer'] as const) {
    const width = layout === 'split' ? G2_TEXT.splitWidth : G2_TEXT.fullWidth;
    for (let page = 0; page < render(artifact, 0, 0, layout, 1, 'session').pages; page++) {
     const frame = render(artifact, 0, page, layout, 1, 'session'); const lines = frame.text.split('\n');
     expect(lines.length).toBeLessThanOrEqual(G2_TEXT.maxLines); expect(frame.text.length).toBeLessThanOrEqual(900);
     expect(lines.every(line => textWidth(line) <= width)).toBe(true);
    }
   }
  }
 });
 it('labels the answer with its speaker and puts the page marker in the header', () => {
  const frame = new StateStore().upsert({ ...examples[1]!, speaker: 'Claude', answer: 'word '.repeat(200) }).frame;
  expect(frame.pages).toBeGreaterThan(1); expect(frame.text.split('\n')[0]).toBe(`CLAUDE  1/${frame.pages}`);
  expect(new StateStore().upsert(examples[1]!).frame.text.startsWith('AGENT\n\n')).toBe(true);
  expect(artifactSchema.safeParse({ ...examples[1], speaker: 'x'.repeat(17) }).success).toBe(false);
 });
});
describe('state and artifact lifecycle', () => {
 it('rejects cross-session writes even when a restarted relay has the same revision', () => {
  const old = new StateStore(); const store = new StateStore(); const state = store.upsert(examples[0]!);
  const foreign = old.sessionId;
  const operations = [() => store.upsert(examples[1]!, state.revision, foreign), () => store.select(examples[0]!.id, state.revision, foreign),
   () => store.clear(state.revision, foreign), () => store.remove(examples[0]!.id, state.revision, foreign), () => store.setLayout('answer', state.revision, foreign)];
  for (const operation of operations) expect(operation).toThrow('session changed');
  expect(store.snapshot()).toEqual(state); expect(() => store.events(0, foreign)).toThrow('session changed');
 });
 it('retains original gestures and checks session before duplicate input IDs', () => {
  const store = new StateStore(); let state = store.upsert(examples[0]!);
  const event = { type: 'next', eventId: 'shared-id', sessionId: state.sessionId, revision: state.revision };
  state = store.input(event); expect(store.input(event).revision).toBe(state.revision);
  expect(() => store.input({ ...event, sessionId: new StateStore().sessionId })).toThrow('session changed');
  for (const type of ['previous', 'select', 'back'] as const) state = store.input({type,eventId:`input-${type}`,sessionId:state.sessionId,revision:state.revision});
  expect(store.events(1, state.sessionId).events.map(event => event.inputType)).toEqual(['next','previous','select','back']);
 });
 it('supports publish, replace, select, layout, clear, delete without exposing mutable state', () => {
  const store = new StateStore(); let state = store.upsert(examples[0]);
  expect(state.frame.layout).toBe('split');
  const revision = state.revision;
  state.artifacts[0]!.answer = 'mutated'; expect(store.snapshot().artifacts[0]!.answer).not.toBe('mutated');
  expect(() => store.upsert(examples[1], revision - 1)).toThrow('State changed');
  state = store.upsert({ ...examples[0]!, answer: 'Updated' }, revision);
  expect(state.artifacts[0]!.version).toBe(2);
  expect(store.setLayout('answer').frame.layout).toBe('answer');
  expect(store.clear().frame.text).toBe('');
  expect(store.select(examples[0]!.id).frame.layout).toBe('split');
  expect(store.remove(examples[0]!.id).artifacts).toHaveLength(0);
 });
 it('expires artifacts and leaves a blank frame', () => {
  let now = 1000; const store = new StateStore(() => now);
  store.upsert({ ...examples[0]!, ttlSeconds: 10 }); now += 10001;
  expect(store.snapshot().frame.artifact).toBeNull(); expect(store.events().events.at(-1)?.type).toBe('expired');
 });
 it('deduplicates inputs, rejects stale revisions and clamps scrolling to content', () => {
  const store = new StateStore(); const first = store.upsert(examples[0]);
  const event = { type: 'next', eventId: 'event-1', sessionId: store.sessionId, revision: first.revision };
  const second = store.input(event); expect(second.frame.scroll).toBe(1);
  expect(store.input(event).revision).toBe(second.revision);
  expect(() => store.input({ ...event, eventId: 'event-2' })).toThrow('State changed');
  for (let i = 0; i < 10; i++) store.input({ type: 'next', eventId: `next-${i}`, sessionId: store.sessionId, revision: store.snapshot().revision });
  expect(store.snapshot().frame.scroll).toBe(2);
  expect(store.input({ type: 'select', eventId: 'tap', sessionId: store.sessionId, revision: store.snapshot().revision }).frame.layout).toBe('answer');
 });
 it('bounds retention and receipts and reports event cursor truncation', () => {
  const store = new StateStore();
  for (let i = 0; i < 20; i++) store.upsert({ ...examples[0]!, id: `item-${i}` });
  expect(() => store.upsert({ ...examples[0]!, id: 'overflow' })).toThrow('limit');
  for (let i = 0; i < 105; i++) store.clear();
  expect(store.events().events).toHaveLength(100); expect(store.events().truncated).toBe(true);
  for (let i = 0; i < 20; i++) store.acknowledge({ clientId: `client-${i}`, sessionId: store.sessionId, revision: store.snapshot().revision, status: 'browser-rendered', mode: 'preview' });
  expect(store.snapshot().deliveries).toHaveLength(8);
  expect(() => store.acknowledge({ clientId: 'x', sessionId: store.sessionId, revision: 0, status: 'bridge-accepted', mode: 'even' })).toThrow('State changed');
 });
 it('turns a tap on a choices artifact into a choice event without toggling the pane', () => {
  const store = new StateStore(); const choices = examples.find(example => example.template === 'choices')!;
  let state = store.upsert(choices); let count = 0;
  const send = (type: 'next' | 'previous' | 'select' | 'back') => (state = store.input({ type, eventId: `input-${count++}`, sessionId: state.sessionId, revision: state.revision }));
  send('next'); send('next'); expect(state.frame.scroll).toBe(2);
  send('select'); expect(state.frame.layout).toBe('split'); expect(state.frame.chosen).toBe(2);
  expect(store.events(0).events.at(-1)).toMatchObject({ type: 'choice', inputType: 'select', choice: 2, artifactId: choices.id, artifactVersion: 1 });
  for (let i = 0; i < 12; i++) send('next');
  expect(state.frame.scroll).toBe(maxScroll(state.frame.artifact!)); expect(state.frame.chosen).toBe(2);
  send('back'); expect(state.frame.layout).toBe('answer'); send('select'); expect(state.frame.layout).toBe('split');
  state = store.upsert(choices); expect(state.frame.chosen).toBeNull(); expect(state.artifacts[0]!.version).toBe(2);
 });
});

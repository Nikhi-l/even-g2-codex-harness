import { describe, expect, it } from 'vitest';
import { artifactSchema, templateSchemas } from '../src/core/contracts.js';
import { examples } from '../src/core/examples.js';
import { StateStore } from '../src/core/store.js';
import { columns, wrap } from '../src/core/render.js';
import { allTemplates } from '../src/artifacts/index.js';

describe('artifact registry and validation', () => {
 it('preserves all seven extracted templates and validates every example', () => {
  expect(allTemplates().map(value => value.id).sort()).toEqual(Object.keys(templateSchemas).sort());
  for (const example of examples) expect(artifactSchema.safeParse(example).success).toBe(true);
 });
 it('rejects arbitrary URLs, unknown properties, unbounded data and invalid calendar dates', () => {
  expect(artifactSchema.safeParse({ id: 'img', template: 'image', data: { src: 'https://example.com/private' } }).success).toBe(false);
  expect(artifactSchema.safeParse({ ...examples[0], shell: 'do something' }).success).toBe(false);
  expect(artifactSchema.safeParse({ id: 'x', template: 'list', data: { rows: Array(41).fill('item') } }).success).toBe(false);
  expect(artifactSchema.safeParse({ id: 'cal', template: 'calendar', data: { month: '2026-02', marks: [{ day: 30 }] } }).success).toBe(false);
 });
 it('wraps long and wide text into conservative columns', () => {
  expect(wrap('a'.repeat(90), 21).every(row => columns(row) <= 21)).toBe(true);
  expect(wrap('漢字'.repeat(25), 21).every(row => columns(row) <= 21)).toBe(true);
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
});

import { describe, expect, it, vi } from 'vitest';
import { StartUpPageCreateResult, ImageRawDataUpdateResult, Sys_ItemEvent, Text_ItemEvent } from '@evenrealities/even_hub_sdk';
import { EvenAdapter, normalizeInput, type Bridge } from '../src/device/even.js';
import { RenderQueue } from '../src/device/adapter.js';
import { StateStore } from '../src/core/store.js';
import { examples } from '../src/core/examples.js';
import { COMPENSATED, DISPLAYED_LEVELS } from '../src/device/tiles.js';
function setup() {
 const unsubscribe = vi.fn();
 const bridge: Bridge = { createStartUpPageContainer: vi.fn(async () => StartUpPageCreateResult.success), rebuildPageContainer: vi.fn(async () => true), textContainerUpgrade: vi.fn(async () => true), updateImageRawData: vi.fn(async () => ImageRawDataUpdateResult.success), onEvenHubEvent: vi.fn(() => unsubscribe), shutDownPageContainer: vi.fn(async () => true), getLocalStorage: vi.fn(async () => ''), setLocalStorage: vi.fn(async () => true) };
 const store = new StateStore(); const frame = store.upsert(examples[0]).frame;
 const tiles = vi.fn(async () => [new Uint8Array([1]), new Uint8Array([2])]);
 return { bridge, store, frame, tiles, unsubscribe, adapter: new EvenAdapter(bridge, vi.fn(), vi.fn(), 100, tiles) };
}
describe('Even adapter', () => {
 it('serializes phone settings with rendering and system exit', async () => {
  const { adapter, bridge, frame } = setup(); let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(bridge.updateImageRawData).mockImplementationOnce(async () => { await blocked; return ImageRawDataUpdateResult.success; });
  const render = adapter.render(frame); await vi.waitFor(() => expect(bridge.updateImageRawData).toHaveBeenCalledOnce());
  const read = adapter.readSetting('synthetic-key'); const write = adapter.writeSetting('synthetic-key', 'synthetic-value');
  const exit = adapter.requestSystemExit();
  expect(bridge.getLocalStorage).not.toHaveBeenCalled(); expect(bridge.setLocalStorage).not.toHaveBeenCalled();
  await expect(adapter.writeSetting('after-exit', '')).rejects.toThrow('exit is pending');
  release(); await Promise.all([render, read, write, exit]);
  expect(vi.mocked(bridge.getLocalStorage).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(bridge.setLocalStorage).mock.invocationCallOrder[0]!);
  expect(vi.mocked(bridge.setLocalStorage).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(bridge.shutDownPageContainer).mock.invocationCallOrder[0]!);
 });
 it('fails closed on a setting timeout before another queued SDK operation', async () => {
  const { adapter, bridge, frame, unsubscribe } = setup();
  vi.mocked(bridge.getLocalStorage).mockImplementation(() => new Promise(() => {}));
  const reading = adapter.readSetting('synthetic-key');
  const rendering = adapter.render(frame);
  const outcomes = await Promise.allSettled([reading, rendering]);
  expect(outcomes.every(result => result.status === 'rejected')).toBe(true);
  expect(bridge.createStartUpPageContainer).not.toHaveBeenCalled(); expect(unsubscribe).toHaveBeenCalledOnce();
  await expect(adapter.writeSetting('synthetic-key', '')).rejects.toThrow('closed'); expect(bridge.setLocalStorage).not.toHaveBeenCalled();
 });
 it('routes root double tap to the system exit dialog after pending image writes', async () => {
  const { adapter, bridge, frame } = setup();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(bridge.updateImageRawData).mockImplementationOnce(async () => { await blocked; return ImageRawDataUpdateResult.success; });
  const rendering = adapter.render(frame);
  await vi.waitFor(() => expect(bridge.updateImageRawData).toHaveBeenCalledOnce());
  const event = vi.mocked(bridge.onEvenHubEvent).mock.calls[0]![0];
  event({ sysEvent: new Sys_ItemEvent({ eventType: 3 }) });
  event({ sysEvent: new Sys_ItemEvent({ eventType: 3 }) });
  expect(bridge.shutDownPageContainer).not.toHaveBeenCalled();
  release(); await rendering;
  await vi.waitFor(() => expect(bridge.shutDownPageContainer).toHaveBeenCalledExactlyOnceWith(1));
 });
 it('fails closed when system exit is rejected', async () => {
  const { adapter, bridge, frame } = setup(); await adapter.render(frame);
  vi.mocked(bridge.shutDownPageContainer).mockResolvedValue(false);
  await expect(adapter.requestSystemExit()).rejects.toThrow('rejected');
  await expect(adapter.render(frame)).rejects.toThrow('closed');
 });
 it('normalizes real text/system envelopes and omitted zero click without phantom taps', () => {
  expect(normalizeInput({})).toBeNull(); expect(normalizeInput({ jsonData: {} })).toBeNull();
  expect(normalizeInput({ sysEvent: new Sys_ItemEvent() })).toBe('select');
  expect(normalizeInput({ textEvent: new Text_ItemEvent({ eventType: 0 }) })).toBe('select');
  expect(normalizeInput({ textEvent: new Text_ItemEvent({ eventType: 2 }) })).toBe('next');
  expect(normalizeInput({ sysEvent: new Sys_ItemEvent({ eventType: 3 }) })).toBe('back');
  expect(normalizeInput({ sysEvent: new Sys_ItemEvent({ eventType: 4 }) })).toBeNull();
  expect(normalizeInput({ textEvent: new Text_ItemEvent({ containerID: 99, eventType: 0 }) })).toBeNull();
 });
 it('creates once, writes two tiles in sequence and skips unchanged content', async () => {
  const { adapter, bridge, frame, tiles } = setup();
  expect((await adapter.render(frame)).status).toBe('bridge-accepted');
  const create = vi.mocked(bridge.createStartUpPageContainer).mock.calls[0]![0];
  expect(create.containerTotalNum).toBe(3); expect(create.textObject?.filter(value => value.isEventCapture === 1)).toHaveLength(1);
  expect(create.imageObject?.map(value => [value.width, value.height])).toEqual([[288,144],[288,144]]);
  await adapter.render(frame); expect(tiles).toHaveBeenCalledTimes(1); expect(bridge.updateImageRawData).toHaveBeenCalledTimes(2);
  expect(bridge.createStartUpPageContainer).toHaveBeenCalledTimes(1); expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();
 });
 it('rewrites growing text from offset 0 and rebuilds shorter text instead of padding it', async () => {
  const { adapter, bridge, frame, store } = setup();
  await adapter.render(frame);
  await adapter.render({ ...frame, text: frame.text + ' More', revision: 2 });
  const grow = vi.mocked(bridge.textContainerUpgrade).mock.calls[0]![0];
  expect([grow.contentOffset, grow.contentLength, grow.content]).toEqual([0, frame.text.length + 5, frame.text + ' More']);
  expect(bridge.updateImageRawData).toHaveBeenCalledTimes(2);
  // Padding a shorter text with spaces would wrap into hidden lines and make the firmware scroll.
  await adapter.render({ ...frame, text: 'Short', revision: 3 });
  expect(bridge.textContainerUpgrade).toHaveBeenCalledOnce();
  expect(vi.mocked(bridge.rebuildPageContainer).mock.calls[0]![0].textObject?.[0]?.content).toBe('Short');
  expect(bridge.updateImageRawData).toHaveBeenCalledTimes(4);
  await adapter.render(store.setLayout('answer').frame); expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(2);
  await adapter.render(store.setLayout('split').frame); expect(bridge.updateImageRawData).toHaveBeenCalledTimes(6);
 });
 it('redraws the artifact tiles when the wearer makes a choice', async () => {
  const { adapter, bridge, tiles } = setup();
  const store = new StateStore(); const state = store.upsert(examples.find(example => example.template === 'choices')!);
  await adapter.render(state.frame);
  const chosen = store.input({ type: 'select', eventId: 'choice-1', sessionId: state.sessionId, revision: state.revision }).frame;
  expect(chosen.chosen).toBe(0); await adapter.render(chosen);
  expect(tiles).toHaveBeenCalledTimes(2); expect(bridge.updateImageRawData).toHaveBeenCalledTimes(4);
 });
 it('rejects invalid startup rather than treating it as success', async () => {
  const { adapter, bridge, frame, unsubscribe } = setup();
  vi.mocked(bridge.createStartUpPageContainer).mockResolvedValue(StartUpPageCreateResult.invalid);
  await expect(adapter.render(frame)).rejects.toThrow('rejected');
  expect(bridge.updateImageRawData).not.toHaveBeenCalled(); expect(unsubscribe).toHaveBeenCalledOnce();
 });
 it('reports tile failure and fails closed on timeout without overlapping retries', async () => {
  const { adapter, bridge, frame } = setup();
  vi.mocked(bridge.updateImageRawData).mockResolvedValue(ImageRawDataUpdateResult.sendFailed);
  await expect(adapter.render(frame)).rejects.toThrow('tile 1');
  const timed = setup(); vi.mocked(timed.bridge.createStartUpPageContainer).mockImplementation(() => new Promise(() => {}));
  await expect(timed.adapter.render(timed.frame)).rejects.toThrow('timed out');
  await expect(timed.adapter.render(timed.frame)).rejects.toThrow('closed');
  expect(timed.bridge.createStartUpPageContainer).toHaveBeenCalledOnce();
 });
 it('coalesces queued frames while preserving write order', async () => {
  const seen: number[] = []; let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const { frame } = setup();
  const queue = new RenderQueue({ mode: 'preview', dispose() {}, async render(value) { seen.push(value.revision); if (value.revision === 1) await blocked; return { sessionId: value.sessionId, revision: value.revision, status: 'browser-rendered' }; } }, vi.fn(), vi.fn());
  queue.submit({ ...frame, revision: 1 }); queue.submit({ ...frame, revision: 2 }); queue.submit({ ...frame, revision: 3 });
  release(); await vi.waitFor(() => expect(seen).toEqual([1, 3])); queue.dispose();
 });
 it('compensates tile brightness for the measured display response', () => {
  // Palette: black, panel fill, dim text, cyan, bright green (max channel of each colour).
  const sent = [0, 0x6e, 0x91, 0xe0, 0xf7].map(value => COMPENSATED[value]!);
  expect(sent).toEqual([0, 17, 51, 119, 136]);
  expect(sent.map(value => DISPLAYED_LEVELS[Math.min(value / 17, 9)])).toEqual([0, 96, 157, 230, 244]);
  expect(COMPENSATED[255]).toBe(255); expect(COMPENSATED.every(value => value % 17 === 0)).toBe(true);
  for (let value = 1; value < 256; value++) expect(COMPENSATED[value]!).toBeGreaterThanOrEqual(COMPENSATED[value - 1]!);
 });
});

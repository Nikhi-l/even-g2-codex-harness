import { describe, expect, it, vi } from 'vitest';
import { StartUpPageCreateResult, ImageRawDataUpdateResult, Sys_ItemEvent, Text_ItemEvent } from '@evenrealities/even_hub_sdk';
import { EvenAdapter, normalizeInput, type Bridge } from '../src/device/even.js';
import { RenderQueue } from '../src/device/adapter.js';
import { StateStore } from '../src/core/store.js';
import { examples } from '../src/core/examples.js';
function setup() {
 const unsubscribe = vi.fn();
 const bridge: Bridge = { createStartUpPageContainer: vi.fn(async () => StartUpPageCreateResult.success), rebuildPageContainer: vi.fn(async () => true), textContainerUpgrade: vi.fn(async () => true), updateImageRawData: vi.fn(async () => ImageRawDataUpdateResult.success), onEvenHubEvent: vi.fn(() => unsubscribe) };
 const store = new StateStore(); const frame = store.upsert(examples[0]).frame;
 const tiles = vi.fn(async () => [new Uint8Array([1]), new Uint8Array([2])]);
 return { bridge, store, frame, tiles, unsubscribe, adapter: new EvenAdapter(bridge, vi.fn(), vi.fn(), 100, tiles) };
}
describe('Even adapter', () => {
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
 it('updates only answer text and clears stale text on shrink; rebuilds for layout changes', async () => {
  const { adapter, bridge, frame, store } = setup();
  await adapter.render(frame);
  await adapter.render({ ...frame, text: frame.text + ' More', revision: 2 });
  expect(vi.mocked(bridge.textContainerUpgrade).mock.calls[0]![0].contentOffset).toBe(frame.text.length);
  await adapter.render({ ...frame, text: 'Short', revision: 3 });
  expect(vi.mocked(bridge.textContainerUpgrade).mock.calls[1]![0].content?.trim()).toBe('Short');
  expect(bridge.updateImageRawData).toHaveBeenCalledTimes(2);
  await adapter.render(store.setLayout('answer').frame); expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(1);
  await adapter.render(store.setLayout('split').frame); expect(bridge.updateImageRawData).toHaveBeenCalledTimes(4);
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
});

import { describe, expect, it, vi } from 'vitest';
import { AudioEvent, OsEventTypeList, StartUpPageCreateResult, Sys_ItemEvent, Text_ItemEvent } from '@evenrealities/even_hub_sdk';
import type { DisplayFrame } from '../src/core/contracts.js';
import { SocialAdapter, SOCIAL_INPUT, SOCIAL_TEXT, type SocialBridge } from '../src/device/social.js';

function setup(timeoutMs = 1000) {
  const unsubscribe = vi.fn(); const onInput = vi.fn();
  const onVoice = { press: vi.fn(), release: vi.fn() }; const failure = vi.fn();
  const bridge: SocialBridge = {
    createStartUpPageContainer: vi.fn(async () => StartUpPageCreateResult.success),
    rebuildPageContainer: vi.fn(async () => true), textContainerUpgrade: vi.fn(async () => true),
    shutDownPageContainer: vi.fn(async () => true), onEvenHubEvent: vi.fn(() => unsubscribe),
  };
  const frame: DisplayFrame = { sessionId: '46d8584b-755f-4684-bda8-96929e92b631', revision: 1,
    artifact: null, layout: 'answer', scroll: 0, text: 'SIDEBAND\n\nHello', page: 0, pages: 1, chosen: null };
  const adapter = new SocialAdapter(bridge, onInput, onVoice, failure, timeoutMs);
  const event = vi.mocked(bridge.onEvenHubEvent).mock.calls[0]![0];
  return { adapter, bridge, frame, event, onInput, onVoice, failure, unsubscribe };
}

describe('Social native text adapter', () => {
  it('creates a full-width text page with one blank input capture and returns only bridge acceptance', async () => {
    const { adapter, bridge, frame } = setup();
    await expect(adapter.render(frame)).resolves.toEqual({ sessionId: frame.sessionId, revision: 1, status: 'bridge-accepted' });
    const create = vi.mocked(bridge.createStartUpPageContainer).mock.calls[0]![0];
    expect(create.containerTotalNum).toBe(2); expect(create.imageObject).toEqual([]);
    expect(create.textObject?.filter(value => value.isEventCapture === 1)).toHaveLength(1);
    expect(create.textObject?.[0]).toMatchObject({ ...SOCIAL_INPUT, width: 576, height: 288, content: ' ', paddingLength: 0, isEventCapture: 1 });
    expect(create.textObject?.[1]).toMatchObject({ ...SOCIAL_TEXT, width: 576, height: 288, content: frame.text, paddingLength: 6, isEventCapture: 0 });
    await expect(adapter.render({ ...frame, revision: 2 })).resolves.toMatchObject({ revision: 2 });
    expect(bridge.createStartUpPageContainer).toHaveBeenCalledOnce();
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled(); expect(bridge.rebuildPageContainer).not.toHaveBeenCalled();
  });

  it('serializes startup, growing updates, shorter rebuilds, and system exit', async () => {
    const { adapter, bridge, frame } = setup(); let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(bridge.createStartUpPageContainer).mockImplementation(async () => { await blocked; return StartUpPageCreateResult.success; });
    const startup = adapter.render(frame);
    const update = adapter.render({ ...frame, revision: 2, text: frame.text + ' there' });
    const rebuild = adapter.render({ ...frame, revision: 3, text: 'Short' });
    const exit = adapter.requestSystemExit();
    await vi.waitFor(() => expect(bridge.createStartUpPageContainer).toHaveBeenCalledOnce());
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();
    expect(bridge.rebuildPageContainer).not.toHaveBeenCalled(); expect(bridge.shutDownPageContainer).not.toHaveBeenCalled();
    release(); await Promise.all([startup, update, rebuild, exit]);
    const upgrade = vi.mocked(bridge.textContainerUpgrade).mock.calls[0]![0];
    expect(upgrade).toMatchObject({ ...SOCIAL_TEXT, contentOffset: 0, contentLength: frame.text.length + 6, content: frame.text + ' there' });
    expect(vi.mocked(bridge.rebuildPageContainer).mock.calls[0]![0].textObject?.[1]?.content).toBe('Short');
    expect(bridge.shutDownPageContainer).toHaveBeenCalledExactlyOnceWith(1);
    const calls = [bridge.createStartUpPageContainer, bridge.textContainerUpgrade, bridge.rebuildPageContainer, bridge.shutDownPageContainer]
      .map(method => vi.mocked(method).mock.invocationCallOrder[0]!);
    expect(calls).toEqual([...calls].sort((a, b) => a - b));
  });

  it('rebuilds blank text using one space, without padding the previous content', async () => {
    const { adapter, bridge, frame } = setup(); await adapter.render(frame);
    await adapter.render({ ...frame, text: '', revision: 2 });
    expect(vi.mocked(bridge.rebuildPageContainer).mock.calls[0]![0].textObject?.[1]?.content).toBe(' ');
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();
  });

  it.each([
    ['ten-line', Array.from({ length: 11 }, () => 'a').join('\n')],
    ['530-pixel', 'W'.repeat(34)],
    ['900-character', 'l'.repeat(901)],
    ['control', 'a\tb'],
  ])('rejects a %s budget violation before any SDK write', async (message, text) => {
    const { adapter, bridge, frame, unsubscribe } = setup();
    await expect(adapter.render({ ...frame, text })).rejects.toThrow(message);
    expect(bridge.createStartUpPageContainer).not.toHaveBeenCalled(); expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('accepts ten lines and 900 characters when every line fits the measured width', async () => {
    const { adapter, bridge, frame } = setup();
    const text = [...Array.from({ length: 9 }, () => 'l'.repeat(90)), 'l'.repeat(81)].join('\n');
    expect(text).toHaveLength(900);
    await expect(adapter.render({ ...frame, text })).resolves.toMatchObject({ status: 'bridge-accepted' });
    expect(bridge.createStartUpPageContainer).toHaveBeenCalledOnce();
  });

  it('rejects split layouts instead of silently losing an artifact', async () => {
    const { adapter, bridge, frame } = setup();
    await expect(adapter.render({ ...frame, layout: 'split' })).rejects.toThrow('full-width native text');
    expect(bridge.createStartUpPageContainer).not.toHaveBeenCalled();
  });

  it.each(['startup', 'update', 'rebuild', 'exit'] as const)('fails closed on rejected %s, including queued writes', async operation => {
    const { adapter, bridge, frame, unsubscribe } = setup();
    if (operation !== 'startup') await adapter.render(frame);
    let result: Promise<unknown>;
    if (operation === 'startup') {
      vi.mocked(bridge.createStartUpPageContainer).mockResolvedValue(StartUpPageCreateResult.invalid);
      result = adapter.render(frame);
    } else if (operation === 'update') {
      vi.mocked(bridge.textContainerUpgrade).mockResolvedValue(false);
      result = adapter.render({ ...frame, text: frame.text + ' more', revision: 2 });
    } else if (operation === 'rebuild') {
      vi.mocked(bridge.rebuildPageContainer).mockResolvedValue(false);
      result = adapter.render({ ...frame, text: 'Short', revision: 2 });
    } else {
      vi.mocked(bridge.shutDownPageContainer).mockResolvedValue(false);
      result = adapter.requestSystemExit();
    }
    const queued = adapter.render({ ...frame, text: 'Queued frame that must never reach the SDK', revision: 3 });
    const results = await Promise.allSettled([result, queued]);
    expect(results.every(value => value.status === 'rejected')).toBe(true);
    expect(results[0]).toMatchObject({ status: 'rejected', reason: expect.objectContaining({ message: expect.stringContaining('rejected') }) });
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.objectContaining({ message: expect.stringContaining('closed') }) });
    expect(unsubscribe).toHaveBeenCalledOnce();
    await expect(adapter.render(frame)).rejects.toThrow('closed');
    expect(bridge.createStartUpPageContainer).toHaveBeenCalledOnce();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(operation === 'update' ? 1 : 0);
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(operation === 'rebuild' ? 1 : 0);
    expect(bridge.shutDownPageContainer).toHaveBeenCalledTimes(operation === 'exit' ? 1 : 0);
  });

  it.each(['startup', 'update', 'rebuild', 'exit'] as const)('never retries or overlaps a timed-out %s', async operation => {
    const { adapter, bridge, frame, unsubscribe } = setup(10);
    if (operation !== 'startup') await adapter.render(frame);
    let result: Promise<unknown>;
    if (operation === 'startup') {
      vi.mocked(bridge.createStartUpPageContainer).mockImplementation(() => new Promise(() => {}));
      result = adapter.render(frame);
    } else if (operation === 'update') {
      vi.mocked(bridge.textContainerUpgrade).mockImplementation(() => new Promise(() => {}));
      result = adapter.render({ ...frame, text: frame.text + ' more', revision: 2 });
    } else if (operation === 'rebuild') {
      vi.mocked(bridge.rebuildPageContainer).mockImplementation(() => new Promise(() => {}));
      result = adapter.render({ ...frame, text: 'Short', revision: 2 });
    } else {
      vi.mocked(bridge.shutDownPageContainer).mockImplementation(() => new Promise(() => {}));
      result = adapter.requestSystemExit();
    }
    const queued = adapter.render({ ...frame, text: 'Queued frame that must never reach the SDK', revision: 3 });
    const results = await Promise.allSettled([result, queued]);
    expect(results.every(value => value.status === 'rejected')).toBe(true);
    expect(results[0]).toMatchObject({ status: 'rejected', reason: expect.objectContaining({ message: expect.stringContaining('timed out') }) });
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.objectContaining({ message: expect.stringContaining('closed') }) });
    expect(unsubscribe).toHaveBeenCalledOnce();
    await expect(adapter.render(frame)).rejects.toThrow('closed');
    await expect(adapter.requestSystemExit()).rejects.toThrow('closed');
    expect(bridge.createStartUpPageContainer).toHaveBeenCalledOnce();
    expect(bridge.textContainerUpgrade).toHaveBeenCalledTimes(operation === 'update' ? 1 : 0);
    expect(bridge.rebuildPageContainer).toHaveBeenCalledTimes(operation === 'rebuild' ? 1 : 0);
    expect(bridge.shutDownPageContainer).toHaveBeenCalledTimes(operation === 'exit' ? 1 : 0);
  });

  it('routes input and mock voice gestures only from real, matching event envelopes', () => {
    const { event, onInput, onVoice } = setup();
    event({}); event({ jsonData: {} });
    event({ audioEvent: new AudioEvent({ audioPcm: new Uint8Array([1, 2]) }) });
    for (const eventType of [OsEventTypeList.CLICK_EVENT, OsEventTypeList.LONG_PRESS_EVENT, OsEventTypeList.LONG_PRESS_RELEASE_EVENT]) {
      event({ textEvent: new Text_ItemEvent({ containerID: 99, eventType }) });
      event({ textEvent: new Text_ItemEvent({ containerName: 'wrong', eventType }) });
    }
    event({ sysEvent: new Sys_ItemEvent({ eventType: OsEventTypeList.FOREGROUND_ENTER_EVENT }) });
    expect(onInput).not.toHaveBeenCalled(); expect(onVoice.press).not.toHaveBeenCalled(); expect(onVoice.release).not.toHaveBeenCalled();
    event({ sysEvent: new Sys_ItemEvent() });
    event({ textEvent: new Text_ItemEvent({ ...SOCIAL_INPUT }) });
    event({ sysEvent: new Sys_ItemEvent({ eventType: OsEventTypeList.SCROLL_TOP_EVENT }) });
    event({ textEvent: new Text_ItemEvent({ ...SOCIAL_INPUT, eventType: OsEventTypeList.SCROLL_BOTTOM_EVENT }) });
    event({ sysEvent: new Sys_ItemEvent({ eventType: OsEventTypeList.LONG_PRESS_EVENT }) });
    event({ textEvent: new Text_ItemEvent({ ...SOCIAL_INPUT, eventType: OsEventTypeList.LONG_PRESS_RELEASE_EVENT }) });
    expect(onInput.mock.calls).toEqual([['select'], ['select'], ['previous'], ['next']]);
    expect(onVoice.press).toHaveBeenCalledOnce(); expect(onVoice.release).toHaveBeenCalledOnce();
  });

  it('queues double tap behind startup, suppresses gestures during exit, and never emits Back', async () => {
    const { adapter, bridge, frame, event, onInput, onVoice } = setup(); let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(bridge.createStartUpPageContainer).mockImplementation(async () => { await blocked; return StartUpPageCreateResult.success; });
    const rendering = adapter.render(frame);
    event({ sysEvent: new Sys_ItemEvent({ eventType: OsEventTypeList.DOUBLE_CLICK_EVENT }) });
    event({ sysEvent: new Sys_ItemEvent({ eventType: OsEventTypeList.DOUBLE_CLICK_EVENT }) });
    event({ sysEvent: new Sys_ItemEvent() });
    event({ sysEvent: new Sys_ItemEvent({ eventType: OsEventTypeList.LONG_PRESS_EVENT }) });
    const queued = adapter.render({ ...frame, text: frame.text + ' after exit', revision: 2 });
    expect(bridge.shutDownPageContainer).not.toHaveBeenCalled(); expect(onInput).not.toHaveBeenCalled(); expect(onVoice.press).not.toHaveBeenCalled();
    release(); await Promise.all([rendering, queued]);
    await vi.waitFor(() => expect(bridge.shutDownPageContainer).toHaveBeenCalledExactlyOnceWith(1));
    expect(vi.mocked(bridge.shutDownPageContainer).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(bridge.textContainerUpgrade).mock.invocationCallOrder[0]!);
  });

  it('keeps a phone frame queued until a pending exit call is accepted', async () => {
    const { adapter, bridge, frame, failure, unsubscribe } = setup(); await adapter.render(frame);
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(bridge.shutDownPageContainer).mockImplementation(async () => { await blocked; return true; });
    const exit = adapter.requestSystemExit();
    const queued = adapter.render({ ...frame, text: frame.text + ' after exit', revision: 2 });
    await vi.waitFor(() => expect(bridge.shutDownPageContainer).toHaveBeenCalledOnce());
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled();
    release(); await exit;
    await expect(queued).resolves.toMatchObject({ revision: 2, status: 'bridge-accepted' });
    expect(bridge.textContainerUpgrade).toHaveBeenCalledOnce();
    expect(failure).not.toHaveBeenCalled(); expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('rejects a frame queued behind exit if the app is disposed before exit resolves', async () => {
    const { adapter, bridge, frame, unsubscribe } = setup(); await adapter.render(frame);
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(bridge.shutDownPageContainer).mockImplementation(async () => { await blocked; return true; });
    const exit = adapter.requestSystemExit();
    const queued = adapter.render({ ...frame, text: frame.text + ' after exit', revision: 2 });
    await vi.waitFor(() => expect(bridge.shutDownPageContainer).toHaveBeenCalledOnce());
    adapter.dispose(); release();
    const results = await Promise.allSettled([exit, queued]);
    expect(results.every(value => value.status === 'rejected')).toBe(true);
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled(); expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('reports an event-triggered exit failure and stops every later event', async () => {
    const { adapter, bridge, frame, event, failure, unsubscribe, onInput, onVoice } = setup(); await adapter.render(frame);
    vi.mocked(bridge.shutDownPageContainer).mockResolvedValue(false);
    event({ textEvent: new Text_ItemEvent({ ...SOCIAL_INPUT, eventType: OsEventTypeList.DOUBLE_CLICK_EVENT }) });
    await vi.waitFor(() => expect(failure).toHaveBeenCalledOnce());
    event({ sysEvent: new Sys_ItemEvent() });
    event({ sysEvent: new Sys_ItemEvent({ eventType: OsEventTypeList.LONG_PRESS_RELEASE_EVENT }) });
    expect(onInput).not.toHaveBeenCalled(); expect(onVoice.release).not.toHaveBeenCalled();
    adapter.dispose(); expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('does not accept a late SDK response after disposal or start the next queued write', async () => {
    const { adapter, bridge, frame, unsubscribe } = setup(); let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    vi.mocked(bridge.createStartUpPageContainer).mockImplementation(async () => { await blocked; return StartUpPageCreateResult.success; });
    const render = adapter.render(frame); const queued = adapter.render({ ...frame, text: frame.text + ' more', revision: 2 });
    await vi.waitFor(() => expect(bridge.createStartUpPageContainer).toHaveBeenCalledOnce());
    adapter.dispose(); release();
    const results = await Promise.allSettled([render, queued]);
    expect(results.every(value => value.status === 'rejected')).toBe(true);
    expect(bridge.textContainerUpgrade).not.toHaveBeenCalled(); expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

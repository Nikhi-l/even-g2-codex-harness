import {
  CreateStartUpPageContainer, RebuildPageContainer, TextContainerProperty, TextContainerUpgrade,
  ImageContainerProperty, ImageRawDataUpdate, ImageRawDataUpdateResult,
  StartUpPageCreateResult, OsEventTypeList, waitForEvenAppBridge,
  type EvenAppBridge, type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';
import type { DisplayFrame } from '../core/contracts.js';
import type { DisplayAdapter, InputType, Receipt } from './adapter.js';
import { encodeTiles } from './tiles.js';

export const CONTAINER = { containerID: 1, containerName: 'g2-artifact' } as const;
export type Bridge = Pick<EvenAppBridge, 'createStartUpPageContainer' | 'rebuildPageContainer' | 'textContainerUpgrade' | 'updateImageRawData' | 'onEvenHubEvent' | 'shutDownPageContainer' | 'getLocalStorage' | 'setLocalStorage'>;
export function normalizeInput(event: EvenHubEvent): InputType | null {
  // Protobuf may omit zero-valued CLICK_EVENT. Only default within a real envelope.
  const payload = event.textEvent ?? event.sysEvent;
  if (!payload) return null;
  if (event.textEvent?.containerID !== undefined && event.textEvent.containerID !== CONTAINER.containerID) return null;
  const type = payload.eventType ?? OsEventTypeList.CLICK_EVENT;
  switch (type) {
    case OsEventTypeList.CLICK_EVENT: return 'select';
    case OsEventTypeList.SCROLL_TOP_EVENT: return 'previous';
    case OsEventTypeList.SCROLL_BOTTOM_EVENT: return 'next';
    case OsEventTypeList.DOUBLE_CLICK_EVENT: return 'back';
    default: return null;
  }
}
export function timeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
export class EvenAdapter implements DisplayAdapter {
  readonly mode = 'even';
  private ready = false;
  private layout = '';
  private previousText = '';
  private previousTileSignature = '';
  private disposed = false;
  private operation: Promise<unknown> = Promise.resolve();
  private exitPending = false;
  private unsubscribe: () => void;
  constructor(private bridge: Bridge, onInput: (type: InputType) => void, diagnostic: (message: string) => void = () => {}, private timeoutMs = 8000,
    private tiles = encodeTiles, private failure: (error: Error) => void = () => {}) {
    this.unsubscribe = bridge.onEvenHubEvent(event => {
      // Log event shape/type only: audio and arbitrary raw payloads never leave this boundary.
      const envelope = event.textEvent ? 'text' : event.sysEvent ? 'system' : 'other';
      diagnostic(`${envelope} event ${event.textEvent?.eventType ?? event.sysEvent?.eventType ?? 'omitted'}`);
      const input = normalizeInput(event);
      if (this.disposed || this.exitPending || !input) return;
      if (input === 'back') void this.requestSystemExit().catch(error => this.failure(error instanceof Error ? error : new Error('Exit failed')));
      else onInput(input);
    });
  }
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation);
    this.operation = next.catch(() => {});
    return next;
  }
  /** The host owns the confirmation dialog and closes its WebView after confirmation. */
  async requestSystemExit(): Promise<void> {
    if (this.exitPending) return;
    this.exitPending = true;
    try {
      await this.serialize(async () => {
        if (this.disposed || !this.ready) throw new Error('Display is not ready for exit; reopen the Even Hub app');
        const accepted = await timeout(this.bridge.shutDownPageContainer(1), this.timeoutMs, 'Exit request timed out. Reopen the Even Hub app.');
        if (accepted !== true) throw new Error('System exit dialog rejected. Reopen the Even Hub app.');
      });
    } catch (error) { this.dispose(); throw error; }
    finally { this.exitPending = false; }
  }
  private setting<T>(operation: () => Promise<T>): Promise<T> {
    if (this.exitPending) return Promise.reject(new Error('System exit is pending; phone settings cannot change'));
    return this.serialize(async () => {
      if (this.disposed) throw new Error('Adapter closed; reopen the Even Hub app');
      try { return await operation(); }
      catch (error) {
        // Storage calls also cannot be cancelled. Do not overlap a timed-out SDK call.
        this.dispose();
        this.failure(error instanceof Error ? error : new Error('Phone settings failed'));
        throw error;
      }
    });
  }
  readSetting(key: string) {
    return this.setting(() => timeout(this.bridge.getLocalStorage(key), this.timeoutMs, 'Could not restore phone settings. Reopen the Even Hub app.'));
  }
  writeSetting(key: string, value: string) {
    return this.setting(async () => {
      const accepted = await timeout(this.bridge.setLocalStorage(key, value), this.timeoutMs, 'Could not save phone settings. Reopen the Even Hub app.');
      if (accepted !== true) throw new Error('Phone settings were not saved');
    });
  }
  render(frame: DisplayFrame): Promise<Receipt> {
    return this.serialize(() => this.renderFrame(frame));
  }
  private async renderFrame(frame: DisplayFrame): Promise<Receipt> {
    if (this.disposed) throw new Error('Adapter closed; reopen the Even Hub app');
    // One compact text container stays comfortably below startup's 1000-character limit.
    if (frame.text.length > 900) throw new Error('Display frame exceeds safe text budget');
    const content = frame.text || ' ';
    try {
      const split = frame.layout === 'split' && frame.artifact !== null;
      const shape = split ? 'split' : 'answer';
      const structure = {
        containerTotalNum: split ? 3 : 1,
        textObject: [new TextContainerProperty({ ...CONTAINER, xPosition: 0, yPosition: 0,
          width: split ? 288 : 576, height: 288, borderWidth: 0, paddingLength: 6, isEventCapture: 1, content })],
        imageObject: split ? [0, 1].map(index => new ImageContainerProperty({
          containerID: 2 + index, containerName: `artifact-${index}`, xPosition: 288,
          yPosition: index * 144, width: 288, height: 144,
        })) : [],
      };
      if (!this.ready || this.layout !== shape) {
        if (!this.ready) {
          const result = await timeout(this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(structure)), this.timeoutMs, 'Page creation timed out. Reopen the Even Hub app.');
          if (result !== StartUpPageCreateResult.success) throw new Error(`Page creation rejected (${result}). Reopen the Even Hub app.`);
        } else {
          const accepted = await timeout(this.bridge.rebuildPageContainer(new RebuildPageContainer(structure)), this.timeoutMs, 'Layout update timed out. Reopen the Even Hub app.');
          if (accepted !== true) throw new Error('Layout update rejected. Reopen the Even Hub app.');
        }
        this.ready = true;
        this.layout = shape; this.previousText = content; this.previousTileSignature = '';
      } else if (content !== this.previousText) {
        // Retain source incremental semantics: append a growing answer, pad a shrinking one.
        const append = content.startsWith(this.previousText) && content.length > this.previousText.length;
        const next = append ? content.slice(this.previousText.length) : content.padEnd(Math.max(content.length, this.previousText.length), ' ');
        const accepted = await timeout(this.bridge.textContainerUpgrade(new TextContainerUpgrade({
          ...CONTAINER, contentOffset: append ? this.previousText.length : 0, contentLength: next.length, content: next,
        })), this.timeoutMs, 'Text update timed out. Reopen the Even Hub app before retrying.');
        if (accepted !== true) throw new Error('Text update rejected. Reopen the Even Hub app.');
        this.previousText = content;
      }
      const signature = frame.artifact ? JSON.stringify([frame.artifact.template, frame.artifact.data, frame.scroll]) : '';
      if (split && signature !== this.previousTileSignature) {
        const tiles = await timeout(this.tiles(frame), this.timeoutMs, 'Artifact encoding timed out');
        if (tiles.length !== 2) throw new Error('Expected two artifact tiles');
        for (let index = 0; index < 2; index++) {
          const result = await timeout(this.bridge.updateImageRawData(new ImageRawDataUpdate({
            containerID: index + 2, containerName: `artifact-${index}`, imageData: tiles[index]!,
          })), this.timeoutMs, 'Image update timed out. Reopen the Even Hub app.');
          if (!ImageRawDataUpdateResult.isSuccess(ImageRawDataUpdateResult.normalize(result))) {
            throw new Error(`Image tile ${index + 1} rejected. Reopen the Even Hub app.`);
          }
        }
        this.previousTileSignature = signature;
      }
      return { sessionId: frame.sessionId, status: 'bridge-accepted', revision: frame.revision };
    } catch (error) {
      // SDK promises cannot be cancelled. Fail closed, so a timed-out write is not overlapped.
      this.dispose(); throw error;
    }
  }
  dispose() { if (!this.disposed) this.unsubscribe(); this.disposed = true; }
}
export async function connectEven(onInput: (type: InputType) => void, diagnostic: (message: string) => void, failure: (error: Error) => void = () => {}) {
  const bridge = await timeout(waitForEvenAppBridge(), 5000, 'Even Hub bridge not found. Open this app inside Even Hub or use Preview.');
  return new EvenAdapter(bridge, onInput, diagnostic, 8000, encodeTiles, failure);
}

import {
  CreateStartUpPageContainer, RebuildPageContainer, TextContainerProperty, TextContainerUpgrade,
  StartUpPageCreateResult, OsEventTypeList, waitForEvenAppBridge,
  type EvenAppBridge, type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';
import type { DisplayFrame } from '../core/contracts.js';
import { G2_TEXT, textWidth } from '../core/text.js';
import type { DisplayAdapter, InputType, Receipt } from './adapter.js';

/** Keep this adapter independent of the harness canvas renderer and bundled artwork. */
export const SOCIAL_INPUT = { containerID: 1, containerName: 'social-input' } as const;
export const SOCIAL_TEXT = { containerID: 2, containerName: 'social-text' } as const;
export type SocialBridge = Pick<EvenAppBridge,
  'createStartUpPageContainer' | 'rebuildPageContainer' | 'textContainerUpgrade' |
  'onEvenHubEvent' | 'shutDownPageContainer'>;
/** Design prototype gestures only: this adapter never opens or receives microphone audio. */
export interface SocialVoiceHandlers { press(): void; release(): void }

function timeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

function eventType(event: EvenHubEvent): OsEventTypeList | null {
  if (event.audioEvent) return null;
  const payload = event.textEvent ?? event.sysEvent;
  if (!payload) return null;
  if (event.textEvent?.containerID !== undefined && event.textEvent.containerID !== SOCIAL_INPUT.containerID) return null;
  if (event.textEvent?.containerName !== undefined && event.textEvent.containerName !== SOCIAL_INPUT.containerName) return null;
  // Protobuf may omit the zero-valued CLICK_EVENT, but only a real input envelope can be a tap.
  return payload.eventType ?? OsEventTypeList.CLICK_EVENT;
}

function validateFrame(frame: DisplayFrame): void {
  if (frame.layout !== 'answer' || frame.artifact !== null) throw new Error('Social display accepts only full-width native text');
  if (frame.text.length > 900) throw new Error('Social display exceeds the 900-character text budget');
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/u.test(frame.text)) throw new Error('Social display text contains unsupported control characters');
  const rows = frame.text.split('\n');
  if (rows.length > G2_TEXT.maxLines) throw new Error('Social display exceeds the ten-line text budget');
  if (rows.some(row => textWidth(row) > G2_TEXT.fullWidth)) throw new Error('Social display exceeds the 530-pixel line budget');
}

export class SocialAdapter implements DisplayAdapter {
  readonly mode = 'even';
  private ready = false;
  private previousText = '';
  private disposed = false;
  private exitPending = false;
  private operation: Promise<unknown> = Promise.resolve();
  private unsubscribe: () => void;

  constructor(private bridge: SocialBridge, onInput: (type: InputType) => void,
    onVoice: SocialVoiceHandlers, private failure: (error: Error) => void = () => {}, private timeoutMs = 8000) {
    this.unsubscribe = bridge.onEvenHubEvent(event => {
      if (this.disposed || this.exitPending) return;
      switch (eventType(event)) {
        case OsEventTypeList.CLICK_EVENT: onInput('select'); break;
        case OsEventTypeList.SCROLL_TOP_EVENT: onInput('previous'); break;
        case OsEventTypeList.SCROLL_BOTTOM_EVENT: onInput('next'); break;
        case OsEventTypeList.LONG_PRESS_EVENT: onVoice.press(); break;
        case OsEventTypeList.LONG_PRESS_RELEASE_EVENT: onVoice.release(); break;
        // Back is a selectable application action. Double tap remains the host-owned exit dialog.
        case OsEventTypeList.DOUBLE_CLICK_EVENT:
          void this.requestSystemExit().catch(error => this.failure(error instanceof Error ? error : new Error('System exit failed')));
          break;
      }
    });
  }

  private ensureOpen(): void {
    if (this.disposed) throw new Error('Social adapter closed; reopen the Even Hub app');
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation);
    this.operation = next.catch(() => {});
    return next;
  }

  /** SDK acceptance requests the system dialog; it does not prove the host has closed the app. */
  async requestSystemExit(): Promise<void> {
    if (this.exitPending) return;
    this.exitPending = true;
    try {
      await this.serialize(async () => {
        try {
          this.ensureOpen();
          if (!this.ready) throw new Error('Social display is not ready for exit; reopen the Even Hub app');
          const accepted = await timeout(this.bridge.shutDownPageContainer(1), this.timeoutMs,
            'System exit timed out. Reopen the Even Hub app.');
          this.ensureOpen();
          if (accepted !== true) throw new Error('System exit rejected. Reopen the Even Hub app.');
        } catch (error) {
          // Close inside the serialized operation, before a queued frame can follow a failed exit.
          this.dispose(); throw error;
        }
      });
    } catch (error) { this.dispose(); throw error; }
    finally { this.exitPending = false; }
  }

  render(frame: DisplayFrame): Promise<Receipt> {
    // A phone action can arrive while the host handles exit. Queue it behind that SDK call;
    // successful dialog acceptance is not proof the WebView closed, and cancelling must remain usable.
    return this.serialize(async () => {
      this.ensureOpen();
      try {
        validateFrame(frame);
        const content = frame.text || ' ';
        const structure = {
          containerTotalNum: 2,
          textObject: [
            // This blank, sole capture container prevents text scroll bounce from swallowing gestures.
            new TextContainerProperty({ ...SOCIAL_INPUT, xPosition: 0, yPosition: 0, width: 576, height: 288,
              borderWidth: 0, paddingLength: 0, isEventCapture: 1, content: ' ' }),
            new TextContainerProperty({ ...SOCIAL_TEXT, xPosition: 0, yPosition: 0, width: 576, height: 288,
              borderWidth: 0, paddingLength: 6, isEventCapture: 0, content }),
          ],
          imageObject: [],
        };
        if (!this.ready) {
          const result = await timeout(this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(structure)),
            this.timeoutMs, 'Social page creation timed out. Reopen the Even Hub app.');
          this.ensureOpen();
          if (result !== StartUpPageCreateResult.success) throw new Error(`Social page creation rejected (${result}). Reopen the Even Hub app.`);
          this.ready = true;
        } else if (content !== this.previousText) {
          if (content.length >= this.previousText.length) {
            const accepted = await timeout(this.bridge.textContainerUpgrade(new TextContainerUpgrade({ ...SOCIAL_TEXT,
              contentOffset: 0, contentLength: content.length, content })), this.timeoutMs,
            'Social text update timed out. Reopen the Even Hub app.');
            this.ensureOpen();
            if (accepted !== true) throw new Error('Social text update rejected. Reopen the Even Hub app.');
          } else {
            // Rebuilding clears an old tail without space padding, which can wrap into hidden lines.
            const accepted = await timeout(this.bridge.rebuildPageContainer(new RebuildPageContainer(structure)),
              this.timeoutMs, 'Social page rebuild timed out. Reopen the Even Hub app.');
            this.ensureOpen();
            if (accepted !== true) throw new Error('Social page rebuild rejected. Reopen the Even Hub app.');
          }
        }
        this.previousText = content;
        return { sessionId: frame.sessionId, revision: frame.revision, status: 'bridge-accepted' };
      } catch (error) {
        // SDK calls cannot be cancelled. A failure closes the adapter before any queued call can start.
        this.dispose(); throw error;
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
  }
}

/** Call only from the installed app or an explicit preview Connect action. No retries or recovery. */
export async function connectSocialDevice(onInput: (type: InputType) => void, onVoice: SocialVoiceHandlers,
  failure: (error: Error) => void = () => {}): Promise<SocialAdapter> {
  const bridge = await timeout(waitForEvenAppBridge(), 5000,
    'Even Hub bridge not found. Open the installed app in Even Hub or use Preview.');
  return new SocialAdapter(bridge, onInput, onVoice, failure);
}

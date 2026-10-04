import type { DisplayFrame, DisplayInput } from '../core/contracts.js';

export type InputType = DisplayInput['type'];
export type Receipt = { sessionId: string; status: 'browser-rendered' | 'bridge-accepted'; revision: number };
export interface DisplayAdapter {
  readonly mode: 'preview' | 'even';
  render(frame: DisplayFrame): Promise<Receipt>;
  dispose(): void;
}
export class PreviewAdapter implements DisplayAdapter {
  readonly mode = 'preview';
  constructor(private paint: (frame: DisplayFrame) => void | Promise<void>) {}
  async render(frame: DisplayFrame): Promise<Receipt> {
    await this.paint(frame); return { sessionId: frame.sessionId, status: 'browser-rendered', revision: frame.revision };
  }
  dispose() {}
}

// Serial, latest-state-wins drain. A slow render cannot overtake a newer one.
export class RenderQueue {
  private pending?: DisplayFrame;
  private running = false;
  private stopped = false;
  constructor(private adapter: DisplayAdapter, private receipt: (value: Receipt) => void, private failure: (error: Error, revision: number) => void) {}
  submit(frame: DisplayFrame) {
    if (this.stopped) return;
    this.pending = frame;
    if (!this.running) void this.drain();
  }
  private async drain() {
    this.running = true;
    while (this.pending && !this.stopped) {
      const frame = this.pending; this.pending = undefined;
      try { const receipt = await this.adapter.render(frame); if (!this.stopped) this.receipt(receipt); }
      catch (error) {
        this.stopped = true;
        this.failure(error instanceof Error ? error : new Error('Adapter failed'), frame.revision);
      }
    }
    this.running = false;
  }
  dispose() { this.stopped = true; this.pending = undefined; this.adapter.dispose(); }
}

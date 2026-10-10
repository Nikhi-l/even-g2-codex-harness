/** Completion-paced playback: never schedule a second frame while the first is in flight. */
export class MotionPlayer {
  private timer?: ReturnType<typeof setTimeout>;
  private active = false;
  private busy = false;
  private failed = false;
  constructor(private frame: () => Promise<void>, private onError: (error: unknown) => void, private interval = 1000) {}
  get playing() { return this.active; }
  play() {
    if (this.failed || this.active) return;
    this.active = true;
    if (!this.busy) void this.tick();
  }
  pause() { this.active = false; clearTimeout(this.timer); }
  async step() {
    this.pause();
    if (!this.busy && !this.failed) await this.tick();
  }
  private async tick() {
    this.busy = true;
    try { await this.frame(); }
    catch (error) { this.failed = true; this.pause(); this.onError(error); }
    finally {
      this.busy = false;
      if (this.active) this.timer = setTimeout(() => void this.tick(), Math.max(1000, this.interval));
    }
  }
}

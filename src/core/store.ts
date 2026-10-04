import { artifactSchema, deliverySchema, inputSchema, layoutSchema, type Artifact, type Delivery, type HarnessEvent, type Snapshot } from './contracts.js';
import { maxScroll, render } from './render.js';

export class ConflictError extends Error {}
export class StateStore {
  private artifacts = new Map<string, Artifact>();
  private activeId: string | null = null;
  private revision = 0;
  private cursor = 0;
  private answerPage = 0;
  private layout: 'split' | 'answer' = 'split';
  private sequence = 0;
  private journal: HarnessEvent[] = [];
  private seenInputs = new Set<string>();
  private deliveries: Delivery[] = [];
  constructor(private now = Date.now, readonly sessionId = globalThis.crypto.randomUUID()) {}

  private change(type: string, increment = true) {
    if (increment) { this.revision++; this.deliveries = []; }
    this.journal.push({ sequence: ++this.sequence, at: this.now(), type, artifactId: this.activeId, revision: this.revision });
    if (this.journal.length > 100) this.journal.shift();
  }
  private expect(revision?: number) {
    if (revision !== undefined && revision !== this.revision) throw new ConflictError('State changed; read display_status and retry');
  }
  expire() {
    let changed = false;
    for (const [id, artifact] of this.artifacts) {
      if (artifact.expiresAt <= this.now()) {
        this.artifacts.delete(id); changed = true;
        if (this.activeId === id) { this.activeId = null; this.cursor = 0; }
      }
    }
    if (changed) this.change('expired');
  }
  snapshot(): Snapshot {
    this.expire();
    return structuredClone({
      sessionId: this.sessionId, revision: this.revision, activeId: this.activeId,
      artifacts: [...this.artifacts.values()],
      frame: render(this.activeId ? this.artifacts.get(this.activeId) : undefined, this.cursor, this.answerPage, this.layout, this.revision, this.sessionId),
      deliveries: this.deliveries, latestEventSequence: this.sequence,
    });
  }
  upsert(raw: unknown, expectedRevision?: number) {
    this.expire(); this.expect(expectedRevision);
    const parsed = artifactSchema.parse(raw);
    if (!this.artifacts.has(parsed.id) && this.artifacts.size >= 20) throw new ConflictError('Artifact limit reached; delete an artifact first');
    const artifact: Artifact = { ...parsed, version: (this.artifacts.get(parsed.id)?.version ?? 0) + 1, expiresAt: this.now() + parsed.ttlSeconds * 1000 };
    this.artifacts.set(artifact.id, artifact); this.activeId = artifact.id; this.cursor = 0; this.answerPage = 0; this.layout = 'split';
    this.change('published'); return this.snapshot();
  }
  select(id: string, expectedRevision?: number) {
    this.expire(); this.expect(expectedRevision);
    if (!this.artifacts.has(id)) throw new ConflictError('Artifact missing or expired');
    this.activeId = id; this.cursor = 0; this.answerPage = 0; this.layout = 'split'; this.change('selected'); return this.snapshot();
  }
  clear(expectedRevision?: number) {
    this.expire(); this.expect(expectedRevision);
    this.activeId = null; this.cursor = 0; this.change('cleared'); return this.snapshot();
  }
  remove(id: string, expectedRevision?: number) {
    this.expire(); this.expect(expectedRevision);
    if (!this.artifacts.delete(id)) throw new ConflictError('Artifact missing or expired');
    if (this.activeId === id) { this.activeId = null; this.cursor = 0; }
    this.change('deleted'); return this.snapshot();
  }
  input(raw: unknown) {
    this.expire(); const input = inputSchema.parse(raw);
    if (this.seenInputs.has(input.eventId)) return this.snapshot();
    if (input.sessionId !== this.sessionId) throw new ConflictError('Server session changed; refresh state');
    this.expect(input.revision);
    this.seenInputs.add(input.eventId);
    if (this.seenInputs.size > 256) this.seenInputs.delete(this.seenInputs.values().next().value!);
    const artifact = this.activeId ? this.artifacts.get(this.activeId) : undefined;
    if (!artifact) return this.snapshot();
    if (input.type === 'back') return this.setLayout('answer');
    if (input.type === 'select') return this.setLayout(this.layout === 'split' ? 'answer' : 'split');
    if (input.type === 'next' || input.type === 'previous') {
      const direction = input.type === 'next' ? 1 : -1;
      if (this.layout === 'split') this.cursor = Math.min(Math.max(this.cursor + direction, 0), maxScroll(artifact));
      else this.answerPage = Math.min(Math.max(this.answerPage + direction, 0), this.snapshot().frame.pages - 1);
    }
    this.change(`input:${input.type}`); return this.snapshot();
  }
  setLayout(raw: unknown, expectedRevision?: number) {
    this.expire(); this.expect(expectedRevision);
    this.layout = layoutSchema.parse(raw); this.answerPage = 0;
    this.change(`layout:${this.layout}`); return this.snapshot();
  }
  acknowledge(raw: unknown) {
    this.expire(); const receipt = deliverySchema.parse(raw);
    if (receipt.sessionId !== this.sessionId) throw new ConflictError('Server session changed; refresh state');
    this.expect(receipt.revision);
    this.deliveries = this.deliveries.filter(value => value.clientId !== receipt.clientId);
    this.deliveries.push({ ...receipt, at: this.now() });
    if (this.deliveries.length > 8) this.deliveries.shift();
    return this.snapshot();
  }
  events(after = 0) {
    this.expire();
    return { events: structuredClone(this.journal.filter(event => event.sequence > after)), cursor: this.sequence,
      truncated: this.journal.length > 0 && after < this.journal[0]!.sequence - 1 };
  }
}

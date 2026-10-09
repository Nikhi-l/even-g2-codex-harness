import { artifactSchema, deliverySchema, inputSchema, layoutSchema, type Artifact, type Delivery, type DisplayInput, type HarnessEvent, type Snapshot } from './contracts.js';
import { navigate, render } from './render.js';
import { newId } from './id.js';

export class ConflictError extends Error {}
export class StateStore {
  private artifacts = new Map<string, Artifact>();
  private activeId: string | null = null;
  private revision = 0;
  private cursor = 0;
  private answerPage = 0;
  private layout: 'split' | 'answer' = 'split';
  private chosen: number | null = null;
  private sequence = 0;
  private journal: HarnessEvent[] = [];
  private seenInputs = new Set<string>();
  private deliveries: Delivery[] = [];
  constructor(private now = Date.now, readonly sessionId = newId()) {}

  private change(type: string, increment = true, inputType?: DisplayInput['type'], choice?: number) {
    if (increment) { this.revision++; this.deliveries = []; }
    const version = choice === undefined ? undefined : this.artifacts.get(this.activeId ?? '')?.version;
    this.journal.push({ sequence: ++this.sequence, at: this.now(), type, artifactId: this.activeId, revision: this.revision,
      ...(inputType ? { inputType } : {}), ...(choice === undefined ? {} : { choice, artifactVersion: version }) });
    if (this.journal.length > 100) this.journal.shift();
  }
  private expect(revision?: number, sessionId?: string) {
    if (sessionId !== undefined && sessionId !== this.sessionId) throw new ConflictError('Server session changed; refresh state');
    if (revision !== undefined && revision !== this.revision) throw new ConflictError('State changed; read display_status and retry');
  }
  expire() {
    let changed = false;
    for (const [id, artifact] of this.artifacts) {
      if (artifact.expiresAt <= this.now()) {
        this.artifacts.delete(id); changed = true;
        if (this.activeId === id) { this.activeId = null; this.cursor = 0; this.chosen = null; }
      }
    }
    if (changed) this.change('expired');
  }
  snapshot(): Snapshot {
    this.expire();
    return structuredClone({
      sessionId: this.sessionId, revision: this.revision, activeId: this.activeId,
      artifacts: [...this.artifacts.values()],
      frame: render(this.activeId ? this.artifacts.get(this.activeId) : undefined, this.cursor, this.answerPage, this.layout, this.revision, this.sessionId, this.chosen),
      deliveries: this.deliveries, latestEventSequence: this.sequence,
    });
  }
  upsert(raw: unknown, expectedRevision?: number, expectedSessionId?: string) {
    this.expire(); this.expect(expectedRevision, expectedSessionId);
    const parsed = artifactSchema.parse(raw);
    if (!this.artifacts.has(parsed.id) && this.artifacts.size >= 20) throw new ConflictError('Artifact limit reached; delete an artifact first');
    const artifact: Artifact = { ...parsed, version: (this.artifacts.get(parsed.id)?.version ?? 0) + 1, expiresAt: this.now() + parsed.ttlSeconds * 1000 };
    this.artifacts.set(artifact.id, artifact); this.activeId = artifact.id; this.cursor = 0; this.answerPage = 0; this.layout = 'split'; this.chosen = null;
    this.change('published'); return this.snapshot();
  }
  select(id: string, expectedRevision?: number, expectedSessionId?: string) {
    this.expire(); this.expect(expectedRevision, expectedSessionId);
    if (!this.artifacts.has(id)) throw new ConflictError('Artifact missing or expired');
    this.activeId = id; this.cursor = 0; this.answerPage = 0; this.layout = 'split'; this.chosen = null; this.change('selected'); return this.snapshot();
  }
  clear(expectedRevision?: number, expectedSessionId?: string) {
    this.expire(); this.expect(expectedRevision, expectedSessionId);
    this.activeId = null; this.cursor = 0; this.chosen = null; this.change('cleared'); return this.snapshot();
  }
  remove(id: string, expectedRevision?: number, expectedSessionId?: string) {
    this.expire(); this.expect(expectedRevision, expectedSessionId);
    if (!this.artifacts.delete(id)) throw new ConflictError('Artifact missing or expired');
    if (this.activeId === id) { this.activeId = null; this.cursor = 0; this.chosen = null; }
    this.change('deleted'); return this.snapshot();
  }
  input(raw: unknown) {
    this.expire(); const input = inputSchema.parse(raw);
    if (input.sessionId !== this.sessionId) throw new ConflictError('Server session changed; refresh state');
    if (this.seenInputs.has(input.eventId)) return this.snapshot();
    this.expect(input.revision);
    this.seenInputs.add(input.eventId);
    if (this.seenInputs.size > 256) this.seenInputs.delete(this.seenInputs.values().next().value!);
    const artifact = this.activeId ? this.artifacts.get(this.activeId) : undefined;
    if (!artifact) return this.snapshot();
    const { next, event, choice } = navigate(artifact, { layout: this.layout, scroll: this.cursor, answerPage: this.answerPage }, input.type);
    this.layout = next.layout; this.cursor = next.scroll; this.answerPage = next.answerPage;
    if (choice !== undefined) this.chosen = choice;
    this.change(event, true, input.type, choice); return this.snapshot();
  }
  setLayout(raw: unknown, expectedRevision?: number, expectedSessionId?: string) {
    this.expire(); this.expect(expectedRevision, expectedSessionId);
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
  events(after = 0, expectedSessionId?: string) {
    this.expire(); this.expect(undefined, expectedSessionId);
    return { sessionId: this.sessionId, events: structuredClone(this.journal.filter(event => event.sequence > after)), cursor: this.sequence,
      truncated: this.journal.length > 0 && after < this.journal[0]!.sequence - 1 };
  }
}

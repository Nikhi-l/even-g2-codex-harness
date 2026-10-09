import { artifactSchema, deliverySchema, inputSchema, layoutSchema, type Artifact, type Delivery, type HarnessEvent, type Snapshot } from '../../../src/core/contracts.js';
import { navigate, render } from '../../../src/core/render.js';

export class OperationError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
export interface State {
  sessionId: string; revision: number; activeId: string | null; artifacts: Artifact[];
  scroll: number; answerPage: number; layout: 'split' | 'answer';
  /** Chosen option on an active `choices` artifact. Absent in rows written before choices existed. */
  chosen?: number | null;
  sequence: number; journal: HarnessEvent[]; seenInputs: string[]; deliveries: Delivery[];
}
export const freshState = (): State => ({ sessionId: crypto.randomUUID(), revision: 0, activeId: null,
  artifacts: [], scroll: 0, answerPage: 0, layout: 'split', chosen: null, sequence: 0, journal: [], seenInputs: [], deliveries: [] });
function change(s: State, type: string, now: number, inputType?: HarnessEvent['inputType'], choice?: number) {
  s.revision++; s.deliveries = [];
  const version = choice === undefined ? undefined : s.artifacts.find(a => a.id === s.activeId)?.version;
  s.journal.push({ sequence: ++s.sequence, at: now, type, artifactId: s.activeId, revision: s.revision,
    ...(inputType ? { inputType } : {}), ...(choice === undefined ? {} : { choice, artifactVersion: version }) });
  s.journal = s.journal.slice(-100);
}
export function expire(s: State, now: number): boolean {
  const live = s.artifacts.filter(a => a.expiresAt > now);
  if (live.length === s.artifacts.length) return false;
  s.artifacts = live;
  if (!live.some(a => a.id === s.activeId)) { s.activeId = null; s.scroll = 0; s.answerPage = 0; s.chosen = null; }
  change(s, 'expired', now); return true;
}
export function snapshot(s: State): Snapshot {
  return structuredClone({ sessionId: s.sessionId, revision: s.revision, activeId: s.activeId,
    artifacts: s.artifacts, frame: render(s.artifacts.find(a => a.id === s.activeId), s.scroll, s.answerPage, s.layout, s.revision, s.sessionId, s.chosen ?? null),
    deliveries: s.deliveries, latestEventSequence: s.sequence });
}
function expect(s: State, revision: unknown, session: unknown) {
  if (session !== s.sessionId || revision !== s.revision) throw new OperationError('CONFLICT', 'State changed; read display_status and retry with its session and revision');
}
export function operate(s: State, name: string, args: Record<string, unknown>, now: number): unknown {
  if (name === 'display_status') return snapshot(s);
  if (name === 'display_events') {
    if (args.expectedSessionId !== s.sessionId) throw new OperationError('CONFLICT', 'Session changed; refresh status');
    const after = args.after as number;
    if (after > s.sequence) throw new OperationError('CONFLICT', 'Cursor is ahead of state; refresh status');
    return { sessionId: s.sessionId, events: s.journal.filter(e => e.sequence > after), cursor: s.sequence,
      truncated: s.journal.length > 0 && after < s.journal[0]!.sequence - 1 };
  }
  if (name === 'input') {
    const input = inputSchema.parse(args);
    if (input.sessionId !== s.sessionId) throw new OperationError('CONFLICT', 'Session changed; refresh status');
    if (s.seenInputs.includes(input.eventId)) return snapshot(s);
    expect(s, input.revision, input.sessionId);
    s.seenInputs.push(input.eventId); s.seenInputs = s.seenInputs.slice(-256);
    const artifact = s.artifacts.find(a => a.id === s.activeId);
    if (!artifact) return snapshot(s);
    const { next, event, choice } = navigate(artifact, { layout: s.layout, scroll: s.scroll, answerPage: s.answerPage }, input.type);
    s.layout = next.layout; s.scroll = next.scroll; s.answerPage = next.answerPage;
    if (choice !== undefined) s.chosen = choice;
    change(s, event, now, input.type, choice); return snapshot(s);
  }
  if (name === 'delivery') {
    const receipt = deliverySchema.parse(args); expect(s, receipt.revision, receipt.sessionId);
    s.deliveries = [...s.deliveries.filter(d => d.clientId !== receipt.clientId), { ...receipt, at: now }].slice(-8);
    return snapshot(s);
  }
  expect(s, args.expectedRevision, args.expectedSessionId);
  switch (name) {
    case 'show_artifact': {
      const a = artifactSchema.parse(args.artifact); const previous = s.artifacts.find(v => v.id === a.id);
      if (!previous && s.artifacts.length >= 20) throw new OperationError('LIMIT', 'Delete an artifact before adding another');
      s.artifacts = [...s.artifacts.filter(v => v.id !== a.id), { ...a, version: (previous?.version ?? 0) + 1, expiresAt: now + a.ttlSeconds * 1000 }];
      s.activeId = a.id; s.scroll = 0; s.answerPage = 0; s.layout = 'split'; s.chosen = null; change(s, 'published', now); break;
    }
    case 'display_select':
      if (!s.artifacts.some(a => a.id === args.id)) throw new OperationError('NOT_FOUND', 'Artifact missing or expired');
      s.activeId = args.id as string; s.scroll = 0; s.answerPage = 0; s.layout = 'split'; s.chosen = null; change(s, 'selected', now); break;
    case 'display_clear': s.activeId = null; s.scroll = 0; s.answerPage = 0; s.chosen = null; change(s, 'cleared', now); break;
    case 'display_delete':
      if (!s.artifacts.some(a => a.id === args.id)) throw new OperationError('NOT_FOUND', 'Artifact missing or expired');
      s.artifacts = s.artifacts.filter(a => a.id !== args.id);
      if (s.activeId === args.id) { s.activeId = null; s.scroll = 0; s.answerPage = 0; s.chosen = null; }
      change(s, 'deleted', now); break;
    case 'set_artifact_layout': s.layout = layoutSchema.parse(args.layout); s.answerPage = 0; change(s, `layout:${s.layout}`, now); break;
    default: throw new OperationError('UNKNOWN_TOOL', 'Unknown tool');
  }
  return snapshot(s);
}

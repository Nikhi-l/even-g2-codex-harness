import { z } from 'zod';
import { artifactSchema, idSchema, layoutSchema, type ArtifactInput } from '../core/contracts.js';

export interface McpCaller {
  callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<unknown>;
  listTools(): Promise<unknown>;
}
const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const storedArtifact = z.union(artifactSchema.options.map(schema => schema.extend({ version: counter, expiresAt: counter })));
const snapshotSchema = z.object({
  sessionId: z.string().uuid(), revision: counter, activeId: idSchema.nullable(),
  artifacts: z.array(storedArtifact).max(20),
  frame: z.object({ sessionId: z.string().uuid(), revision: counter, artifact: storedArtifact.nullable(),
    layout: layoutSchema, scroll: counter, text: z.string(), page: counter, pages: counter }),
  deliveries: z.array(z.object({ clientId: idSchema, sessionId: z.string().uuid(), revision: counter,
    status: z.enum(['browser-rendered', 'bridge-accepted', 'failed']), mode: z.enum(['preview', 'even']),
    detail: z.string().max(160).optional(), at: counter })).max(8),
  latestEventSequence: counter,
}).superRefine((state, ctx) => {
  if (state.frame.sessionId !== state.sessionId || state.frame.revision !== state.revision)
    ctx.addIssue({ code: 'custom', message: 'Inconsistent snapshot session/revision' });
  if (state.activeId !== (state.frame.artifact?.id ?? null)
    || (state.activeId !== null && !state.artifacts.some(artifact => artifact.id === state.activeId))
    || new Set(state.artifacts.map(artifact => artifact.id)).size !== state.artifacts.length)
    ctx.addIssue({ code: 'custom', message: 'Inconsistent active artifact' });
});
const eventsSchema = z.object({
  sessionId: z.string().uuid(), cursor: counter, truncated: z.boolean(),
  events: z.array(z.object({ sequence: counter, at: counter, type: z.string().max(80),
    artifactId: idSchema.nullable(), revision: counter }).passthrough()).max(100),
});
const resultSchema = z.object({ isError: z.boolean().optional(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).max(10) });
const toolListSchema = z.object({ tools: z.array(z.object({ name: z.string(), inputSchema: z.object({ properties: z.record(z.string(), z.unknown()).optional() }) })) });
const sessionGuardSchema = z.object({ expectedSessionId: z.object({ type: z.literal('string') }) });
const writeGuardsSchema = sessionGuardSchema.extend({ expectedRevision: z.object({ type: z.literal('integer') }) });
export type ControllerState = z.infer<typeof snapshotSchema>;
export type EventBatch = z.infer<typeof eventsSchema>;
export class ControllerError extends Error {}

/** Explicit display operations only. Reading a gesture never calls a model or a tool. */
export class ArtifactController {
  private state: ControllerState | undefined;
  private cursor = 0;
  private busy = false;
  constructor(private readonly client: McpCaller) {}

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw new ControllerError('Another controller operation is in progress');
    this.busy = true;
    try { return await operation(); } finally { this.busy = false; }
  }
  private async call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const result = resultSchema.parse(await this.client.callTool({ name, arguments: args }));
    if (result.isError) throw new ControllerError(`${name} failed; refresh state before retrying`);
    const content = result.content.filter(item => item.type === 'text');
    if (content.length !== 1 || !content[0]?.text) throw new ControllerError(`Invalid ${name} response`);
    return JSON.parse(content[0].text) as unknown;
  }
  private requireState() {
    if (!this.state) throw new ControllerError('Read fresh state before a display operation');
    return this.state;
  }
  /** Explicitly adopt current state after a conflict or relay restart. No write is retried. */
  refresh(): Promise<ControllerState> {
    return this.exclusive(async () => {
      try {
        const tools = toolListSchema.parse(await this.client.listTools()).tools;
        const mutations = ['show_artifact', 'display_clear', 'display_select', 'display_delete', 'set_artifact_layout'];
        if (mutations.some(name => !writeGuardsSchema.safeParse(tools.find(tool => tool.name === name)?.inputSchema.properties).success)
          || !sessionGuardSchema.safeParse(tools.find(tool => tool.name === 'display_events')?.inputSchema.properties).success)
          throw new ControllerError('Controller requires the session-guarded harness update; upgrade the relay and MCP process together');
        const next = snapshotSchema.parse(await this.call('display_status'));
        if (!this.state || this.state.sessionId !== next.sessionId) this.cursor = next.latestEventSequence;
        this.state = next;
        return structuredClone(next);
      } catch (error) { this.state = undefined; throw error; }
    });
  }
  private mutate(name: string, args: Record<string, unknown>): Promise<ControllerState> {
    return this.exclusive(async () => {
      const prior = this.requireState();
      try {
        const next = snapshotSchema.parse(await this.call(name, { ...args, expectedSessionId: prior.sessionId, expectedRevision: prior.revision }));
        if (next.sessionId !== prior.sessionId || next.revision <= prior.revision) throw new ControllerError('Unexpected mutation session/revision');
        this.state = next;
        return structuredClone(next);
      } catch (error) { this.state = undefined; throw error; }
    });
  }
  publish(artifact: ArtifactInput) { return this.mutate('show_artifact', { artifact: artifactSchema.parse(artifact) }); }
  select(id: string) { return this.mutate('display_select', { id: idSchema.parse(id) }); }
  clear() { return this.mutate('display_clear', {}); }
  delete(id: string) { return this.mutate('display_delete', { id: idSchema.parse(id) }); }
  setLayout(layout: 'split' | 'answer') { return this.mutate('set_artifact_layout', { layout: layoutSchema.parse(layout) }); }

  observe(): Promise<{ batch: EventBatch; state: ControllerState; resynced: boolean }> {
    return this.exclusive(async () => {
      const prior = this.requireState();
      try {
        const batch = eventsSchema.parse(await this.call('display_events', { after: this.cursor, expectedSessionId: prior.sessionId }));
        if (batch.sessionId !== prior.sessionId || batch.cursor < this.cursor) throw new ControllerError('Event session/cursor changed; refresh state');
        let previous = this.cursor;
        for (const [index, event] of batch.events.entries()) {
          if (event.sequence <= previous || event.sequence > batch.cursor
            || ((!batch.truncated || index > 0) && event.sequence !== previous + 1)) throw new ControllerError('Invalid event sequence');
          previous = event.sequence;
        }
        if (previous !== batch.cursor) throw new ControllerError('Missing events; refresh state');
        let next = prior;
        if (batch.truncated || batch.events.length) {
          next = snapshotSchema.parse(await this.call('display_status'));
          if (next.sessionId !== prior.sessionId || next.revision < prior.revision || next.latestEventSequence < batch.cursor) throw new ControllerError('Event snapshot changed; refresh state');
        }
        this.state = next;
        this.cursor = batch.cursor;
        return { batch: structuredClone(batch), state: structuredClone(next), resynced: batch.truncated };
      } catch (error) { this.state = undefined; throw error; }
    });
  }
}

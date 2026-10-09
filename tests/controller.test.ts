import { describe, expect, it } from 'vitest';
import { ArtifactController, type McpCaller } from '../src/controller/controller.js';
import { StateStore } from '../src/core/store.js';
import { examples } from '../src/core/examples.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { artifactSchema, idSchema, layoutSchema } from '../src/core/contracts.js';

const encode = (value: unknown, isError = false) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], isError });
/** Guarded contract fixture; integration tests separately cover the real MCP server. */
class GuardedCaller implements McpCaller {
  store = new StateStore();
  calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  response: ((name: string, value: unknown) => unknown) | undefined;
  async listTools() {
    return { tools: ['show_artifact', 'display_clear', 'display_select', 'display_delete', 'set_artifact_layout', 'display_events']
      .map(name => ({ name, inputSchema: { properties: { expectedSessionId: { type: 'string' }, ...(name === 'display_events' ? {} : { expectedRevision: { type: 'integer' } }) } } })) };
  }
  async callTool(request: { name: string; arguments: Record<string, unknown> }): Promise<unknown> {
    this.calls.push(structuredClone(request));
    const { name, arguments: args } = request;
    try {
      if (name !== 'display_status' && args.expectedSessionId !== this.store.sessionId) throw new Error('Session changed');
      let result: unknown;
      switch (name) {
        case 'display_status': result = this.store.snapshot(); break;
        case 'display_events': result = { ...this.store.events(args.after as number), sessionId: this.store.sessionId }; break;
        case 'show_artifact': result = this.store.upsert(args.artifact, args.expectedRevision as number); break;
        case 'display_clear': result = this.store.clear(args.expectedRevision as number); break;
        case 'display_select': result = this.store.select(args.id as string, args.expectedRevision as number); break;
        case 'display_delete': result = this.store.remove(args.id as string, args.expectedRevision as number); break;
        case 'set_artifact_layout': result = this.store.setLayout(args.layout, args.expectedRevision as number); break;
        default: throw new Error('Unsupported tool');
      }
      return this.response ? this.response(name, result) : encode(result);
    } catch { return encode({ error: 'Conflict or fixture failure' }, true); }
  }
}
const setup = () => { const caller = new GuardedCaller(); return { caller, controller: new ArtifactController(caller) }; };
describe('explicit artifact controller', () => {
  it('runs the walkthrough over the real MCP SDK with a guarded contract fixture', async () => {
    const caller = new GuardedCaller(); const server = new McpServer({ name: 'guarded-fixture', version: '1' });
    const session = z.string().uuid(); const revision = z.number().int().nonnegative();
    const guards = { expectedSessionId: session, expectedRevision: revision };
    const response = z.object({ content: z.array(z.object({ type: z.literal('text'), text: z.string() })), isError: z.boolean() });
    const tools = {
      display_status: {}, display_events: { expectedSessionId: session, after: revision },
      show_artifact: { ...guards, artifact: artifactSchema }, display_clear: guards,
      display_select: { ...guards, id: idSchema }, display_delete: { ...guards, id: idSchema },
      set_artifact_layout: { ...guards, layout: layoutSchema },
    };
    for (const [name, inputSchema] of Object.entries(tools)) server.registerTool(name, { inputSchema },
      async (args: Record<string, unknown>) => response.parse(await caller.callTool({ name, arguments: args })));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'controller-fixture-client', version: '1' });
    try {
      await server.connect(serverTransport); await client.connect(clientTransport);
      const controller = new ArtifactController(client); await controller.refresh();
      await controller.publish(examples[0]!); await controller.publish({ ...examples[0]!, answer: 'Replace' });
      expect((await controller.observe()).batch.events).toHaveLength(2);
      await controller.clear(); await controller.select(examples[0]!.id);
      expect((await controller.delete(examples[0]!.id)).artifacts).toEqual([]);
    } finally { await client.close(); await server.close(); }
  });
  it('refuses an older unguarded MCP server before reading or mutating state', async () => {
    const caller = new GuardedCaller();
    const controller = new ArtifactController({ listTools: async () => ({ tools: [] }), callTool: request => caller.callTool(request) });
    await expect(controller.refresh()).rejects.toThrow('session-guarded');
    await expect(controller.clear()).rejects.toThrow('fresh state'); expect(caller.calls).toHaveLength(0);
  });
  it('requires a trusted snapshot before mutations and observation', async () => {
    const { caller, controller } = setup();
    await expect(controller.publish(examples[0]!)).rejects.toThrow('fresh state');
    await expect(controller.observe()).rejects.toThrow('fresh state'); expect(caller.calls).toHaveLength(0);
  });
  it('publishes, replaces, observes, clears, selects, changes layout and deletes with both guards', async () => {
    const { caller, controller } = setup(); const initial = await controller.refresh();
    expect((await controller.publish(examples[0]!)).artifacts[0]?.version).toBe(1);
    expect((await controller.publish({ ...examples[0]!, answer: 'Updated' })).artifacts[0]?.version).toBe(2);
    const observed = await controller.observe(); expect(observed.batch.events.map(event => event.type)).toEqual(['published', 'published']);
    const cleared = await controller.clear(); expect(cleared.activeId).toBeNull(); expect(cleared.artifacts).toHaveLength(1);
    expect((await controller.select(examples[0]!.id)).activeId).toBe(examples[0]!.id);
    expect((await controller.setLayout('answer')).frame.layout).toBe('answer');
    expect((await controller.delete(examples[0]!.id)).artifacts).toEqual([]);
    const mutations = caller.calls.filter(call => !['display_status', 'display_events'].includes(call.name));
    expect(mutations.map(call => call.arguments.expectedRevision)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(mutations.every(call => call.arguments.expectedSessionId === initial.sessionId)).toBe(true);
  });
  it('observes original input metadata without triggering another operation', async () => {
    const { caller, controller } = setup(); await controller.refresh(); const state = await controller.publish(examples[0]!);
    await controller.observe();
    const input = { type: 'select', eventId: 'synthetic-tap', sessionId: state.sessionId, revision: state.revision };
    caller.store.input(input);
    caller.response = (name, value) => name === 'display_events'
      ? encode({ ...(value as object), events: caller.store.events(1).events.map(event => ({ ...event, input })) }) : encode(value);
    const before = caller.calls.length; const result = await controller.observe();
    expect(result.batch.events[0]?.input).toEqual(input);
    expect(caller.calls.slice(before).map(call => call.name)).toEqual(['display_events', 'display_status']);
    expect(result.state.frame.layout).toBe('answer');
    caller.response = undefined;
    expect((await controller.observe()).batch.events).toEqual([]);
    expect(caller.calls.at(-1)?.arguments.after).toBe(2);
  });
  it('never automatically retries a stale revision and requires explicit refresh', async () => {
    const { caller, controller } = setup(); await controller.refresh(); caller.store.upsert(examples[1]!);
    const before = caller.calls.length;
    await expect(controller.publish(examples[0]!)).rejects.toThrow('refresh');
    await expect(controller.clear()).rejects.toThrow('fresh state'); expect(caller.calls).toHaveLength(before + 1);
    expect(caller.store.snapshot().activeId).toBe(examples[1]!.id);
    await controller.refresh(); expect((await controller.publish(examples[0]!)).revision).toBe(2);
  });
  it('rejects a restart with a coincidentally equal revision', async () => {
    const { caller, controller } = setup(); const state = await controller.refresh(); caller.store = new StateStore();
    expect(caller.store.snapshot().revision).toBe(state.revision);
    await expect(controller.clear()).rejects.toThrow('refresh'); expect(caller.store.snapshot().revision).toBe(0);
    await expect(controller.observe()).rejects.toThrow('fresh state');
    expect((await controller.refresh()).sessionId).not.toBe(state.sessionId);
    expect((await controller.clear()).revision).toBe(1);
  });
  it('rejects event sessions/cursors that move backwards', async () => {
    const { caller, controller } = setup(); await controller.refresh(); await controller.publish(examples[0]!); await controller.observe();
    caller.response = (name, value) => name === 'display_events' ? encode({ ...(value as object), cursor: 0, events: [] }) : encode(value);
    await expect(controller.observe()).rejects.toThrow('cursor changed'); await expect(controller.clear()).rejects.toThrow('fresh state');
  });
  it('reports journal truncation, refreshes status and keeps subsequent events', async () => {
    const { caller, controller } = setup(); await controller.refresh();
    for (let i = 0; i < 101; i++) caller.store.upsert(examples[0]!);
    const observed = await controller.observe(); expect(observed.resynced).toBe(true); expect(observed.batch.events).toHaveLength(100);
    expect(observed.state.revision).toBe(101);
    await controller.clear(); expect((await controller.observe()).batch.events.map(event => event.type)).toEqual(['cleared']);
  });
  it('rejects repeated or out-of-order event sequences', async () => {
    const { caller, controller } = setup(); await controller.refresh(); caller.store.upsert(examples[0]!);
    caller.response = (name, value) => name === 'display_events'
      ? encode({ ...(value as object), events: [caller.store.events().events[0], caller.store.events().events[0]] }) : encode(value);
    await expect(controller.observe()).rejects.toThrow('event sequence');
  });
  it('does not silently skip an event when an untruncated journal has a gap', async () => {
    const { caller, controller } = setup(); await controller.refresh(); caller.store.upsert(examples[0]!); caller.store.clear();
    caller.response = (name, value) => name === 'display_events'
      ? encode({ ...(value as object), events: caller.store.events().events.slice(1) }) : encode(value);
    await expect(controller.observe()).rejects.toThrow('event sequence');
  });
  it('rejects a cursor advance with no returned events', async () => {
    const { caller, controller } = setup(); await controller.refresh(); caller.store.upsert(examples[0]!);
    caller.response = (name, value) => name === 'display_events' ? encode({ ...(value as object), events: [] }) : encode(value);
    await expect(controller.observe()).rejects.toThrow('Missing events');
  });
  it('does not retry when a write succeeded but its reply was lost', async () => {
    const { caller, controller } = setup(); await controller.refresh();
    caller.response = () => ({ content: [{ type: 'text', text: '{broken' }] });
    await expect(controller.publish(examples[0]!)).rejects.toThrow();
    await expect(controller.publish(examples[0]!)).rejects.toThrow('fresh state'); expect(caller.store.snapshot().artifacts[0]?.version).toBe(1);
    caller.response = undefined; expect((await controller.refresh()).artifacts[0]?.version).toBe(1);
  });
  it('rejects overlapping calls and copies returned state', async () => {
    const caller = new GuardedCaller(); let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const controller = new ArtifactController({ listTools: () => caller.listTools(), callTool: async request => { await wait; return caller.callTool(request); } });
    const pending = controller.refresh(); await expect(controller.clear()).rejects.toThrow('in progress'); release();
    const state = await pending; state.revision = 900;
    expect((await controller.clear()).revision).toBe(1); expect(caller.calls.at(-1)?.arguments.expectedRevision).toBe(0);
  });
  it('fails closed on a malformed snapshot instead of accepting its guards', async () => {
    const { caller, controller } = setup(); await controller.refresh();
    caller.response = (_name, value) => encode({ ...(value as object), sessionId: 'not-a-session' });
    await expect(controller.refresh()).rejects.toThrow(); await expect(controller.clear()).rejects.toThrow('fresh state');
  });
});

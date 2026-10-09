import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ArtifactController } from '../../../src/controller/controller.js';
import { examples } from '../../../src/core/examples.js';
import { createHandler, sitesFetch } from '../src/handler.js';
import { D1Repository, type D1Database, type D1Statement } from '../src/repository.js';
import type { Snapshot } from '../../../src/core/contracts.js';

// Fake D1 checks the actual SQL contract/CAS but is not Cloudflare platform acceptance.
class FakeD1 implements D1Database {
  rows = new Map<string, { version: number; body: string }>();
  fail = false;
  prepare(sql: string): D1Statement {
    let values: unknown[] = [];
    const rows = this.rows;
    const shouldFail = () => this.fail;
    return {
      bind(...v) { values = v; return this; },
      async first<T>() { if (shouldFail()) throw new Error('PRIVATE STORAGE DIAGNOSTIC'); return structuredClone(rows.get(String(values[0])) ?? null) as T | null; },
      async run() {
        if (shouldFail()) throw new Error('PRIVATE STORAGE DIAGNOSTIC');
        if (sql.startsWith('INSERT')) {
          const [owner, body] = values;
          if (rows.has(String(owner))) return { meta: { changes: 0 } };
          rows.set(String(owner), { version: 0, body: String(body) }); return { meta: { changes: 1 } };
        }
        if (!sql.startsWith('UPDATE') || !sql.includes('WHERE owner_id = ? AND version = ?')) throw new Error('Unexpected SQL');
        const [body, , owner, version] = values; const row = rows.get(String(owner));
        if (!row || row.version !== version) return { meta: { changes: 0 } };
        rows.set(String(owner), { version: row.version + 1, body: String(body) }); return { meta: { changes: 1 } };
      },
    };
  }
}
function setup() {
  const db = new FakeD1(); let now = 100_000;
  const repository = new D1Repository(db, () => now);
  // Explicit fake authenticator for tests only; production never trusts this header.
  const handler = createHandler({ repository, authenticate: async r => r.headers.get('test-owner') });
  const request = (body: unknown, owner: string | null = 'alice', extra: Record<string, string> = {}) => handler(new Request('https://example.test/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(owner ? { 'test-owner': owner } : {}), ...extra }, body: JSON.stringify(body),
  }));
  const rpc = async (method: string, params: unknown = {}, owner: string | null = 'alice') => {
    const response = await request({ jsonrpc: '2.0', id: 1, method, params }, owner);
    return { response, body: await response.json() as { result: { tools: unknown[]; content: { text: string }[]; isError?: boolean }; error: { code: number } } }; // JSON protocol fixture
  };
  const tool = async (name: string, args: unknown = {}, owner: string | null = 'alice') => {
    const r = await rpc('tools/call', { name, arguments: args }, owner);
    return { ...r, value: r.body.result?.content ? JSON.parse(r.body.result.content[0]!.text) : undefined };
  };
  return { db, repository, handler, request, rpc, tool, advance: (ms: number) => { now += ms; } };
}
const guards = (s: Snapshot) => ({ expectedRevision: s.revision, expectedSessionId: s.sessionId });
describe('Sites MCP protocol and isolation', () => {
  it('discovers nine tools without private data; unauthorized state gets 401', async () => {
    const s = setup();
    const list = await s.rpc('tools/list', {}, null);
    expect(list.body.result.tools).toHaveLength(9); expect(s.db.rows.size).toBe(0);
    expect((await s.tool('display_status', {}, null)).response.status).toBe(401);
    expect((await s.tool('display_capabilities', {}, null)).value.hardwareVerified).toBe(false);
  });
  it('does not trust body owner, email, bearer service token or identity header in generic handler', async () => {
    const s = setup();
    const response = await s.request({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'display_status', arguments: {} } }, null,
      { 'oai-authenticated-user-id': 'alice', 'oai-authenticated-user-email': 'alice@example.test', authorization: 'Bearer fake', 'OAI-Sites-Authorization': 'Bearer fake' });
    expect(response.status).toBe(401); expect(s.db.rows.size).toBe(0);
    expect((await s.tool('display_status', { owner: 'bob' })).body.result.isError).toBe(true);
    const prod = await sitesFetch(new Request('https://example.test/api/state', { headers: { 'oai-authenticated-user-id': 'alice' } }), { DB: s.db });
    expect(prod.status).toBe(401);
  });
  it('isolates owners and rejects another owner’s session and stale revisions', async () => {
    const s = setup(); const a = (await s.tool('display_status')).value as Snapshot;
    const b = (await s.tool('display_status', {}, 'bob')).value as Snapshot;
    const published = await s.tool('show_artifact', { artifact: examples[0], ...guards(a) });
    expect(published.value.artifacts).toHaveLength(1);
    expect((await s.tool('display_status', {}, 'bob')).value.artifacts).toHaveLength(0);
    expect((await s.tool('display_clear', guards(a), 'bob')).value.code).toBe('CONFLICT');
    expect((await s.tool('display_clear', guards(a))).value.code).toBe('CONFLICT');
    expect((await s.tool('display_clear', guards(b), 'bob')).value.revision).toBe(1);
  });
  it('validates every template using shared schemas', async () => {
    const s = setup(); let state = (await s.tool('display_status')).value as Snapshot;
    for (const artifact of examples) { state = (await s.tool('show_artifact', { artifact, ...guards(state) })).value; }
    expect(state.artifacts).toHaveLength(examples.length);
    expect((await s.tool('show_artifact', { artifact: { id: 'bad', template: 'image', data: { src: 'https://attacker.test/a.png' } }, ...guards(state) })).value.code).toBe('INVALID_ARGUMENTS');
    expect((await s.tool('show_artifact', { artifact: examples[0] })).value.code).toBe('INVALID_ARGUMENTS');
  });
  it('persists expiry before rejecting stale writes and clears old receipts', async () => {
    const s = setup(); let state = (await s.tool('display_status')).value as Snapshot;
    state = (await s.tool('show_artifact', { artifact: { ...examples[0], ttlSeconds: 10 }, ...guards(state) })).value;
    s.advance(10000);
    expect((await s.tool('display_clear', guards(state))).value.code).toBe('CONFLICT');
    const fresh = (await s.tool('display_status')).value as Snapshot;
    expect(fresh.artifacts).toEqual([]); expect(fresh.frame.artifact).toBeNull(); expect(fresh.revision).toBe(state.revision + 1);
    expect(JSON.parse(s.db.rows.get('alice')!.body).artifacts).toEqual([]);
  });
  it('serializes concurrent writes through CAS; only one stale writer wins', async () => {
    const s = setup(); const state = (await s.tool('display_status')).value as Snapshot;
    const results = await Promise.all([s.tool('show_artifact', { artifact: examples[0], ...guards(state) }), s.tool('show_artifact', { artifact: examples[1], ...guards(state) })]);
    expect(results.filter(r => r.body.result.isError)).toHaveLength(1);
    expect((await s.tool('display_status')).value.revision).toBe(1);
  });
  it('handles malformed JSON, batches, notifications, protocol and origin restrictions', async () => {
    const s = setup();
    expect((await s.request([])).status).toBe(400);
    expect((await s.request({ jsonrpc: '2.0', method: 'tools/call', params: { name: 'show_artifact', arguments: {} } })).status).toBe(202);
    expect(s.db.rows.size).toBe(0);
    expect((await s.request({ jsonrpc: '2.0', id: 1, method: 'ping' }, 'alice', { origin: 'https://attacker.test' })).status).toBe(403);
    expect((await s.request({}, 'alice', { 'mcp-protocol-version': 'unknown' })).status).toBe(400);
    expect((await s.request({ large: 'x'.repeat(33000) })).status).toBe(413);
    expect((await s.rpc('unknown')).body.error.code).toBe(-32601);
    const malformed = new Request('https://example.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    expect((await s.handler(malformed)).status).toBe(400);
    expect((await s.handler(new Request('https://example.test/mcp'))).status).toBe(405);
  });
  it('redacts backend exceptions', async () => {
    const s = setup(); s.db.fail = true; const r = await s.tool('display_status');
    expect(r.body.result.isError).toBe(true); expect(r.value.code).toBe('UNAVAILABLE');
    expect(JSON.stringify(r.body)).not.toContain('PRIVATE STORAGE');
  });
  it('accepts real MCP SDK StreamableHTTP transport and existing ArtifactController', async () => {
    const s = setup(); const client = new Client({ name: 'local-test', version: '1' });
    const transport = new StreamableHTTPClientTransport(new URL('https://example.test/mcp'), {
      fetch: async (url, init) => { const request = new Request(url, init); request.headers.set('test-owner', 'alice'); return s.handler(request); },
    });
    await client.connect(transport);
    try {
      const controller = new ArtifactController(client);
      expect((await controller.refresh()).artifacts).toEqual([]);
      const published = await controller.publish(examples[0]!); expect(published.activeId).toBe(examples[0]!.id);
      expect((await controller.setLayout('answer')).frame.layout).toBe('answer');
      expect((await controller.observe()).batch.events.length).toBeGreaterThan(0);
      expect((await controller.clear()).activeId).toBeNull();
    } finally { await client.close(); }
  });
});

describe('bounded display state and honest receipts', () => {
  it('enforces 20 artifacts and bounded events with truncation', async () => {
    const s = setup(); let state = (await s.tool('display_status')).value as Snapshot;
    for (let n = 0; n < 20; n++) state = (await s.tool('show_artifact', { artifact: { ...examples[0], id: `item-${n}` }, ...guards(state) })).value;
    expect((await s.tool('show_artifact', { artifact: { ...examples[0], id: 'extra' }, ...guards(state) })).value.code).toBe('LIMIT');
    for (let n = 0; n < 101; n++) state = (await s.tool('set_artifact_layout', { layout: n % 2 ? 'split' : 'answer', ...guards(state) })).value;
    const events = (await s.tool('display_events', { after: 0, expectedSessionId: state.sessionId })).value;
    expect(events.events).toHaveLength(100); expect(events.truncated).toBe(true);
    expect((await s.tool('display_events', { after: 99999, expectedSessionId: state.sessionId })).value.code).toBe('CONFLICT');
  });
  it('guards input deduplication and receipts without claiming hardware success', async () => {
    const s = setup(); let state = (await s.tool('display_status')).value as Snapshot;
    state = (await s.tool('show_artifact', { artifact: examples[0], ...guards(state) })).value;
    const input = { eventId: 'gesture-1', type: 'next', sessionId: state.sessionId, revision: state.revision };
    const first = await s.repository.execute('alice', 'input', input) as Snapshot;
    const duplicate = await s.repository.execute('alice', 'input', input) as Snapshot;
    expect(duplicate.revision).toBe(first.revision);
    await expect(s.repository.execute('alice', 'input', { ...input, eventId: 'gesture-2' })).rejects.toThrow('State changed');
    const post = (data: unknown) => s.handler(new Request('https://example.test/api/delivery', { method: 'POST', headers: { 'content-type': 'application/json', 'test-owner': 'alice' }, body: JSON.stringify(data) }));
    const receipt = { clientId: 'even-1', sessionId: first.sessionId, revision: first.revision, status: 'bridge-accepted', mode: 'even' };
    expect((await post({ ...receipt, mode: 'preview' })).status).toBe(400);
    expect((await post({ ...receipt, status: 'hardware-verified' })).status).toBe(400);
    expect((await post({ ...receipt, revision: first.revision - 1 })).status).toBe(409);
    for (let n = 0; n < 10; n++) expect((await post({ ...receipt, clientId: `even-${n}` })).status).toBe(200);
    const final = (await s.tool('display_status')).value as Snapshot;
    expect(final.deliveries).toHaveLength(8); expect(final.revision).toBe(first.revision);
    expect((await s.tool('display_capabilities')).value.hardwareVerified).toBe(false);
  });
  it('survives repository reconstruction without resetting session or input dedup', async () => {
    const s = setup(); let state = await s.repository.execute('alice', 'display_status', {}) as Snapshot;
    state = await s.repository.execute('alice', 'show_artifact', { artifact: examples[0], ...guards(state) }) as Snapshot;
    const restored = await new D1Repository(s.db, () => 100000).execute('alice', 'display_status', {}) as Snapshot;
    expect(restored).toEqual(state);
  });
  it('records a tap on a choices artifact as the same choice event as the local relay', async () => {
    const s = setup(); let state = (await s.tool('display_status')).value as Snapshot;
    const choices = examples.find(example => example.template === 'choices')!;
    state = (await s.tool('show_artifact', { artifact: choices, ...guards(state) })).value;
    state = await s.repository.execute('alice', 'input', { type: 'next', eventId: 'choice-scroll', sessionId: state.sessionId, revision: state.revision }) as Snapshot;
    state = await s.repository.execute('alice', 'input', { type: 'select', eventId: 'choice-tap', sessionId: state.sessionId, revision: state.revision }) as Snapshot;
    expect(state.frame).toMatchObject({ layout: 'split', scroll: 1, chosen: 1 });
    const events = (await s.tool('display_events', { after: 0, expectedSessionId: state.sessionId })).value as { events: Array<Record<string, unknown>> };
    expect(events.events.at(-1)).toMatchObject({ type: 'choice', inputType: 'select', choice: 1, artifactId: choices.id, artifactVersion: 1 });
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHarnessServer } from '../src/server/http.js';
import { makeMcpServer } from '../src/server/mcp-tools.js';
import { examples } from '../src/core/examples.js';
import type { Snapshot } from '../src/core/contracts.js';
const token = 'test-only-local-connection-token-000000';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function start() {
 const origins: string[] = []; const { server, store } = createHarnessServer({ token, origins });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address');
 const url = `http://127.0.0.1:${address.port}`; origins.push(url);
 cleanups.push(() => new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
 const request = (path: string, method = 'GET', data?: unknown, headers: Record<string, string> = {}) => fetch(url + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
 return { url, store, request };
}
describe('authenticated relay', () => {
 it('rejects missing auth, hostile origins, invalid input and excessive payloads', async () => {
  const { url, request } = await start();
  expect((await fetch(url + '/api/state')).status).toBe(401);
  expect((await request('/api/state', 'GET', undefined, { origin: 'https://untrusted.example' })).status).toBe(403);
  expect((await request('/api/artifacts', 'POST', { artifact: { template: 'shell' } })).status).toBe(400);
  expect((await request('/api/artifacts', 'POST', { artifact: 'x'.repeat(17000) })).status).toBe(413);
  expect((await request('/api/clear', 'POST', {}, { 'content-type': 'text/plain' })).status).toBe(415);
 });
 it('runs artifact/input/ack lifecycle and rejects stale or cross-session receipts', async () => {
  const { request } = await start();
  const state = await (await request('/api/artifacts', 'POST', { artifact: examples[0] })).json() as Snapshot;
  const next = await (await request('/api/input', 'POST', { type: 'next', eventId: 'input-1', sessionId: state.sessionId, revision: state.revision })).json() as Snapshot;
  expect(next.frame.scroll).toBe(1);
  expect((await request('/api/delivery', 'POST', { clientId: 'adapter', sessionId: state.sessionId, revision: state.revision, mode: 'even', status: 'bridge-accepted' })).status).toBe(409);
  const delivered = await request('/api/delivery', 'POST', { clientId: 'adapter', sessionId: state.sessionId, revision: next.revision, mode: 'even', status: 'bridge-accepted' });
  expect(delivered.status).toBe(200);
  const events = await (await request('/api/events?after=0')).json() as { events: { type: string }[] };
  expect(events.events.map(event => event.type)).toEqual(['published','input:next']);
 });
 it('isolates separate relay instances', async () => {
  const a = await start(); const b = await start();
  await a.request('/api/artifacts', 'POST', { artifact: examples[0] });
  expect((await (await b.request('/api/state')).json() as Snapshot).artifacts).toEqual([]);
 });
});
describe('real MCP SDK transports', () => {
 it('lists tools and round-trips an artifact through MCP, HTTP, state and input events', async () => {
  const { url, request } = await start(); const server = makeMcpServer({ url, token });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-codex-client', version: '1' }); await client.connect(clientTransport);
  cleanups.push(async () => { await client.close(); await server.close(); });
  const listed = await client.listTools(); expect(listed.tools.map(tool => tool.name)).toContain('show_artifact');
  const schemas = await client.callTool({ name: 'artifact_templates', arguments: {} }); expect(schemas.isError).not.toBe(true);
  const result = await client.callTool({ name: 'show_artifact', arguments: { artifact: examples[0] } }); expect(result.isError).not.toBe(true);
  const state = await (await request('/api/state')).json() as Snapshot; expect(state.activeId).toBe(examples[0]!.id);
  await request('/api/input', 'POST', { type: 'select', eventId: 'tap', sessionId: state.sessionId, revision: state.revision });
  const events = await client.callTool({ name: 'display_events', arguments: { after: 0 } }); expect(JSON.stringify(events)).toContain('layout:answer');
  await client.callTool({ name: 'display_clear', arguments: {} }); expect((await (await request('/api/state')).json() as Snapshot).frame.text).toBe('');
 });
 it('supports authenticated stateless Streamable HTTP for remote MCP clients', async () => {
  const { url, request } = await start();
  const client = new Client({ name: 'remote-test', version: '1' });
  const transport = new StreamableHTTPClientTransport(new URL(url + '/mcp'), { requestInit: { headers: { authorization: `Bearer ${token}` } } });
  await client.connect(transport); cleanups.push(() => client.close());
  const result = await client.callTool({ name: 'show_artifact', arguments: { artifact: examples[5] } }); expect(result.isError).not.toBe(true);
  expect((await (await request('/api/state')).json() as Snapshot).frame.artifact?.template).toBe('card');
 });
 it('returns a tool error when the relay is unavailable, without leaking credentials', async () => {
  const server = makeMcpServer({ url: 'http://127.0.0.1:1', token });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair(); await server.connect(serverTransport);
  const client = new Client({ name: 'offline-test', version: '1' }); await client.connect(clientTransport);
  cleanups.push(async () => { await client.close(); await server.close(); });
  const result = await client.callTool({ name: 'display_status', arguments: {} }); expect(result.isError).toBe(true); expect(JSON.stringify(result)).not.toContain(token);
 });
});

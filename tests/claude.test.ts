import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { artifactSchema, type Snapshot } from '../src/core/contracts.js';
import { examples } from '../src/core/examples.js';
import { emptyHud, HUD_ID, plainText, reduceHud, type HookEvent, type HudState } from '../src/claude/hud.js';
import { createHarnessServer } from '../src/server/http.js';
import { makeMcpServer, speakerFor } from '../src/server/mcp-tools.js';

const token = 'test-only-claude-connection-token-0000';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function relay() {
 const origins: string[] = []; const { server, store } = createHarnessServer({ token, origins });
 await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
 const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address');
 const url = `http://127.0.0.1:${address.port}`; origins.push(url);
 cleanups.push(() => new Promise(resolve => { server.close(() => resolve()); server.closeAllConnections(); }));
 const request = async (path: string, method = 'GET', data?: unknown) => (await fetch(url + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) })).json() as Promise<Snapshot>;
 return { url, store, request };
}
function play(events: HookEvent[], start = 1_000) {
 let state: HudState = emptyHud(); const updates = [];
 for (const [index, event] of events.entries()) { const update = reduceHud(state, event, start + index * 5000); state = update.state; updates.push(update); }
 return updates;
}

describe('Claude Code session HUD', () => {
 it('maps a turn to valid artifacts: prompt, tool activity, todo checklist, final answer', () => {
  const [prompt, bash, todos, stop] = play([
   { hook_event_name: 'UserPromptSubmit', prompt: 'Fix the overflow on the glasses' },
   { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test -- --run' } },
   { hook_event_name: 'PreToolUse', tool_name: 'TodoWrite', tool_input: { todos: [
    { content: 'Measure the font', status: 'completed' }, { content: 'Wrap by pixels', status: 'in_progress' }, { content: 'Verify on simulator', status: 'pending' } ] } },
   { hook_event_name: 'Stop', last_assistant_message: '## Done\n\n**Fixed** the `wrap` and [tests](https://example.test) pass.' },
  ]);
  for (const update of [prompt, bash, todos, stop]) expect(artifactSchema.safeParse(update!.artifact).success).toBe(true);
  expect(prompt!.artifact).toMatchObject({ id: HUD_ID, template: 'card', speaker: 'Claude', data: { title: 'WORKING' } });
  expect(JSON.stringify(bash!.artifact)).toContain('$ npm test -- --run');
  expect(todos!.artifact).toMatchObject({ template: 'checklist', data: { items: [{ state: 'done' }, { state: 'active' }, { state: 'todo' }] } });
  expect(stop!.artifact).toMatchObject({ template: 'checklist', data: { title: 'DONE' }, answer: 'Done\n\nFixed the wrap and tests pass.' });
 });
 it('throttles rapid tool updates, flags approval prompts and leaves deliberate display calls alone', () => {
  let state = reduceHud(emptyHud(), { hook_event_name: 'UserPromptSubmit', prompt: 'Go' }, 0).state;
  const first = reduceHud(state, { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/a/b.ts' } }, 2500); state = first.state;
  const second = reduceHud(state, { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/a/c.ts' } }, 3000);
  expect(first.artifact).toBeDefined(); expect(second.artifact).toBeUndefined();
  const display = reduceHud(second.state, { hook_event_name: 'PreToolUse', tool_name: 'mcp__even-g2__show_artifact', tool_input: {} }, 9000);
  expect(display.artifact).toBeUndefined();
  const waiting = reduceHud(second.state, { hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Claude needs your permission to use Bash' }, 3100);
  expect(waiting.urgent).toBe(true); expect(waiting.artifact).toMatchObject({ data: { title: 'NEEDS YOU' } });
  expect(reduceHud(second.state, { hook_event_name: 'Notification', notification_type: 'auth_success' }, 3200).artifact).toBeUndefined();
  expect(plainText('```ts\nconst a = 1;\n```\n- item')).toBe('const a = 1;\n- item');
 });
 it('publishes through the relay and does not cover an artifact the agent showed this turn', async () => {
  const { url, request } = await relay();
  const directory = await mkdtemp(join(tmpdir(), 'g2-hud-')); cleanups.push(() => rm(directory, { recursive: true, force: true }));
  Object.assign(process.env, { G2_HARNESS_URL: url, G2_HARNESS_TOKEN: token, G2_HUD_STATE_DIR: directory });
  cleanups.push(async () => { delete process.env.G2_HARNESS_URL; delete process.env.G2_HARNESS_TOKEN; delete process.env.G2_HUD_STATE_DIR; });
  const { runHook } = await import('../src/claude/hook.js');
  let now = Date.now();
  const hook = (event: HookEvent) => runHook(JSON.stringify({ session_id: 'session-1', ...event }), () => now);
  expect(await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'Show my schedule' })).toBe('published');
  expect((await request('/api/state')).activeId).toBe(HUD_ID);
  now += 1000; await request('/api/artifacts', 'POST', { artifact: examples[1] });
  now += 5000; expect(await hook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: '/x.ts' } })).toBe('skipped');
  expect(await hook({ hook_event_name: 'Stop', last_assistant_message: 'Shown.' })).toBe('skipped');
  expect((await request('/api/state')).activeId).toBe(examples[1]!.id);
  expect(await hook({ hook_event_name: 'Notification', notification_type: 'permission_prompt', message: 'Approve Bash?' })).toBe('published');
  expect(await runHook('not json')).toBe('ignored');
 });
});

describe('Claude Code MCP connection', () => {
 it('labels answers after the MCP client and forwards only this session\'s choices through the channel', async () => {
  const { url, request } = await relay();
  const server = makeMcpServer({ url, token }, { channel: true });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair(); await server.connect(serverTransport);
  const client = new Client({ name: 'claude-code', version: '2.1' }); await client.connect(clientTransport);
  cleanups.push(async () => { server.channel?.stop(); await client.close(); await server.close(); });
  expect(client.getServerCapabilities()?.experimental?.['claude/channel']).toEqual({});
  expect(client.getInstructions()).toContain('<channel source="even-g2">');
  const received: Array<{ content: string; meta: Record<string, string> }> = [];
  client.setNotificationHandler(z.object({ method: z.literal('notifications/claude/channel'), params: z.object({ content: z.string(), meta: z.record(z.string(), z.string()) }) }), notification => { received.push(notification.params); });

  await server.channel!.tick(); // baseline cursor
  const choices = examples.find(example => example.template === 'choices')!;
  const { speaker: _ignored, ...unlabelled } = choices; void _ignored;
  await client.callTool({ name: 'show_artifact', arguments: { artifact: unlabelled } });
  let state = await request('/api/state');
  expect(state.frame.text.startsWith('CLAUDE')).toBe(true);
  state = await request('/api/input', 'POST', { type: 'next', eventId: 'scroll-1', sessionId: state.sessionId, revision: state.revision });
  await request('/api/input', 'POST', { type: 'select', eventId: 'tap-1', sessionId: state.sessionId, revision: state.revision });
  await server.channel!.tick();
  expect(received).toEqual([{ content: 'The wearer chose option 2 of 4 for "What should I do next?": Open a pull request',
   meta: { artifact_id: choices.id, option_number: '2', option: 'Open a pull request' } }]);

  // Another writer's question is not this session's to answer.
  state = await request('/api/artifacts', 'POST', { artifact: { ...choices, id: 'other-question' } });
  await request('/api/input', 'POST', { type: 'select', eventId: 'tap-2', sessionId: state.sessionId, revision: state.revision });
  await server.channel!.tick(); expect(received).toHaveLength(1);
  expect(speakerFor('codex-mcp-client')).toBe('Codex'); expect(speakerFor('some-client')).toBeUndefined();
 });
});

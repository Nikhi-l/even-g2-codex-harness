import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Artifact, Snapshot } from '../core/contracts.js';
import { readConnection } from '../server/config.js';
import { emptyHud, HUD_ID, reduceHud, type HookEvent, type HudState } from './hud.js';

/**
 * Claude Code command hook: `node dist/claude/hook.js`, registered as an async hook for
 * SessionStart, UserPromptSubmit, PreToolUse, Notification and Stop. It reads the hook payload
 * from stdin, updates one session artifact on the relay and always exits 0, so a stopped relay
 * or a conflict can never block or alter the Claude session.
 */
const stateDir = process.env.G2_HUD_STATE_DIR ?? fileURLToPath(new URL('../../.local/claude-hud/', import.meta.url));
type Result = 'published' | 'skipped' | 'ignored';

async function withLock<T>(path: string, work: () => Promise<T>): Promise<T> {
  // Async hooks run concurrently. A short exclusive lock keeps the throttle state consistent.
  const deadline = Date.now() + 3000;
  for (;;) {
    try { const handle = await open(path, 'wx'); await handle.close(); break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const age = Date.now() - (await stat(path).then(info => info.mtimeMs, () => Date.now()));
      if (age > 5000) { await rm(path, { force: true }); continue; }
      if (Date.now() > deadline) throw new Error('HUD state is locked', { cause: error });
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
  try { return await work(); } finally { await rm(path, { force: true }); }
}
async function load(file: string): Promise<HudState> {
  try { return { ...emptyHud(), ...JSON.parse(await readFile(file, 'utf8')) as Partial<HudState> }; } catch { return emptyHud(); }
}
async function save(file: string, state: HudState) {
  await writeFile(`${file}.tmp`, JSON.stringify(state), { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}
const publishedAt = (artifact: Artifact) => artifact.expiresAt - artifact.ttlSeconds * 1000;

export async function runHook(raw: string, now: () => number = Date.now): Promise<Result> {
  let event: HookEvent;
  try { event = JSON.parse(raw) as HookEvent; } catch { return 'ignored'; }
  if (typeof event?.hook_event_name !== 'string') return 'ignored';
  const session = (event.session_id ?? 'default').replace(/[^a-zA-Z0-9_-]/gu, '').slice(0, 64) || 'default';
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const file = join(stateDir, `${session}.json`);
  return withLock(`${file}.lock`, async () => {
    const update = reduceHud(await load(file), event, now());
    await save(file, update.state);
    if (!update.artifact) return 'skipped';
    const connection = await readConnection();
    const api = async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(new URL(path, connection.url), {
        method, redirect: 'error', signal: AbortSignal.timeout(3000),
        headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json() as Snapshot };
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const { body: state } = await api('/api/state');
      const active = state.artifacts.find(artifact => artifact.id === state.activeId);
      // The agent chose to show something this turn: leave it on screen unless the wearer must act.
      const deliberate = active && active.id !== HUD_ID && publishedAt(active) >= (update.state.turnStartedAt ?? 0);
      if (deliberate && !update.urgent) return 'skipped';
      const result = await api('/api/artifacts', 'POST', { artifact: update.artifact, expectedSessionId: state.sessionId, expectedRevision: state.revision });
      if (result.status === 200) return 'published';
      if (result.status !== 409) return 'skipped';
    }
    return 'skipped';
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Uint8Array));
  try { await runHook(Buffer.concat(chunks).toString('utf8')); }
  catch (error) {
    // Never disturb the Claude session; leave a short local note for debugging instead.
    await mkdir(stateDir, { recursive: true, mode: 0o700 }).catch(() => {});
    await writeFile(join(stateDir, 'last-error.txt'), `${new Date().toISOString()} ${error instanceof Error ? error.message : 'hook failed'}\n`, { mode: 0o600 }).catch(() => {});
  }
  process.exitCode = 0;
}

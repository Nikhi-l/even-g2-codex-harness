import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HarnessEvent, Snapshot } from '../core/contracts.js';

/**
 * Claude Code channel (research preview): forwards the wearer's pick on a `choices` artifact into the
 * running session as `<channel source="even-g2">`. Only artifacts this MCP process published are
 * forwarded, so a session hears answers to its own questions. A choice is an answer, never approval:
 * Claude's permission rules still decide every tool call. Permission relay is deliberately not offered.
 */
export const CHANNEL_CAPABILITY = { experimental: { 'claude/channel': {} } };
export const CHANNEL_INSTRUCTIONS = 'Events from the wearer\'s Even G2 glasses arrive as <channel source="even-g2">. '
  + 'When you need a decision, show a `choices` artifact with two to nine short options and wait; the wearer scrolls and taps, '
  + 'and the event names the option they picked. Treat it as their answer to your question, not as approval for a tool call: '
  + 'your normal permission rules still apply. Each new choices artifact needs a new tap.';

interface Relay { url: string; token: string }
export class ChoiceChannel {
  private readonly published = new Map<string, number>();
  private cursor: number | undefined;
  private session: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  constructor(private readonly server: McpServer, private readonly relay: Relay, private readonly intervalMs = 1000) {}

  /** Record an artifact version this session published. Only those choices are forwarded. */
  remember(id: string, version: number) {
    this.published.set(id, version);
    if (this.published.size > 50) this.published.delete(this.published.keys().next().value!);
  }
  start() {
    const loop = async () => { await this.tick(); if (!this.stopped) this.timer = setTimeout(() => { void loop(); }, this.intervalMs); };
    void loop();
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }

  private async get(path: string): Promise<Response> {
    return fetch(new URL(path, this.relay.url), { redirect: 'error', signal: AbortSignal.timeout(4000), headers: { authorization: `Bearer ${this.relay.token}` } });
  }
  /** One poll of the relay journal. */
  async tick(): Promise<void> {
    try {
      if (this.cursor === undefined || !this.session) {
        // Start at the current cursor: gestures from before this session are never replayed.
        const state = await (await this.get('/api/state')).json() as Snapshot;
        this.session = state.sessionId; this.cursor = state.latestEventSequence; return;
      }
      const response = await this.get(`/api/events?after=${this.cursor}&expectedSessionId=${encodeURIComponent(this.session)}`);
      if (response.status === 409) { this.cursor = undefined; this.session = undefined; this.published.clear(); return; }
      if (!response.ok) return;
      const batch = await response.json() as { cursor: number; events: HarnessEvent[] };
      this.cursor = batch.cursor;
      const choices = batch.events.filter(event => event.type === 'choice' && event.artifactId && this.published.get(event.artifactId) === event.artifactVersion);
      if (!choices.length) return;
      const state = await (await this.get('/api/state')).json() as Snapshot;
      for (const event of choices) {
        const artifact = state.artifacts.find(value => value.id === event.artifactId);
        if (artifact?.template !== 'choices' || artifact.version !== event.artifactVersion || event.choice === undefined) continue;
        const option = artifact.data.options[event.choice];
        if (!option) continue;
        const question = artifact.data.title ?? artifact.id;
        await this.server.server.notification({ method: 'notifications/claude/channel', params: {
          content: `The wearer chose option ${event.choice + 1} of ${artifact.data.options.length} for "${question}": ${option}`,
          meta: { artifact_id: artifact.id, option_number: String(event.choice + 1), option },
        } });
      }
    } catch { /* Relay offline or restarting: try again on the next tick. */ }
  }
}

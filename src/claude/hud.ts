import type { ArtifactInput } from '../core/contracts.js';

/**
 * Pure mapping from Claude Code hook events to one glanceable "session" artifact. It never calls a
 * model: the prompt, current tool, todo list and final message already arrive in hook payloads.
 */
export interface HookEvent {
  hook_event_name: string; session_id?: string; cwd?: string; model?: string; prompt?: string;
  tool_name?: string; tool_input?: unknown; notification_type?: string; message?: string; title?: string;
  last_assistant_message?: string;
}
export interface HudTodo { text: string; state: 'todo' | 'active' | 'done' }
export interface HudState {
  turnStartedAt?: number; prompt?: string; activity?: string; todos: HudTodo[];
  tools: Record<string, number>; files: string[]; lastPublishAt?: number; lastSignature?: string;
}
export interface HudUpdate {
  state: HudState; artifact?: ArtifactInput;
  /** Shown even if the agent deliberately put another artifact on the display this turn. */
  urgent: boolean;
}
export const HUD_ID = 'claude-session';
const THROTTLE_MS = 2000;
export const emptyHud = (): HudState => ({ todos: [], tools: {}, files: [] });

const short = (value: string, max: number) => {
  const flat = value.replace(/\s+/gu, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 3).trimEnd()}...` : flat;
};
const base = (path: string) => path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
const field = (input: unknown, key: string) => {
  const value = typeof input === 'object' && input ? (input as Record<string, unknown>)[key] : undefined;
  return typeof value === 'string' ? value : '';
};
/** Markdown reads badly on a monochrome text pane, so keep the words and drop the markup. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n?/gu, '')
    .replace(/^#{1,6}\s+/gmu, '')
    .replace(/^\s*[-*+]\s+/gmu, '- ')
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, '$1')
    .replace(/(\*\*|__|\*|_|`)(?=\S)([^*_`\n]+?)\1/gu, '$2')
    .replace(/^\|?[-:| ]+\|?$/gmu, '')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}
function describe(tool: string, input: unknown): string {
  switch (tool) {
    case 'Bash': return `$ ${short(field(input, 'command'), 70)}`;
    case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit': return `Editing ${base(field(input, 'file_path') || field(input, 'notebook_path'))}`;
    case 'Read': return `Reading ${base(field(input, 'file_path'))}`;
    case 'Grep': case 'Glob': return `Searching ${short(field(input, 'pattern'), 40)}`;
    case 'WebFetch': try { return `Fetching ${new URL(field(input, 'url')).host}`; } catch { return 'Fetching a page'; }
    case 'WebSearch': return `Web search: ${short(field(input, 'query'), 50)}`;
    case 'Task': case 'Agent': return `Agent: ${short(field(input, 'description') || 'subtask', 50)}`;
    case 'TodoWrite': return 'Updating the plan';
    default: return tool.startsWith('mcp__') ? `Tool: ${tool.split('__').slice(1).join(' ')}` : tool;
  }
}
function todosFrom(input: unknown): HudTodo[] | undefined {
  const todos = typeof input === 'object' && input ? (input as { todos?: unknown }).todos : undefined;
  if (!Array.isArray(todos)) return undefined;
  return todos.flatMap(todo => {
    const content = field(todo, 'content'); const status = field(todo, 'status');
    if (!content) return [];
    return [{ text: short(content, 100), state: status === 'completed' ? 'done' as const : status === 'in_progress' ? 'active' as const : 'todo' as const }];
  }).slice(0, 30);
}
function elapsed(state: HudState, now: number): string {
  const seconds = Math.max(0, Math.round((now - (state.turnStartedAt ?? now)) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
function toolSummary(state: HudState): string {
  const top = Object.entries(state.tools).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return top.length ? top.map(([name, count]) => `${name.startsWith('mcp__') ? name.split('__').at(-1) : name} ${count}`).join(' · ') : 'none yet';
}
function progress(state: HudState, title: string, answer: string): ArtifactInput | undefined {
  if (!state.todos.length) return undefined;
  return { id: HUD_ID, template: 'checklist', speaker: 'Claude', ttlSeconds: 1800, answer, data: { title, items: state.todos } };
}
function card(title: string, subtitle: string, rows: Array<{ label: string; value: string }>, answer: string): ArtifactInput {
  return { id: HUD_ID, template: 'card', speaker: 'Claude', ttlSeconds: 1800, answer: answer.slice(0, 2400),
    data: { title, ...(subtitle.trim() ? { subtitle: short(subtitle, 80) } : {}),
      rows: rows.filter(row => row.value.trim()).map(row => ({ label: row.label, value: short(row.value, 160) })).slice(0, 5) } };
}

export function reduceHud(previous: HudState, event: HookEvent, now: number): HudUpdate {
  const state: HudState = structuredClone(previous);
  let artifact: ArtifactInput | undefined; let urgent = false; let force = false;
  switch (event.hook_event_name) {
    case 'SessionStart': {
      Object.assign(state, emptyHud(), { turnStartedAt: undefined, prompt: undefined, activity: undefined });
      const project = event.cwd ? base(event.cwd) : 'this project';
      artifact = card('CLAUDE READY', project, [{ label: 'MODEL', value: event.model ?? '' }],
        `Claude Code is running in ${project}. Prompts, progress and answers will appear here.`);
      force = true; break;
    }
    case 'UserPromptSubmit': {
      Object.assign(state, { turnStartedAt: now, prompt: short(event.prompt ?? '', 300), activity: 'Thinking', tools: {}, files: [] });
      artifact = card('WORKING', state.prompt ?? '', [{ label: 'NOW', value: 'Thinking' }],
        `You asked:\n${short(state.prompt ?? '', 200)}`);
      force = true; break;
    }
    case 'PreToolUse': {
      const tool = event.tool_name ?? 'tool';
      // A deliberate display call is the agent choosing what to show. Do not draw over it.
      if (tool.startsWith('mcp__even-g2__')) return { state, urgent: false };
      if (tool !== 'ToolSearch') state.tools[tool] = (state.tools[tool] ?? 0) + 1;
      state.activity = describe(tool, event.tool_input);
      const path = field(event.tool_input, 'file_path');
      if (path && ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(tool) && !state.files.includes(base(path))) state.files = [...state.files, base(path)].slice(-12);
      const todos = tool === 'TodoWrite' ? todosFrom(event.tool_input) : undefined;
      if (todos) { state.todos = todos; force = true; }
      const answer = `Now: ${state.activity}\n\nAsked: ${short(state.prompt ?? '', 160)}`;
      artifact = progress(state, 'PLAN', answer) ?? card('WORKING', state.prompt ?? '', [
        { label: 'NOW', value: state.activity }, { label: 'TIME', value: `${elapsed(state, now)} · ${toolSummary(state)}` },
        { label: 'FILES', value: state.files.join(', ') },
      ], answer);
      break;
    }
    case 'Notification': {
      const waiting = event.notification_type === 'permission_prompt';
      const idle = event.notification_type === 'idle_prompt';
      if (!waiting && !idle && event.notification_type !== 'agent_needs_input') return { state, urgent: false };
      artifact = card(waiting ? 'NEEDS YOU' : 'YOUR TURN', waiting ? 'Approval waiting on your laptop' : 'Claude is waiting for you',
        [{ label: waiting ? 'REQUEST' : 'MESSAGE', value: event.message ?? '' }, { label: 'ASKED', value: state.prompt ?? '' }],
        waiting ? `Claude needs your approval in the terminal.\n\n${short(event.message ?? '', 200)}` : short(event.message ?? 'Claude is waiting for your input.', 300));
      urgent = waiting; force = true; break;
    }
    case 'Stop': {
      const answer = plainText(event.last_assistant_message ?? '') || 'Done.';
      artifact = progress(state, 'DONE', answer) ?? card('DONE', state.prompt ?? '', [
        { label: 'TIME', value: elapsed(state, now) }, { label: 'TOOLS', value: toolSummary(state) },
        { label: 'FILES', value: state.files.length ? `${state.files.length}: ${state.files.join(', ')}` : '' },
      ], answer);
      force = true; break;
    }
    default: return { state, urgent: false };
  }
  const signature = JSON.stringify(artifact);
  if (!force && (signature === state.lastSignature || (state.lastPublishAt !== undefined && now - state.lastPublishAt < THROTTLE_MS))) return { state, urgent };
  state.lastPublishAt = now; state.lastSignature = signature;
  return { state, artifact, urgent };
}

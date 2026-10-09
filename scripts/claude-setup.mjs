// Prints the commands and settings that connect Claude Code to this harness. It writes nothing:
// review the output, then paste it where you want it. Run `npm run build` first.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const node = process.execPath;
const mcp = `${root}/dist/server/mcp.js`;
const hook = `${root}/dist/claude/hook.js`;
if (!existsSync(mcp) || !existsSync(hook)) { console.error('Run `npm run build` first.'); process.exit(1); }
const quote = value => (/^[\w./:@-]+$/.test(value) ? value : `"${value.replace(/(["\\$`])/g, '\\$1')}"`);
const command = `${quote(node)} ${quote(hook)}`;
const entry = { hooks: [{ type: 'command', command, async: true, timeout: 10 }] };
const hooks = { hooks: { SessionStart: [entry], UserPromptSubmit: [entry], PreToolUse: [entry], Notification: [entry], Stop: [entry] } };

console.log(`# 1. Display tools (start the relay first with npm start)
claude mcp add even-g2 -- ${quote(node)} ${quote(mcp)}

# 2. Optional: also let the wearer answer questions from the glasses (Claude Code channels, research preview)
claude mcp remove even-g2
claude mcp add even-g2 -- ${quote(node)} ${quote(mcp)} --channel
claude --dangerously-load-development-channels server:even-g2

# 3. Optional: live session HUD on the glasses, no model calls. Merge into ~/.claude/settings.json
#    or <project>/.claude/settings.local.json:
${JSON.stringify(hooks, null, 2)}

# 4. Claude Desktop (local stdio): add to ~/Library/Application Support/Claude/claude_desktop_config.json
${JSON.stringify({ mcpServers: { 'even-g2': { command: node, args: [mcp] } } }, null, 2)}
`);

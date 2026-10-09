# Claude on the glasses

The harness is not tied to Codex. Any MCP client can drive the display, and Claude Code has two extra hooks into a live session: hooks (Claude to glasses, no model calls) and channels (glasses to Claude). `npm run claude:setup` prints every command and setting below with this checkout's absolute paths. It writes nothing.

## Three connections

| Connection | Direction | What the wearer sees or does | Status on 2026-10-10 |
| --- | --- | --- | --- |
| **MCP tools** (`dist/server/mcp.js`) | Claude to glasses, deliberate | Claude calls `show_artifact` with any of the twelve templates. The answer header reads `CLAUDE` automatically (from the MCP client name). | Verified: a headless Claude Code 2.1.236 session published an artifact; the Even Hub simulator rendered it through the real SDK with a `bridge-accepted` receipt. |
| **Session HUD** (`dist/claude/hook.js`) | Claude to glasses, automatic | The prompt, the current tool (`$ npm test`, `Editing store.ts`), Claude's todo list as a live checklist, a `NEEDS YOU` card when a permission prompt is waiting, and the final answer. | Verified: a headless session with the hooks drove five updates and finished on a `DONE` card with the answer; simulator receipt `bridge-accepted`. |
| **Channel** (`mcp.js --channel`) | Glasses to Claude | Claude shows a `choices` artifact, the wearer scrolls and taps, and the session receives `<channel source="even-g2">The wearer chose option 2 of 3 ...</channel>` and carries on. | Protocol verified with a real MCP client in `tests/claude.test.ts`. Not yet run in a live interactive session: channels only load interactively, and this Mac's interactive CLI was still in first-run setup. |

### MCP tools

```sh
npm run build && npm start              # relay, in its own terminal
claude mcp add even-g2 -- node "$(pwd)/dist/server/mcp.js"
```

Server instructions tell the model the screen budget (8 rows of about 26 characters per split page) and which template suits what. `G2_HARNESS_SPEAKER=Name` fixes the header label instead of using the client name.

Claude Desktop uses the same stdio server in `~/Library/Application Support/Claude/claude_desktop_config.json` (`mcpServers.even-g2.command` and `args`).

### Session HUD

Register `node <checkout>/dist/claude/hook.js` as an async command hook for `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `Notification` and `Stop` (paste the block from `npm run claude:setup` into `~/.claude/settings.json` or a project's `.claude/settings.local.json`).

- One artifact, `claude-session`, is updated in place. Tool updates are throttled to one every two seconds; plan changes, alerts and the final answer always go through.
- It never covers something Claude chose to show: if another artifact was published during the current turn, the HUD stays quiet unless Claude is blocked on a permission prompt.
- Markdown in Claude's final message is reduced to plain text for the monochrome pane.
- It always exits 0 and writes nothing to stdout, so a stopped relay can never block or change the session. Errors go to `.local/claude-hud/last-error.txt`.
- It is display only. Approving a permission prompt still happens on the laptop.

### Channel

```sh
claude mcp add even-g2 -- node "$(pwd)/dist/server/mcp.js" --channel
claude --dangerously-load-development-channels server:even-g2
```

Channels are a Claude Code research preview (2.1.80 or later, claude.ai or Console sign-in; Team and Enterprise owners must enable them). Under `-p` and the Agent SDK the flag is ignored.

Then ask, for example: "Show me a choices artifact for where to get lunch and wait for my pick from the glasses." The MCP process polls the relay journal and forwards only choices on artifacts it published itself, so a session hears answers to its own questions. Tapping a `choices` artifact records the highlighted option; it never toggles the pane or runs anything.

**Permission relay is deliberately not offered.** Channels can relay tool approvals, but anyone holding the relay token could then approve a shell command with a tap. The harness keeps the rule that display input is an answer, never permission.

## Other Claude surfaces

- **Claude app on the phone, claude.ai, Claude Desktop connectors:** custom connectors run from Anthropic's cloud, so they need the relay hosted on public HTTPS (see HOSTING.md). The connector settings accept a fixed `Authorization` header, which matches the relay's bearer token, so OAuth is not required for a personal deployment. Not yet tried.
- **Remote Control:** run Claude Code on the laptop with the MCP server and hooks configured, then continue it from the Claude phone app. The glasses keep showing the HUD while you talk to the laptop session from your phone.
- **Claude Code over HTTP:** `claude mcp add --transport http even-g2 https://YOUR_RELAY/mcp --header "Authorization: Bearer $TOKEN"` works against a hosted relay. Channels need the local stdio process.

`even-terminal` (Even Realities' own CLI) mirrors a whole Claude Code terminal onto the glasses and maps R1 ring gestures to keys, including permission answers. The harness is the opposite design: glanceable artifacts beside a short answer, and no input that can approve an action. They can be used in turn but not at once, since each needs the glasses display.

## Ideas, roughly in order of value

1. **Voice to Claude.** SDK 0.0.16 (Even app 2.2.10+) streams the glasses microphone with a `speakerRole` that separates the wearer from other voices, plus long-press events from either temple or the R1 ring. Hold to talk, transcribe on the phone or relay, deliver through the channel. The privacy contract changes (audio leaves the glasses), so it needs explicit consent, a visible recording indicator and no retention.
2. **Head gestures for choices.** The SDK's IMU events could map a nod and a shake to the first two options. Taps stay as the fallback.
3. **Pinned glance cards.** A small always-available deck (next meeting, build status, battery) that the agent refreshes on a schedule, with scroll-past-the-end to flip between the deck and the current answer.
4. **Teleprompter mode.** Answer-only layout paged by scroll for talks and calls, using the measured line budget so a page never scrolls internally.
5. **Hosted relay for the phone app.** Deploy one private relay per wearer (Docker recipe exists), add it as a custom connector, and Claude on the phone can put artifacts on the glasses without a laptop.
6. **Approval with friction, if ever.** If approving from the glasses becomes worth it, require a named choice that shows the exact command, a short allowlist of low-risk tools and a second confirmation, never a single tap.
7. **SDK 0.0.16 polish.** Native `textColor` levels for secondary answer text, and the device status event to blank the display when the glasses come off.

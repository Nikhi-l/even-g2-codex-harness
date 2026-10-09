# Even G2 Codex Harness

A standalone, open-source artifact display layer for **Even Realities G2**. Give Codex structured data; keep its answer beside a compact canvas artifact on your glasses.

[![CI](https://github.com/Nikhi-l/even-g2-codex-harness/actions/workflows/ci.yml/badge.svg)](https://github.com/Nikhi-l/even-g2-codex-harness/actions/workflows/ci.yml)
[MIT license](LICENSE) · [Architecture](docs/ARCHITECTURE.md) · [Self-hosting](docs/HOSTING.md) · [Even Hub setup](docs/EVEN_HUB.md) · [Codex connection](docs/CODEX.md)

![Actual artifact harness interface, running in local browser demo mode](docs/assets/harness-preview.jpg)

*Actual browser screenshot of this project. The artifact pixels use the real template renderer; native answer text is approximated. This is a software preview, not a photograph through G2 lenses.*

## What is included

- **Twelve artifact templates**: the original list, schedule, image, image grid, thumbnail list, card and calendar, plus checklist, choices, stat, directions and code.
- A 576 × 288 split surface: native answer text on the left, a 288 × 288 canvas artifact on the right, encoded as two 288 × 144 image tiles.
- **Screen rules measured in the official Even Hub simulator:** answer text wraps by the firmware font's pixel widths and never exceeds the ten visible lines, so the firmware never scrolls the text and steals the wearer's scroll; tiles are tone-compensated so dark fills stay dark on the glasses. See [DISPLAY.md](docs/DISPLAY.md).
- **Claude Code support:** the same MCP tools, an automatic session HUD from Claude Code hooks, and an opt-in channel that turns a tap on a `choices` artifact into a message in the live session. See [Claude on the glasses](docs/CLAUDE.md).
- Stable page structure, full-text answer updates (a rebuild when text shrinks), changed-artifact rendering, scroll, and open/close layout controls.
- Authenticated **stdio and Streamable HTTP MCP**, strict template schemas, session/revision checks, expiry, bounded input history, and delivery receipts.
- A no-key browser demo, editable payloads, gallery, real Even Hub SDK adapter, Docker/Caddy hosting recipe, and Even Hub packaging scripts.

This is a single-wearer developer harness. The SDK path is implemented and tested against a mocked bridge. **Real G2 end-to-end verification remains pending.** The phone's Even Hub app owns Bluetooth; a desktop browser cannot pair with G2 through this project. Microphone capture, arbitrary HTML, remote image fetching, and automatic Codex turns are outside this release.

## Run in five minutes

Use **Node 22.12+** (Node 24 recommended) and npm.

```bash
git clone https://github.com/Nikhi-l/even-g2-codex-harness.git
cd even-g2-codex-harness
npm ci
npm run check
npm start
```

Open the private session link printed by `npm start`. It connects this tab to the relay and removes the token from the address bar. State stays in memory. The token is generated locally and saved in the ignored `.local/connection.json` with owner-only permissions.

For a standalone gallery/demo without the relay:

```bash
npm run demo
# Open http://127.0.0.1:5173
```

Choose a template, edit its JSON and answer, then **Show artifact**. Scroll moves the artifact window. Tap toggles the artifact pane. In the desktop demo, the simulated double tap closes the pane; on a connected G2, double tap opens the system exit dialog. In full-width answer mode, scroll pages the answer. **Clear display** blanks both panes; unexpired artifacts can be selected again through MCP.

## Connect Codex or Claude

Start the relay, then register the local MCP server from this checkout. For Claude Code:

```bash
claude mcp add even-g2 -- node "$(pwd)/dist/server/mcp.js"
npm run claude:setup   # prints the hook settings for the session HUD and the channel command
```

[Claude on the glasses](docs/CLAUDE.md) covers the HUD, the glasses-to-Claude channel, Claude Desktop and the phone app. For Codex:

```bash
codex mcp add even-g2 -- node "$(pwd)/dist/server/mcp.js"
codex mcp get even-g2
```

Start/reload a Codex session and ask:

> Use even-g2 to show a list artifact with my next three development tasks. Put a short explanation in the answer pane. Check the delivery status afterward.

The MCP process reads the local connection file. It does not need an OpenAI API key, and its stdout contains only MCP messages. Your Codex installation provides the model and its usual permissions.

For self-hosted use, connect your MCP client to `https://YOUR_DOMAIN/mcp` with the relay bearer token. See [Codex setup](docs/CODEX.md) for the exact command and configuration. Installing this server in a local Codex client does **not** connect a separate cloud chat or desktop “dot” automatically. Input events are available through `display_events`; they do not wake an agent conversation. The [controller walkthrough](docs/CONTROLLER.md) shows explicit publish, replace, observe, clear, select-by-ID, and delete operations without model calls.

## The artifact UX

![Actual split layout: answer on the left, rendered image artifact on the right](docs/assets/image-artifact-preview.png)

*Single-image template in the running browser, using a bundled architecture diagram. Native text is approximated; this is not a lens photograph.*

![Actual four-image board beside the answer pane](docs/assets/image-grid-display.png)

*The right pane holds four bundled images inside one 288 × 288 canvas. G2 receives that canvas as two 288 × 144 grayscale PNG tiles, not four full-color images. [Top tile](docs/assets/image-grid-gray4-top.png) · [Bottom tile](docs/assets/image-grid-gray4-bottom.png). The tile files are exact encoder output with at most sixteen brightness levels. The green browser preview suggests the monochrome display; physical comparison remains pending.*

![All twelve artifact templates rendered with safe example data](docs/assets/template-gallery.png)

*Genuine renders from the template registry. The four image assets are bundled diagram fixtures, not personal photos or remote downloads.*

![The same templates on the simulated glasses](docs/assets/simulator-glasses.png)

*Glasses framebuffers captured from the official Even Hub simulator 0.9.5 through the real SDK: answer text in the firmware font on the left, compensated tiles on the right. Simulator output, not a lens photograph.*

| Template | Data | Behavior |
| --- | --- | --- |
| `list` | Title and string or labeled rows | Scrollable seven-row window |
| `schedule` | Times, titles, locations, tags | Scrollable five-event window |
| `image` | Bundled image key, caption | Single cover image |
| `image_grid` | Two to four image keys and labels | Two-column board |
| `list_thumbnails` | Image keys, primary/secondary labels | Scrollable five-row window |
| `card` | Title, subtitle, optional image, key/value rows | Structured detail card |
| `calendar` | Explicit month and marked days | Monday-first month view |
| `checklist` | Items with `todo`, `active`, `done` or `blocked` | Progress bar, scrollable seven-row window |
| `choices` | Question and two to nine options | Scroll moves the highlight; tap records a choice event |
| `stat` | One to three numbers with unit, delta and trend | Large value, sparkline |
| `directions` | Destination, ETA and turn-by-turn steps | Scroll advances the current step |
| `code` | Lines of code or a diff hunk | Monospace with `+`/`-` gutter, scrollable 13-line window |

[Phone screenshot](docs/assets/phone-preview.jpg) · [Template authoring](docs/TEMPLATES.md) · [Source extraction map](docs/PROVENANCE.md)

## Architecture

![Codex, private relay, phone adapter, and G2 data flow](docs/assets/architecture.svg)

`Codex → MCP → authenticated relay → validated artifact state → phone renderer → Even Hub SDK → G2`

The same state feeds the browser preview. SDK writes are serialized. A receipt means either **browser-rendered** or **bridge-accepted**; neither is proof that pixels appeared on physical lenses. [Architecture and recovery details](docs/ARCHITECTURE.md) cover the lifecycle, trust boundaries, and extension points.

## Host it and test on G2

1. Host the relay behind HTTPS using [HOSTING.md](docs/HOSTING.md). Use one isolated instance and secret per wearer.
2. Build a package for your actual relay origin and your registered Even Hub package ID:

   ```bash
   npm run package:hosted -- --origin https://glasses.example.com --package-id your.registered.package
   ```

3. Review `.local/app.hosted.json`, install the resulting `.local/even-g2-harness.ehpk` through your Even Hub developer workflow, and enter the relay token at runtime.
4. Connect the glasses in the Even app and launch the packaged harness. It starts the SDK automatically; **Connect Even Hub** is available for manual connection in the browser workflow.
5. Follow the [end-to-end acceptance checklist](docs/EVEN_HUB.md#end-to-end-acceptance) before claiming hardware support.

The manifest generator embeds only a public relay origin and exact network whitelist. It never bundles your bearer token. No server or Even Hub listing is deployed by these scripts.

## Verify and contribute

```bash
npm run check          # types, lint, unit/integration tests, build, file audit
npm run test:browser   # browser regression suite (install Chromium first)
npm run smoke:simulator  # glasses screenshots and overflow check in the Even Hub simulator (set EVENHUB_SIMULATOR)
npm audit
npm run pack:g2        # demo-only Even Hub package; no network permissions
```

The tested baseline is SDK **0.0.14**, CLI **0.1.14**, and Even app **2.2.9+**. The npm registry check on 2026-10-07 reported SDK **0.0.16** (Even app **2.2.10+**), CLI **0.1.14**, simulator **0.9.5**, and the separate `even-terminal` **0.10.5**. These are distinct packages; this project remains on its tested SDK baseline. See [compatibility and limitations](docs/COMPATIBILITY.md), [verification evidence](docs/VERIFICATION.md), [store preparation](docs/STORE_SUBMISSION.md), [security](SECURITY.md), and [contributing](CONTRIBUTING.md).

## Maintainer handoff

See [the consolidated handoff](docs/HANDOFF.md) for run commands, verification boundaries and remaining acceptance work. [The Sites MCP package](docs/sites-mcp.md) supplies the hosted-backend source and installation overlay. [ChatGPT Sites research](docs/CHATGPT_SITES.md) documents the remaining authentication and lifecycle gates; no live Site or hosted plugin has been deployed.

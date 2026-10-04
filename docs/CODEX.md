# Connect Codex or another MCP client

## Local stdio

Run `npm ci && npm run build && npm start`. From a second terminal in the checkout:

```bash
codex mcp add even-g2 -- node "$(pwd)/dist/server/mcp.js"
codex mcp get even-g2
```

The absolute executable path matters because Codex may launch the process from another working directory. The MCP process resolves `.local/connection.json` relative to the checkout, not the caller's directory. The relay must already be running. Restart/reload your Codex client after configuring a server as required by that client.

Equivalent configuration is in [examples/codex.toml](../examples/codex.toml). No model or transcription API is called by the harness. All server logs go to stderr; stdout is reserved for MCP.

## Hosted Streamable HTTP

After deploying your private HTTPS relay:

```bash
# Supply G2_HARNESS_TOKEN securely in the environment of the Codex process.
codex mcp add even-g2-hosted \
  --url https://glasses.example.com/mcp \
  --bearer-token-env-var G2_HARNESS_TOKEN
```

The endpoint is authenticated stateless Streamable HTTP using POST and JSON responses. It does not provide OAuth discovery/login, public registration, an SSE event feed, or per-user sessions. A client must support a configured bearer header; a client that requires OAuth needs an additional reviewed gateway. Do not switch off relay auth to make a connector work.

A local stdio process can also relay to a hosted server when both `G2_HARNESS_URL=https://glasses.example.com` and `G2_HARNESS_TOKEN` are set in its environment. It refuses plaintext non-loopback remote URLs and redirects so credentials cannot follow a redirect to another host.

## Tools

| Tool | Purpose |
| --- | --- |
| `artifact_templates` | Exact JSON schemas for the seven templates |
| `show_artifact` | Publish/update `{artifact, expectedRevision?}` |
| `set_artifact_layout` | Set `split` or `answer` |
| `display_select` | Select an unexpired artifact by ID |
| `display_clear` | Blank display, retain artifacts |
| `display_delete` | Remove one artifact |
| `display_status` | Read snapshot, session/revision, receipts |
| `display_events` | Poll events after a cursor |
| `display_capabilities` | Read limits and unsupported features |

Example `show_artifact` arguments:

```json
{
  "artifact": {
    "id": "next-steps",
    "template": "list",
    "data": {"title": "Next steps", "rows": ["Review the diff", "Run tests", "Check the G2 display"]},
    "answer": "Keep these three steps in view. Nothing runs until you ask.",
    "ttlSeconds": 600
  }
}
```

Read `display_status` before and after sending. A stored artifact may have no connected phone. Ask for a receipt on the current revision, and distinguish preview from Even SDK acceptance.

## Input is not permission to run an agent

Tap/scroll updates the artifact view and is available through `display_events`. The harness never injects these events into an existing Codex conversation or starts a model turn. A future controller could use official Codex app-server APIs with explicit thread ownership, confirmation, and tool permissions; no such controller is bundled. Installing local MCP does not connect an unrelated cloud chat, desktop dot, or voice call. Those surfaces must independently support and configure this MCP endpoint.

References: [official Codex MCP guide](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [official app-server documentation](https://learn.chatgpt.com/docs/app-server), and the installed CLI's `codex mcp add --help`. This repository validates MCP protocol calls with the official MCP SDK; it does not claim a live model/device session was performed during release preparation.

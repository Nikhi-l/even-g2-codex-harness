# Security and privacy

This harness exposes display state and input only. It cannot execute shell commands, read arbitrary files, fetch agent-selected URLs, record audio, pair Bluetooth, or start model turns. Artifact strings are untrusted data. A model should never treat their contents or device events as authorization for an unrelated action.

## Local relay and packaged phone app

The relay binds loopback by default and protects REST/MCP with a bearer token. Public binding is explicit and must sit behind HTTPS. Host/Origin allowlists, strict Zod schemas, a 16 KiB body limit, bounded state/events, request timeouts, redirect refusal and path containment reduce accidental exposure. These are application controls, not a substitute for a hardened host, TLS, network policy and rate limiting.

One relay instance serves one wearer. Possession of its token grants reading/updating/clearing all artifacts in that instance. There are no roles, per-user isolation within a process, OAuth or token-scoped actions. Use separate instances and tokens for separate wearers. Treat receipts as client assertions rather than trusted device attestations.

The browser stores its token only in memory and removes token fragments from its URL. In a packaged phone app, the wearer may explicitly enable **Remember this connection on my phone**. This uses the Even SDK's local storage, not a hardware keystore, and is off by default. Only the exact HTTPS origin baked into that package is eligible for saving or restoration; a changed origin cannot receive the saved token. **Forget saved connection** erases it. In this local-relay mode, artifact contents and input history are never persisted. A device or WebView compromise can expose a remembered token; use this option only on your own phone and rotate its relay token if the phone is lost.

The local server saves a generated token in ignored `.local/connection.json` with owner-only permissions. Startup prints a private connection link in local loopback mode; do not share terminal captures containing it. Hosted mode does not print tokens. Never bundle tokens with `VITE_` variables or commit `.env`, `.local`, captures of account screens, or operational logs.

Artifacts and events stay in memory and are bounded. No cloud analytics, database, user profile, microphone or AI provider is configured. A connected Codex/model service may see the artifact data through MCP; use your model client's own privacy controls. Network loss/TTL causes a best-effort display blank while the phone is active; disconnected/suspended hardware may retain prior pixels.

## Optional Sites MCP source adapter

`packages/sites-mcp` adds a separate durable, owner-scoped D1 backend. It is not deployed by installing the local harness. Its managed-dispatch identity trust boundary defaults disabled until verified; do not expose the adapter behind a generic proxy or direct Worker origin. Every data operation is owner-bound and write operations require fresh session/revision guards. See [the deployment and security gate](docs/sites-mcp.md).

Sites artifact state, bounded journals, input deduplication and receipts are durable. TTL is lazy logical expiration, not a timed physical-deletion guarantee; idle rows and backups can retain expired data. Do not apply the local relay’s memory-only claims to this optional backend. A production operator must define access, cleanup, backup retention and account deletion before using private content.

## Reporting

To report a vulnerability, use GitHub private vulnerability reporting if enabled on the repository. Otherwise contact the maintainer through their GitHub profile without posting secrets or exploit details in a public issue. Include a minimal synthetic reproduction and affected commit. Revoke/rotate exposed relay tokens before sharing diagnostics.

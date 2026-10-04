# Security and privacy

This harness exposes display state and input only. It cannot execute shell commands, read arbitrary files, fetch agent-selected URLs, record audio, pair Bluetooth, or start model turns. Artifact strings are untrusted data. A model should never treat their contents or device events as authorization for an unrelated action.

The relay binds loopback by default and protects REST/MCP with a bearer token. Public binding is explicit and must sit behind HTTPS. Host/Origin allowlists, strict Zod schemas, a 16 KiB body limit, bounded state/events, request timeouts, redirect refusal and path containment reduce accidental exposure. These are application controls, not a substitute for a hardened host, TLS, network policy and rate limiting.

One relay instance serves one wearer. Possession of its token grants reading/updating/clearing all artifacts in that instance. There are no roles, per-user isolation within a process, OAuth or token-scoped actions. Use separate instances and tokens for separate wearers. Treat receipts as client assertions rather than trusted device attestations.

The browser stores its token only in memory and removes token fragments from its URL. The local server saves a generated token in ignored `.local/connection.json` with owner-only permissions. Startup prints a private connection link in local loopback mode; do not share terminal captures containing it. Hosted mode does not print tokens. Never bundle tokens with `VITE_` variables or commit `.env`, `.local`, captures of account screens, or operational logs.

Artifacts and events stay in memory and are bounded. No cloud analytics, database, user profile, microphone or AI provider is configured. A connected Codex/model service may see the artifact data through MCP; use your model client's own privacy controls. Network loss/TTL causes a best-effort display blank while the phone is active; disconnected/suspended hardware may retain prior pixels.

To report a vulnerability, use GitHub private vulnerability reporting if enabled on the repository. Otherwise contact the maintainer through their GitHub profile without posting secrets or exploit details in a public issue. Include a minimal synthetic reproduction and affected commit. Revoke/rotate exposed relay tokens before sharing diagnostics.

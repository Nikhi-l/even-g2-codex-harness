# Even G2 Sites MCP adapter

Stateless HTTP MCP + owner-isolated D1 persistence, sharing the root harness's seven artifact contracts and renderer.

Run from repository root:

```sh
npm ci
npm --prefix packages/sites-mcp run check
```

Read [the deployment and security handoff](../../docs/sites-mcp.md) before installation. This is tested source, not a deployed or paired Site. Production data access defaults off until the managed identity boundary is verified. No token, model API key, paid CI, public Worker origin or custom OAuth stack is required or included.

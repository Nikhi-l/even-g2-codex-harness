# Working on this harness

This is a single-wearer artifact display layer. Preserve the separation between core state, canvas templates, device adapter, and MCP/HTTP transport. `docs/ARCHITECTURE.md` is the architectural reference; `docs/PROVENANCE.md` records what was extracted.

Use `npm run check`. Browser regression tests run with `npm run test:browser`. External services and hardware must be mocked unless a user explicitly authorizes real testing. A bridge result never proves visible G2 pixels. Keep SDK writes sequential and fail closed after an unresolved timeout.

Do not bundle tokens, private endpoints, account data, history, or unrelated application assets. Image data uses registered bundled aliases. Adding a template requires matching schema, renderer, sample, tests, and documentation. Hosted deployments remain one isolated instance per wearer.

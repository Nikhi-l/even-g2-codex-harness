# Working on this harness

This is a single-wearer artifact display layer. Preserve the separation between core state, canvas templates, device adapter, and MCP/HTTP transport. `docs/ARCHITECTURE.md` is the architectural reference; `docs/PROVENANCE.md` records what was extracted.

Use `npm run check`. Browser regression tests run with `npm run test:browser`. External services and hardware must be mocked unless a user explicitly authorizes real testing. A bridge result never proves visible G2 pixels. Keep SDK writes sequential and fail closed after an unresolved timeout.

Do not bundle tokens, private endpoints, account data, history, or unrelated application assets. Image data uses registered bundled aliases. Adding a template requires matching schema, renderer, sample, stress fixture, tests, and documentation. Native text must fit the measured ten-line budget and tiles must stay readable after tone compensation: read `docs/DISPLAY.md` and check `/gallery.html?stress=1` before changing a template or the answer layout. Hosted deployments remain one isolated instance per wearer.

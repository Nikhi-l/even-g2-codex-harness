# Artifact templates

The source template registry and seven renderers live in `src/artifacts/`. Rendering receives a 288×288 canvas context, palette, loaded image lookup, and `{scroll}`. It never calls a model or SDK. The phone surface encodes this canvas into two images and applies them through the device adapter.

`src/core/contracts.ts` holds the public Zod schemas. MCP's `artifact_templates` returns their JSON schemas. Inputs are discriminated by `template`, reject unknown fields, and enforce string/array bounds before rendering. The template registry and contract catalog must remain aligned; a test checks this invariant.

Use `src/core/examples.ts` as a complete example catalog. Open `/gallery.html` to inspect every template or use the editor in `/` to change data. Data is displayed as text/canvas drawing, never inserted as HTML. The whole artifact remains available through state even when a compact row is ellipsized on glass.

## Images

The four supported `src` values are `architecture`, `waveform`, `route`, and `grid`. These are repository-owned SVG diagram fixtures in `src/web/public/assets/`, loaded from the app's own bundle. They are not photos of people. Arbitrary URL/data/file references are rejected; the browser never fetches an agent-provided image URL.

To add your own licensed image, put a safe asset in the public assets directory, add its key to `imageKeySchema` and `registerAssets`, and rebuild. Strip metadata, use sensible dimensions, and preserve its license. Remote URL fetching would need a separate privacy/CORS/size/redirect policy; do not bypass the alias boundary.

## Add a template

1. Add the bounded data schema to `templateSchemas` and `artifactSchema`.
2. Add a pure renderer under `src/artifacts/templates/`, register it, and import it in `src/artifacts/index.ts`.
3. Define its scroll bounds in `src/core/render.ts` if it scrolls.
4. Add safe sample data, schema tests and gallery coverage.
5. Verify clipping at 288×288, then the two 288×144 tile outputs. Native answer text must still have the sole event-capture flag.
6. Document any layout change. A new container shape requires a new surface signature and mocked/device acceptance tests.

The template registry supplies discovery/rendering; schemas supply validation and MCP descriptions. No unvalidated plugin code is downloaded at runtime.

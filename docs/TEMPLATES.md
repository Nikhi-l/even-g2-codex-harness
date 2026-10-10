# Artifact templates

The template registry and sixteen renderers live in `src/artifacts/`: the seven extracted ones (list, schedule, image, image grid, thumbnail list, card, calendar) and nine added for a display assistant (checklist, choices, stat, directions, code, portrait, glance, focus, motion). Rendering receives a 288×288 canvas context, palette, loaded image lookup, and `{scroll, chosen}`. It never calls a model or SDK. The phone surface encodes this canvas into two images and applies them through the device adapter.

`src/core/contracts.ts` holds the public Zod schemas. MCP's `artifact_templates` returns their JSON schemas. Inputs are discriminated by `template`, reject unknown fields, and enforce string/array bounds before rendering. The template registry and contract catalog must remain aligned; a test checks this invariant.

Use `src/core/examples.ts` as a complete example catalog. Open `/gallery.html` to inspect every template or use the editor in `/` to change data. Data is displayed as text/canvas drawing, never inserted as HTML. The whole artifact remains available through state even when a compact row is ellipsized on glass.

## Images

Generic image `src` values are `architecture`, `waveform`, `route`, `grid`, `moonrise`, and `ginkgo`. The first four are SVG diagram fixtures; the latter two are AI-generated grayscale background art. The `portrait` template separately accepts `portrait-mira` and `portrait-ren`, both fictional AI-generated people, and always prints AI FICTIONAL. All assets live in `src/web/public/assets/` and load from the app's own bundle. Arbitrary URL/data/file references are rejected; the browser never fetches an agent-provided image URL.

To add your own licensed image, put a safe asset in the public assets directory, add its key to `imageKeySchema` and `registerAssets`, and rebuild. Strip metadata, use sensible dimensions, and preserve its license. Remote URL fetching would need a separate privacy/CORS/size/redirect policy; do not bypass the alias boundary.

The [Quiet Surfaces guide](QUIET_SURFACES.md) documents the four new templates, all backdrop and motion variants, display constraints, and animation pacing. Motion data describes a single phase; publishing it over MCP never starts an automatic loop.

## Interactive template

`choices` is the one template where a tap means something other than "toggle the pane". In split view a tap records a `choice` event with the highlighted option's index and the artifact version; the frame's `chosen` marks it with a check. The relay never acts on it. A Claude Code session started with the channel receives it as a message (see [CLAUDE.md](CLAUDE.md)); other agents can read it from `display_events`.

## Add a template

1. Add the bounded data schema to `templateSchemas` and `artifactSchema`.
2. Add a pure renderer under `src/artifacts/templates/`, register it, and import it in `src/artifacts/index.ts`.
3. Define its scroll bounds in `src/core/render.ts` if it scrolls. Windowed templates import their row count from `VISIBLE_ROWS` so the scroll limit and the drawn rows cannot disagree. `choices` and `directions` use scroll as a cursor (highlighted option, current step) rather than a window.
4. Add safe sample data to `src/core/examples.ts`, a worst-case entry to `src/core/stress.ts`, and schema tests.
5. Verify clipping at 288×288: `/gallery.html?stress=1` renders the worst case at both scroll ends and the browser suite fails if anything touches the pane edge. Then check the glasses with `npm run smoke:simulator`. Avoid bright text on mid-grey fills: the display lifts dark levels (see [DISPLAY.md](DISPLAY.md)). Native answer text must still have the sole event-capture flag.
6. Document any layout change. A new container shape requires a new surface signature and mocked/device acceptance tests.

The template registry supplies discovery/rendering; schemas supply validation and MCP descriptions. No unvalidated plugin code is downloaded at runtime.

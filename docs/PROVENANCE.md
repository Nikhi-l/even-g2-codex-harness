# Extraction and provenance

This standalone project was extracted from the author's private G2 artifact framework after the author confirmed ownership and permission to release it under MIT. It starts with new Git history. Private application data, portraits, branding, endpoints, deployment files, account references, environment files, logs and history were not imported.

The inspected artifact baseline was commit `801abb4d5f4bd2e4c3f5d3f576742439e6231c29`. The separately inspected default-branch baseline was `02d0807bb5131e56c103a34fd947f2966737732d`; the dedicated artifact branch supplied the reusable framework.

| Original reusable area | Standalone implementation | Preservation / change |
| --- | --- | --- |
| `apps/g2-client/src/artifacts/types.ts` | `src/artifacts/types.ts` | Render context, scroll state and template interface retained |
| `apps/g2-client/src/artifacts/registry.ts` | `src/artifacts/registry.ts` | Registration/discovery/render entry points retained; tool schema aligned with validated harness contract |
| `apps/g2-client/src/artifacts/render.ts` | `src/artifacts/render.ts` | Canvas geometry, drawing and text-fit helpers retained; unrestricted image references replaced by bundled aliases and bounded load time |
| Seven files in `artifacts/templates/` | `src/artifacts/templates/` | Actual list, schedule, image, grid, thumbnail list, card and calendar drawing functions retained |
| Main app's split artifact surface | `src/device/even.ts`, `tiles.ts` | Answer-left / artifact-right, two tiles, structure reuse, append/padded text updates preserved; transport/lifecycle extracted |
| Gallery | `src/web/gallery.ts` | Seven-template gallery retained as a standalone UX with generic data/assets |
| Monolithic app state/agent/transport | `src/core/`, `src/server/`, `src/web/` | Replaced with independent state, authenticated relay, MCP and testable adapter boundaries |

The source branch described several planned components and future templates; it did not supply a standalone tested surface module or dedicated artifact test suite. This repository implements those missing boundaries and tests. It does not claim to preserve a finished notes/directions template, voice assistant, location service, or people database.

Source-owned code is now under [MIT](../LICENSE). Dependency notices are retained in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) and copied into the Even Hub bundle. Screenshots are genuine browser captures from this repository's demo, with only generic example data. No source portrait, user photo, or private screenshot was reused.

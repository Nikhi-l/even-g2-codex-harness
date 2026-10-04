# Verification record

Release preparation used generic fixture data and the pinned lockfile. No hardware, live model API, deployed public server, or Even Hub store listing was used.

## Automated local checks

- TypeScript strict typecheck and ESLint pass.
- 19 unit/integration tests pass: all seven template schemas, input rejection, scroll bounds, lifecycle/TTL/revision conflicts, bounded events/receipts, SDK startup/update/layout/tile behavior, timeout failure, serialized latest-state rendering, HTTP authorization/origin/body bounds, separate-instance isolation, and real MCP SDK in-memory/Streamable HTTP round trips.
- Production build succeeds. Dependency audit reports zero vulnerabilities at preparation time.
- Demo `.ehpk` packaging succeeds with official CLI 0.1.14, explicitly stamped against SDK 0.0.14 and Even app floor 2.2.9. Hosted packaging is checked with a reserved example domain; this is packaging evidence, not a live deployment.
- Public-file scan checks candidate text files for common credential patterns and private local paths. Generated/ignored files are excluded; staged Git contents and screenshots are separately reviewed.

The initial integration run in a restricted shell could not bind loopback (`EPERM`). It was rerun with local networking allowed and all tests passed. This was an execution-environment limitation, not a skipped integration test.

## Browser evidence

The actual application was inspected in the Codex in-app browser at desktop width and 390×844 phone width. Verified the seven-template gallery, scroll updates, tap open/close, and clear. The phone layout had `document.scrollWidth == viewport width == 390` with no horizontal page overflow. `docs/assets/harness-preview.jpg`, `template-gallery.jpg`, and `phone-preview.jpg` are actual captures of these rendered pages.

Visual checks covered original template geometry and labels, split-pane arrangement, text clipping/scroll affordances, green/cyan template palette, form/editor typography, and phone layout. Template truncation follows the preserved compact renderer. Browser native-answer typography is explicitly approximate. No fabricated through-lens image or customer asset is used.

A five-case Playwright regression suite is included for gallery pixels, interaction/editor/clear behavior, authenticated relay connection/receipt and token URL removal, mobile overflow, and unavailable-device messaging. GitHub Actions runs this after clean installation on Node 22 and 24. Consult the actual workflow run for the published commit rather than assuming an earlier run applies.

## Remaining external validation

The local Docker client was available, but its daemon was not running. Container build/runtime was therefore not verified locally. The published CI run successfully built the container and checked health, missing-token rejection, and authenticated state access. Server/domain deployment, Even Hub upload/install, physical G2 rendering/input, BLE latency, background behavior, and optics remain user-run acceptance work in [EVEN_HUB.md](EVEN_HUB.md). A browser render or successful SDK mock is not hardware evidence.

CI initially exposed that the SDK can return a browser bridge shim whose page creation rejects, rather than waiting for a native bridge. The browser regression test now covers both unavailable-device paths and asserts that neither reports bridge acceptance.

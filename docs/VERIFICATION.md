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

## Cloud staging checks, 2026-10-08

The exported working changes were applied to public base `460ac82` and combined with the explicit controller. All 26 exported file hashes and the transfer ZIP hash were verified before integration. This record covers the staged update, which has not been pushed or submitted.

- `npm run check` passes strict types, ESLint, 44 unit/integration tests, production build and public-file audit. `npm audit` reports zero known vulnerabilities in the pinned dependency graph. Added coverage includes stale-session writes/events through core/REST/MCP, original gesture metadata, duplicate IDs across sessions, controller conflicts/restarts/cursor gaps/truncation, and storage serialization/timeouts.
- The runnable example completes publish/replace/observe/clear/select/delete through real stdio MCP. Read-only observation reports a synthetic `select` event without starting a model turn or another display mutation.
- Demo and reserved-example-domain hosted packaging succeed. CLI 0.1.14 could not query the SDK floor from npm and warned that its bundled fallback was 2.2.6; both outputs retained the stricter manifest floor 2.2.9 and explicit SDK 0.0.14. No actual relay domain was deployed. The package inputs and configuration are inspected; the CLI has no unpack command, so no unsupported binary decoder is used.
- Both saved image-grid tiles are 288×144, opaque grayscale PNGs with exactly sixteen brightness levels on multiples of seventeen. The full-page and split-image screenshots were visually reviewed as synthetic browser renders.
- The known textarea assertion is corrected to `toHaveValue`. Playwright discovers nine tests. Their current test bodies could not run in the cloud shell: Chromium was blocked creating a local process socket (`EPERM`), including the permitted escalated attempt. Earlier Mac evidence was 8/9 before the assertion correction and latest guard/queue changes; it is not a final browser pass.

The earlier published CI record applies to its original commit only. No workflow rerun or new public push was performed for this staged update. Hardware, background/locked-phone behavior, official simulator captures, deployment, private install and store submission remain unverified.

## Handoff re-verification, 2026-10-09

The integration bundle SHA-256 was verified as `b1007f7b08a29f90d8878fc7518dca8c6a117daf189f540937eeed495f468191` and its binary patch applied cleanly to public base `460ac82e8246bf274041e00506087efc1cd06d69`.

- Fresh lockfile install with scripts disabled succeeded using a writable npm cache. Types, lint, all 44 unit/integration tests, production build and public-file audit passed again. Dependency audit found zero known vulnerabilities.
- The actual stdio controller demo again completed publish, replacement, lifecycle observation, clear, select and delete against a local relay. No model or hardware was used.
- Demo and reserved-example-domain hosted packages were regenerated successfully with official CLI 0.1.14, SDK 0.0.14 and app floor 2.2.9. No credentials were embedded or endpoint deployed.
- Browser acceptance is still **blocked**, not passed: Playwright's expected browser was missing; its official Chromium download returned invalid/truncated ZIP data. The available system Chromium 154.0.8037.57 was then attempted with an uncommitted test configuration, but failed during launch with `socket() failed: Operation not permitted`. No browser test body ran successfully in this verification.
- New synthetic PNG documentation captures were visually reviewed for private data. Public-file scan and `git diff --check` passed. Generated packages, local connection files, browser traces and diagnostic logs stay ignored and are not source publication inputs.

The handoff commit uses `[skip ci]` to avoid starting the repository's push/pull-request workflows. Skipped CI is not successful CI. No manual workflow run, merge, deployment, credential creation, pairing or store submission is part of this handoff. Hardware and release-mode lifecycle acceptance remain outstanding.

### Integrated Sites adapter and connection-race review

The handoff also includes the Sites source package and a fix for stale connection/Forget races discovered during review. Connection attempts are generation-guarded; adopting a new relay invalidates prior-relay operations, and Forget cancels pending restoration/settings intent without disconnecting an established session. Six browser regression cases were added, bringing discovery to 15 browser tests. These cases were collected but not executed in a browser because of the launch restriction above. Six additional executable in-memory checks of the actual handlers passed during review; they are supplementary evidence, not browser acceptance.

The Sites package adds 16 automated tests, including the pinned MCP SDK and existing controller roundtrip, SQLite-backed SQL execution, owner isolation, concurrent compare-and-swap, duplicate input handling, expiry, bounded receipts/events, same-origin client transport and overlay preservation/refusal. Root `npm run check` now includes Sites typecheck, tests and build; scoped lint covers its source, tests and installer. Managed Sites authentication, hosted D1 and real Even WebView acceptance remain unverified. Private data access defaults disabled until the documented hosting identity gate is verified.

## Mac re-verification before merge, 2026-10-10

Commit `69db0c6` was checked on macOS (Apple silicon) with Node 22.20.0 and npm 10.9.3 from a fresh `npm ci --ignore-scripts`.

- `npm run check` passed: strict types, ESLint, 44 root unit/integration tests, production build, public-file audit, and the Sites package typecheck, 16 tests and bundle build. `npm audit --audit-level=high` reported zero vulnerabilities.
- **Browser acceptance passed for the first time:** after `npx playwright install chromium` (headless shell 153.0.8010.12, revision 1243), all 15 Playwright cases ran and passed in 8.7 s. This replaces the earlier blocked status.
- The stdio controller demo completed publish, replace, observe, clear, select and delete against a local relay.
- `npm run pack:g2` produced the 83,989-byte demo package stamped with SDK 0.0.14 and app floor 2.2.9.
- A headless Claude Code 2.1.236 session, connected to `dist/server/mcp.js` through `--mcp-config`, called `display_status` and a guarded `show_artifact`. The relay reported the new revision and active artifact.
- The official Even Hub simulator 0.9.5 loaded the relay UI with `?evenhub=1`. Its 576 × 288 glasses framebuffer showed the answer pane and the list artifact, the relay recorded a current `bridge-accepted` receipt, and simulated clicks reached the relay as `select` inputs.

The simulator is official vendor software but it is not hardware evidence. Physical G2 display, input, BLE latency and background behavior remain unverified.

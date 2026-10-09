# Even Hub submission draft

Status: local preparation only. No portal project, upload, private installation, submission, or store release has been completed. The local demo package exercises bundled content; it cannot stand in for a hosted Codex release. The user must select the production relay, confirm the developer account and package identity, and complete private-device acceptance before submission.

## Listing copy

**Display name:** G2 Artifact Harness (19 characters; retained from the existing manifest, pending owner approval).

**Tagline:** Codex answers and useful artifacts on your G2.

**Description:** Keep a short answer beside a compact visual artifact on your G2. View lists, schedules, images, image boards, illustrated lists, detail cards, and calendars. Scroll through content and tap to focus on the answer. Double tap opens the system exit dialog. Try bundled examples without an API key, or connect your own private HTTPS relay and compatible MCP client to display your own artifacts. A relay and Codex setup are required for live agent content. The app does not record audio, pair Bluetooth, or start agent turns automatically. Images use the G2 monochrome display and bundled image aliases.

**English release notes:** View answers beside twelve artifact types, including checklists, choices you can answer with a tap, stats and turn-by-turn directions. Scroll and switch between split and answer views, with a system exit dialog and optional remembered relay setup.

**Source/support:** https://github.com/Nikhi-l/even-g2-codex-harness

**Privacy:** [Policy draft](PRIVACY.md). Publish the reviewed policy at a stable owner-controlled URL before submission. Confirm the support contact and actual backend domain; neither is invented here.

## Package and permission review

| Item | Prepared | Pending |
| --- | --- | --- |
| Name | G2 Artifact Harness; no “Even” in name | Owner approval of final listing |
| Package ID | `io.github.nikhil.g2harness` in demo manifest | Confirm availability/ownership in portal |
| Demo | `npm run pack:g2`; zero permissions, bundled examples, automatic SDK startup | Private install and hardware test |
| Hosted app | `npm run package:hosted -- --origin https://YOUR_DOMAIN --package-id YOUR_REGISTERED_ID` | Actual HTTPS relay/domain and registered ID |
| Network | Exact configured HTTPS origin; runtime token only | Verify production CORS/allowlist, uptime and review access |
| Setup | On-glasses startup instructions; optional SDK local storage and Forget control | Cold launch/relaunch on physical phone |
| Exit | Root double tap invokes `shutDownPageContainer(1)` after pending writes | Confirm system dialog, WebView closes, other apps launch |
| Visual assets | Grayscale icon/background drafts and real browser/image-tile examples | Official simulator captures of the release build |
| Device evidence | Mocked SDK tests and browser QA | Private/beta build, five-minute locked-phone flow |

The package generator turns on automatic SDK connection so a glasses launch does not depend on finding a phone-side connection button. A new empty relay displays instructions on the glasses. Explicit Clear still produces a blank display. Saved credentials are optional and bound to the exact packaged HTTPS origin; they never enter the package or source history.

The icon/background in `docs/assets/store/` are local monochrome drafts, not an Even logo. Preview screenshots elsewhere in `docs/assets/` are real browser renders, not official simulator captures or lens photographs. Do not upload them as proof of physical behavior. Use the official simulator's screenshot function for listing screenshots, then separately verify physical hardware.

## Release gates

1. Owner selects production HTTPS origin, hosting arrangement, final name, developer account, registered package ID, support contact and privacy-policy URL. Do not create a public localhost build.
2. Build against the pinned, tested SDK and inspect `.ehpk` contents. Check package availability through the existing developer account. Never bundle bearer tokens.
3. Sign in through the official portal personally if needed; accept developer terms only with the owner's approval. The local CLI credentials file was absent during the 2026-10-07 readiness check; no sign-in or credential changes occurred.
4. Upload a Draft and promote it to Test for a private/beta install. Use that installation for locked-phone validation; QR local testing cannot establish background behavior.
5. Complete [physical acceptance](EVEN_HUB.md#end-to-end-acceptance), including five minutes locked, scroll/tap feedback, image rendering, exit confirmation, relaunch and another first-party app. Capture sanitized versioned evidence.
6. Capture the actual release layout with the official simulator screenshot function. Finalize grayscale visual assets and the policy/domain declarations.
7. Move the tested build to Submitted. A successful submission is not a Released listing; Even's review determines release. Submitted metadata is locked and a released version requires a higher version for corrections.

The owner must supply actual relay review access through a private channel if the reviewer needs authenticated live content. Never place access credentials in this document, a public issue, screenshots, or the package.

## References, checked 2026-10-07

- [Submission and QA](https://hub.evenrealities.com/docs/ship/app-submission)
- [Packaging and manifest](https://hub.evenrealities.com/docs/ship/packaging)
- [Page lifecycle](https://hub.evenrealities.com/docs/build/page-lifecycle)
- [Background lifecycle](https://hub.evenrealities.com/docs/build/background-lifecycle)
- [Official simulator](https://www.npmjs.com/package/@evenrealities/evenhub-simulator)

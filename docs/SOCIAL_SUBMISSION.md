# Sideband publication preparation

Prepared 2026-10-11. This is a local design prototype and package candidate, not a functioning social network or a submitted/released app. Packaging does not establish physical display quality, locked-phone operation, speech recognition, peer delivery, or Even Hub approval.

## Current package contract

| Field | Value |
| --- | --- |
| Name | Sideband |
| Version | 0.1.0 |
| Package ID | `io.github.nikhil.sideband` — provisional; availability unverified |
| Edition | `202601` |
| SDK / CLI | 0.0.14 / 0.1.14, pinned |
| Minimum companion app | 2.2.9, matching installed SDK metadata |
| Entry | `social.html` |
| Permissions | Empty: no microphone, network, account, location or camera access |
| Output | `.local/sideband.ehpk` and `.local/sideband-files.json` |

Use `npm run pack:social -- --offline` for local verification without external service calls. The package retains the real official CLI format; only its SDK metadata lookup is mocked from the installed package. Before a submission, confirm the package ID and re-check the SDK floor with the normal CLI flow. The CLI can fall back to old metadata when offline, so an offline pack alone is not evidence of a live registry check. [Packaging & Deployment](https://hub.evenrealities.com/docs/ship/packaging), updated 2026-08-29; [CLI](https://hub.evenrealities.com/docs/reference/cli), updated 2026-08-20.

## Review requirements checked against official documentation

The current published rubric requires a name under 21 characters without “Even,” monochrome icon foreground/background, matching listing and device names, accurate screenshots, a privacy policy covering requested permissions, and only permissions actually used. A root double-tap must reach the system exit confirmation; exit must close the WebView and allow another app to launch. Review uses a beta install and tests locked-phone interaction, so a browser, simulator or QR demo is insufficient evidence. Builds progress through Draft, Test, Submitted and Released; a released version is replaced by a higher version. [App Submission & QA Guidelines](https://hub.evenrealities.com/docs/ship/app-submission), updated 2026-08-07, checked 2026-10-11.

The page lifecycle requires one initial page creation. Text updates target matching container IDs and names; the host owns the exit dialog. Keep these calls on the same serial chain. [Page Lifecycle](https://hub.evenrealities.com/docs/build/page-lifecycle), updated 2026-08-25, checked 2026-10-11.

Real glasses microphone capture uses `audioControl` after initial page creation and requires `g2-microphone`. The delivered audio is PCM, 16 kHz, signed 16-bit little-endian, mono. Long press/release arrives through `sysEvent`, but OS menu gestures can intercept it; retain another compose action. Sideband deliberately requests no microphone permission while voice is simulated. [Device APIs](https://hub.evenrealities.com/docs/build/device-apis), checked 2026-10-11.

Android may lose in-memory state and sockets if its WebView is reclaimed. Future real conversations need durable service state and explicit recovery; the local demo's reset-on-relaunch behavior must stay clear. [Background & Lifecycle](https://hub.evenrealities.com/docs/build/background-lifecycle), updated 2026-06-22, checked 2026-10-11.

## Work still required before a real social release

- Implement authenticated multi-wearer messaging, transcription, safe discovery, block/report and moderation, with service-owned secrets and scoped network permissions.
- Confirm ownership/availability of the package ID and final publisher/support identity.
- Supply a legible monochrome foreground icon and background. Capture final app screens; do not submit the browser workbench as a glasses screenshot.
- Publish the final privacy policy and support page at real URLs. Complete any portal metadata using the actual product behavior.
- Install the final package as a beta build on supported phones and physical G2s. Check glasses-only navigation, text fit, phone lock for five minutes, idle/resume, system exit/WebView closure and subsequent Conversate launch. Record phone/app/firmware versions and visual evidence.
- Test real capture denied/cancelled/interrupted, transcript correction, explicit send, offline/reconnect, duplicate prevention and two-wearer delivery before claiming those features.
- Have the owner approve actual submission. No upload, submission or publication has been performed by this work.

The official [Testing modes](https://hub.evenrealities.com/docs/test) distinguish browser/simulator/local iteration from beta reviewer parity (updated 2026-06-11, checked 2026-10-11).

## Listing draft for the current prototype

**Name:** Sideband

**Short description:** Explore short conversations on your glasses.

**Description:** Sideband explores a quieter social experience for G2. Browse a sample community feed, open fictional conversations, and review a simulated voice reply on the glasses display. This preview uses demo content. It does not record speech, connect to other people, or deliver messages.

**English release notes:**

Browse sample Trending, People and Inbox screens. Try a simulated voice reply and review it before adding it to a local conversation.

This copy is accurate for the prototype. Rewrite it after real services and device checks are complete; do not publish it as a working social messaging service.

## Privacy draft for the current prototype

Sideband 0.1.0 is a local interface demonstration. The supplied profiles, posts and conversations are fictional. The app does not capture microphone audio, create accounts, contact a messaging or transcription service, or use analytics. Drafts and demo conversation changes live only in the current session and reset when the app is reloaded or reset. Selecting a demo send action does not transmit a message to another person.

When launched inside Even Hub, Sideband uses the Even Hub SDK to display text and receive glasses controls. It requests no optional device or network permissions. The paired phone and Even Realities App provide the host environment under their own policies. No provider credentials are bundled.

Before publishing, add the actual publisher name, support contact, policy URL and effective date. This draft covers only the current prototype; a version with accounts, audio, transcription or peer messaging needs a revised policy describing its actual providers, purposes, retention, deletion and user controls.

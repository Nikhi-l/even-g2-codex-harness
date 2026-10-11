# Sideband: a social app for G2

Sideband is a glasses-first social design prototype. Read a small community feed, find people, and rehearse a voice-to-text reply without reaching for a phone. The current build uses fictional people and sample messages. Voice input is a transcript simulation; sending changes only the local demo. It does not record audio or connect wearers.

The interaction target is entirely on the glasses. Like other Even Hub apps, the runtime still lives in the paired phone's Even Realities App; G2 provides its display and input. A browser workbench mirrors the design and supplies test controls. This is not a claim that code runs independently on the glasses. [Official architecture](https://hub.evenrealities.com/docs/get-started/architecture)

## Product direction

- **Trending:** browse short public posts, then open one conversation at a time. Keep the sender, message and next action on one readable surface.
- **People:** find a person and open their conversation. All profiles and availability labels in this prototype are fictional.
- **Inbox:** return to individual conversations and rehearse a reply. Local demo activity must never be described as peer delivery.
- **Saved:** keep sample posts within the current session. Post actions also rehearse local hide/report controls and profile blocking; a local report does not reach a moderation service.
- **Voice reply:** enter a clearly labelled simulation, review the transcript, then explicitly choose whether to add it to the demo conversation. A transcript never sends itself.

The walkie-talkie feel comes from a short speak/review/reply rhythm. Responses are text: G2 has no speaker. The design is asynchronous messaging, not a live audio channel. [Official hardware overview](https://hub.evenrealities.com/docs/)

## Display and interaction rules

Each glasses frame is a full-width native text container, 576 × 288 pixels. Frames fit the measured limit of ten lines and the conservative 530-pixel text width in [DISPLAY.md](DISPLAY.md). The phone's CSS, cards, gradients and controls are a workbench; they are not sent to the glasses. No new canvas template or image asset is introduced.

One active selection makes the next action explicit. Scroll changes selection or page, tap activates it, and a visible back action supports navigation. Root-page double-tap requests the host's exit confirmation. Mock voice has an ordinary selectable entry, so the app does not depend on a long press being delivered. Review must offer a way to abandon a draft.

The reply flow is **Start speaking → Stop & review → Send demo message**, with Cancel and Record again available. Longer transcripts require visiting every review page before sending. A transcript over the 1,200-character limit requires recording again rather than sending a truncated message. The recipient stays fixed while composing. A simulated offline failure keeps the draft for an explicit retry; reconnect alone does not send. Reloading or resetting creates a fresh demo and clears drafts, saves, blocks and reports.

Keep frames short enough that firmware does not consume navigation gestures to scroll an overflowing native text container. Use measured wrapping for message bodies; do not derive fit from the browser font or pad text with spaces. Sender and action labels are part of the same line budget. Worst-case wide glyphs and long transcripts need coverage alongside ordinary English.

## Code boundary

| Area | Responsibility |
| --- | --- |
| `src/social/` | Fictional fixtures, local transitions, bounded native-text frames; no SDK or network |
| `src/web/social.html`, `social.ts`, `social.css`, `social-tokens.css` | Browser workbench, input controls and app entry |
| `src/device/social.ts` | Native-text SDK connection and serialized device lifecycle |
| `src/core/text.ts` | Shared measured wrapping |
| `vite.social.config.ts` | Isolated production entry and source-dependency guard |
| `app.social.json` | Sideband-only Even Hub manifest, with no permissions |
| `scripts/package-social.mjs` | Content audit, notices and official CLI packaging |

Device operations must stay sequential and fail closed after an unresolved timeout. An SDK acceptance means the bridge accepted a frame, not that a wearer saw readable pixels. The existing harness relay remains a separate, single-wearer system; it is not a social backend or account store. [ARCHITECTURE.md](ARCHITECTURE.md) defines those boundaries.

## Preview and package

Run `npm run demo` and open `/social.html` for the browser prototype. This path does not automatically connect to the SDK. The regular harness pages remain available in the same development server.

`npm run build:social` builds only `social.html` and its dependency graph to `dist/social`. That build sets `__SIDEBAND_PACKAGED__` so the app starts its SDK connection when launched from Even Hub. `publicDir: false` prevents the harness's bundled assets from being copied; the build also rejects unrelated harness source modules and unreviewed runtime dependencies.

`npm run pack:social -- --offline` creates `.local/sideband.ehpk` with the pinned SDK 0.0.14 and CLI 0.1.14. The offline switch substitutes a local fixture of the installed SDK's version metadata for the CLI's npm lookup. The official CLI still validates the manifest and produces the package. It does not check package-ID availability, contact a peer service, upload to Even Hub or run hardware tests. Without `--offline`, the CLI performs its ordinary npm metadata lookup.

The package contains the isolated web output and project/SDK licenses. `.local/sideband-files.json` records every input file's SHA-256 and the package SHA-256 for review. Generated output stays untracked. The source manifest's package ID is provisional until checked in the developer portal.

Run `npm run check` and `npm run test:browser` before handing off a change. The social unit/browser tests and mocked SDK tests establish local behavior only. Re-run `/gallery.html?stress=1` if changing the shared text rules or existing template layout.

## Path to real conversations

The next implementation needs a separate social service with wearer identity, authenticated conversation membership, an ordered message log, acknowledgements and reconnect behavior. A local send state must progress to a service acknowledgement before it can say sent, and peer receipts need their own evidence. Do not reuse the single-wearer artifact relay's shared bearer token to represent different people.

Real voice needs explicit capture permission, visible recording state, bounded recording, permission-denied handling, and a transcription provider behind a developer-controlled service. The current SDK supplies PCM, not an automatic transcript. Stop capture on cancel, review, exit and failure; require explicit send after transcription. Never bundle a provider key.

For a public social release, add consent-based discovery, block/report controls, moderation and abuse handling, deletion/retention policy, and account recovery. Replace sample rankings with a defined trending policy; do not imply the sample feed reflects real activity. Verify reconnect and locked-phone behavior across supported phones before promising an always-available inbox.

Publication preparation and remaining evidence are tracked in [SOCIAL_SUBMISSION.md](SOCIAL_SUBMISSION.md).

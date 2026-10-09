# ChatGPT Sites integration research and handoff

Status: design research dated 2026-10-08; handoff updated 2026-10-09. A source implementation is now included in [`packages/sites-mcp`](../packages/sites-mcp), with a [deployment guide](sites-mcp.md). **No live Site, hosted plugin connection, D1 database, pairing credential, or physical device connection has been provisioned.** The research below distinguishes proposed hosted behavior from locally tested code.

## Proposed architecture

Keep reasoning in the user's existing ChatGPT conversation. Expose a small authenticated display-control MCP toolset from a Site, persist versioned state in D1, and let the Even phone app fetch its owned device's latest state over HTTPS. This would use managed hosting rather than a separately operated relay server. Moving selected display content does not inherently require another model API.

A possible tool surface is `set_display`, `navigate_display`, `clear_display`, and `get_delivery_status`. These friendly names are design proposals, not installed tools. The implemented Sites package instead preserves the same nine tool names as the local harness, including `show_artifact`, `display_clear` and `display_status`, for controller compatibility. See [CONTROLLER.md](CONTROLLER.md) and [the Sites implementation guide](sites-mcp.md).

Reuse `src/core/contracts.ts`, the `src/artifacts/` templates, `src/device/tiles.ts`, the device adapter and their tests. Adapt Node HTTP/stdio transport, filesystem assumptions and process-local storage to an edge-compatible request handler and durable records. Do not introduce a new renderer or arbitrary HTML/JavaScript payloads.

Suggested records contain server-derived owner ID, owned device ID, revision, validated artifact payload, expiry, idempotency key, received revision and SDK-accepted revision. Use transactional optimistic concurrency and owner/device-scoped deduplication. A retry must not generate duplicate commands. Clear, expiry and reconnect must prevent stale content replay.

Report persisted, phone-received and SDK-accepted separately. None proves visible pixels on physical glasses. Keep the existing native answer plus 288×288 artifact split into two sequential 288×144 Gray4 tiles within the 576×288 layout.

## First gate: private WebView authentication

Sites-managed ChatGPT OAuth does not automatically authenticate the separate Even WebView. Before a full port, prove supported login and same-origin protected API access from the real Even host. Check login continuity, relaunch, session expiry, CORS/preflight where relevant, sign-out and revocation.

An owner-private Site may reject unauthenticated traffic before application code executes. A custom pairing token alone does not establish that an external device can reach it. Do not embed a Site-wide service/bypass token in the app, source, QR code or browser storage. If device credentials become necessary, establish a supported access route first, then obtain explicit approval for narrowly scoped, revocable persistent access. Making a private Site public is a separate audience decision.

Server-side identity must come from authenticated context. Authorize every read/write/acknowledgment by owner and device. Bound payloads, rates and retention; use private/no-store responses; redact content and credentials from logs. Preserve strict schemas, revision/session guards and serialized fail-closed SDK operations.

## Delivery and lifecycle

Start with short HTTPS polling and latest-state delivery, with backoff and reconnect refresh. Revisit the current 750 ms initial cadence for hosted cost and battery usage. Preserve the existing stale-connection blanking behavior unless deliberately changing the privacy contract.

Do not use a sidebar iframe as a persistent relay. UI remounting and dismissal must not affect authoritative state. There is currently no durable device artifact cache, lifecycle resume handler, push handler or speech pipeline in this harness.

Even background behavior varies by host and testing mode. Test beta/release-like builds on real iPhone hardware while foregrounded, switched away, locked, restored and network-switched. Local QR behavior cannot establish release behavior. Repeat on Android before claiming Android support. The pinned SDK is 0.0.14; newer background APIs are not assumed available.

## ChatGPT context, schedules and events

A plugin receives only the data provided through its interface; signing into the same account does not grant access to existing chats or memory. The intended path is for the existing conversation to explicitly send selected content to the display tool.

Daily updates would need a user-created scheduled task with bounded content, target device, time zone and expiry rules. A fresh unattended run must demonstrate access to its sources and the writer tool without an open UI. No schedule was created.

Two-way MCP Events are a separate optional integration. Investigate current supported surfaces, persistent subscriptions, callback verification, signed delivery, deduplication and unsubscribe/revocation. Device events are untrusted input, not automatic permission for consequential actions. No event subscription or automatic agent trigger exists in this implementation.

## Acceptance checklist

1. Discover Site MCP tools and persist one authorized write across fresh requests/runtime restart. Reject unauthenticated and cross-user access without leaking data.
2. Complete supported login in the real Even WebView. Prove relaunch, expiry and revocation. Stop if a broad service token is the only proposed workaround.
3. Send card/list/clear through the preserved renderer. Measure save-to-receipt and SDK acceptance; verify visible G2 output separately.
4. Cover duplicates, stale revisions, concurrent writers, offline reconnect, expiry and clear without obsolete replay.
5. Validate beta-build locked-phone/background behavior and network switches on hardware.
6. Separately prove a fresh unattended daily task, if requested.
7. Separately validate authenticated events and feedback-loop prevention, if requested.
8. Perform clean-room installation with no original operator secrets.

The first five gates establish the proposed manual bridge. Scheduled updates, events and directory publication remain separate gates.

## Distribution and official references

Open source, an owner-private deployment, ChatGPT plugin listing and Even Hub submission are independent steps. Public code does not require public personal data. This repository has not submitted either listing.

For ChatGPT publication, follow the current [plugin submission guide](https://developers.openai.com/plugins/deploy/submission), rechecked on 2026-10-09. Prepare publisher/domain verification, the plugin package, reviewer access and tests, privacy/support materials and a walkthrough. Use that live guide for exact current requirements; this design research is not approval or a completed submission. Even-specific materials are in [STORE_SUBMISSION.md](STORE_SUBMISSION.md).

Research sources checked on 2026-10-08 unless otherwise noted; capabilities and account availability must be rechecked before implementation:

- [Hosting a plugin with ChatGPT Sites](https://help.openai.com/en/articles/20001547-hosting-a-plugin-with-chatgpt-sites)
- [Sites hosting, durable storage and identity](https://learn.chatgpt.com/docs/sites)
- [Plugin authentication](https://developers.openai.com/plugins/build/auth)
- [Security and privacy](https://developers.openai.com/plugins/guides/security-privacy)
- [Plugin extensions](https://developers.openai.com/plugins/build/extensions)
- [MCP Events](https://developers.openai.com/plugins/build/mcp-events)
- [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Scheduled tasks](https://learn.chatgpt.com/docs/automations)
- [Sign in with ChatGPT limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Even networking](https://hub.evenrealities.com/docs/build/networking)
- [Even background lifecycle](https://hub.evenrealities.com/docs/build/background-lifecycle)
- [Even FAQ](https://hub.evenrealities.com/docs/reference/faq)
- [Even testing modes](https://hub.evenrealities.com/docs/test)

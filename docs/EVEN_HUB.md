# Even Hub setup and hardware verification

The official SDK runs in the Even app's phone WebView. It relays native containers and input to/from paired G2 glasses. There is no browser Web Bluetooth implementation here.

## Versions and limits

This repository pins `@evenrealities/even_hub_sdk` 0.0.14 and `@evenrealities/evenhub-cli` 0.1.14. The installed SDK metadata specifies Even app 2.2.9 as its minimum. Its package tool is invoked with `--sdk-ver 0.0.14` so a newer npm release cannot silently stamp a different SDK floor.

Official display guidance: 576×288, 4-bit green grayscale; at most four image plus eight other containers; each image at most 288×144; unique IDs and names (names ≤16 characters); exactly one event capture container; startup text ≤1000 characters and updates ≤2000. This harness uses two images and one text container, with answer text below 900 characters. All z-order indices are omitted together.

## Build packages

`npm run pack:g2` creates `even-g2-harness.ehpk` using `app.json`. This is a **demo-only** package with no network permissions; it can show the bundled local examples and exercise the SDK after explicit connection. It is ignored by Git and is not uploaded anywhere.

For a hosted relay:

```bash
npm run package:hosted -- \
  --origin https://glasses.example.com \
  --package-id your.registered.package
```

Replace both placeholders with your own values. The script builds the app, writes `.local/app.hosted.json` and `dist/web/harness-config.json`, then packages `.local/even-g2-harness.ehpk`. The manifest contains the exact full HTTPS relay origin as its network whitelist. Its title is “G2 Artifact Harness”; the package ID must be one you registered. No token enters the package. A subsequent ordinary `npm run build` resets the web config to the development default.

Review the generated manifest and package contents. Use your existing Even Hub developer account's current upload/test-group workflow to install it. Developer account approval, package-ID availability, app review and store publication are external steps, not completed by this repository. Follow [official Even Hub portal](https://hub.evenrealities.com/) and current portal requirements; do not claim an app is published merely because packaging succeeded.

In the Even app, pair/connect G2 using its normal controls, open the harness, connect to the private relay with the runtime token, then press **Connect Even Hub**. This task does not change device firmware or account settings. The button times out with a clear message in ordinary browsers rather than pretending they have a device bridge.

## Simulator versus preview

The browser demo renders actual artifact canvases and provides simulated input buttons. It does not load the official simulator or validate BLE behavior. The official simulator version 0.9.3 is documented with SDK 0.0.14; it offers screenshots/input/log automation, but does not emulate Bluetooth or establish firmware timing correctness. Follow the [official simulator guide](https://hub.evenrealities.com/docs/test/simulator) if adding that test layer. Neither kind of simulation substitutes for the checklist below.

## End-to-end acceptance

Record app/SDK/firmware versions, source commit, test time, device mode, and sanitized evidence. Never include tokens, account emails, private conversations, or pairing codes in a public issue.

- [ ] HTTPS `/health` is healthy; protected endpoints reject missing/wrong tokens.
- [ ] The hosted app manifest allows only the actual relay origin. The package contains no credentials.
- [ ] The phone reaches the relay, its Even app has connected G2, and the harness is in the foreground.
- [ ] The harness's **Connect Even Hub** action succeeds without new unplanned permissions.
- [ ] Codex lists `artifact_templates` and `display_capabilities`, then sends a list via `show_artifact`.
- [ ] `display_status` shows the same artifact/session/revision and a current `bridge-accepted` receipt from the phone.
- [ ] A human visually confirms answer text and the artifact on the physical G2 display. Capture a real photo/video if practical; record separately from the browser screenshot.
- [ ] Scroll exposes later list rows; `display_events` returns the matching input event. Tap toggles layout; double tap closes the artifact. No action runs automatically.
- [ ] Send all seven templates, including all image-backed templates. Check tile alignment, readable contrast, clipping, and the calendar's last week.
- [ ] Update only the answer; verify the artifact stays stable. Send a shorter answer; verify stale text is cleared.
- [ ] Switch layouts, clear, select an existing artifact, delete it, and wait for a short TTL to expire.
- [ ] Disconnect the relay network while keeping the app active; after ten seconds the client attempts to blank the display. Restore network and verify the latest state recovers without stale content.
- [ ] Restart the relay; re-publish. Old-session events must be rejected and a fresh state must render.
- [ ] Test SDK rejection/timeouts or disconnect Bluetooth. The UI must report failure; reopen Even Hub before retrying a failed surface. Never count an error as delivery.
- [ ] Only after visual confirmation, record **hardware-verified** evidence for this exact build in your deployment notes.

The repository does not claim these physical checks have been performed. An accepted SDK call confirms a bridge result, not physical pixel visibility.

References: [architecture](https://hub.evenrealities.com/docs/get-started/architecture), [display](https://hub.evenrealities.com/docs/build/display), [networking](https://hub.evenrealities.com/docs/build/networking), [official templates](https://github.com/even-realities/evenhub-templates), [SDK releases](https://www.npmjs.com/package/@evenrealities/even_hub_sdk).

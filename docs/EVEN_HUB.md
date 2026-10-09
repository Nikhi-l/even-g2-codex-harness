# Even Hub setup and hardware verification

The official SDK runs in the Even app's phone WebView. It relays native containers and input to/from paired G2 glasses. There is no browser Web Bluetooth implementation here.

## Versions and limits

This repository pins `@evenrealities/even_hub_sdk` 0.0.14 and `@evenrealities/evenhub-cli` 0.1.14. The installed SDK metadata specifies Even app 2.2.9 as its minimum. Its package tool is invoked with `--sdk-ver 0.0.14` so a newer npm release cannot silently stamp a different SDK floor.

Official display guidance: 576×288, 4-bit green grayscale; at most four image plus eight other containers; each image at most 288×144; unique IDs and names (names ≤16 characters); exactly one event capture container; startup text ≤1000 characters and updates ≤2000. This harness uses two images and one text container, with answer text below 900 characters. All z-order indices are omitted together.

## Build packages

`npm run pack:g2` creates `even-g2-harness.ehpk` using `app.json`. This is a **demo-only** package with no network permissions; it shows bundled examples and automatically initializes the SDK with first-launch instructions. It is ignored by Git and is not uploaded anywhere. Store preparation and remaining release gates are in [STORE_SUBMISSION.md](STORE_SUBMISSION.md).

For a hosted relay:

```bash
npm run package:hosted -- \
  --origin https://glasses.example.com \
  --package-id your.registered.package
```

Replace both placeholders with your own values. The script builds the app, writes `.local/app.hosted.json` and `dist/web/harness-config.json`, then packages `.local/even-g2-harness.ehpk`. The manifest contains the exact full HTTPS relay origin as its network whitelist. Its title is “G2 Artifact Harness”; the package ID must be one you registered. No token enters the package. A subsequent ordinary `npm run build` resets the web config to the development default.

Review the generated manifest and package contents. Use your existing Even Hub developer account's current upload/test-group workflow to install it. Developer account approval, package-ID availability, app review and store publication are external steps, not completed by this repository. Follow [official Even Hub portal](https://hub.evenrealities.com/) and current portal requirements; do not claim an app is published merely because packaging succeeded.

In the Even app, pair/connect G2 using its normal controls and open the packaged harness. It initializes the SDK automatically. Use **Connect relay** on the phone for live Codex data. The hosted package can optionally remember its exact HTTPS relay and token using SDK local storage; this is off by default, is not a hardware keystore, and includes a Forget control. A new empty relay shows setup guidance instead of a silent black first-run screen. An ordinary browser reports bridge absence or rejected page creation (the SDK may provide a non-native shim). Neither path reports successful device delivery.

## Temporary Wi-Fi test

The normal desktop preview binds only to `127.0.0.1:5173`; that address cannot be reached from an iPhone. With the user's approval to expose the bundled demo on a trusted Wi-Fi network, and with both devices on that network, bind only to the Mac's actual LAN IP:

```bash
npm run demo -- --host YOUR_MAC_LAN_IP
npx evenhub qr --url 'http://YOUR_MAC_LAN_IP:5173/?evenhub=1&template=image_grid'
```

Stop the loopback demo before reusing its port. Replace the IP placeholder; do not scan a QR containing `127.0.0.1` from the phone. Scan through the Even app's developer/local testing flow. The `evenhub=1` flag starts the SDK automatically and the template flag selects a bundled image board. HTTP development WebViews use cryptographic random bytes for UUIDs when the secure-context `randomUUID` API is unavailable.

This demo exposes only bundled development UI to that local network. Do not attach private Codex state to it, open firewall/router ports, or create a public tunnel as an implicit next step. Stop the dev server after the session. Enabling the LAN address, developer mode, or any requested phone permission still needs the wearer's action/approval. QR mode does not establish locked-phone background behavior; install a private/beta package for that test.

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
- [ ] Scroll exposes later list rows; `display_events` returns the matching input event. Tap toggles layout. On the glasses, double tap opens the system exit-confirmation dialog; confirming it closes the WebView. No action runs automatically.
- [ ] Exit and re-launch the app, then launch a first-party app without restarting the glasses. Test private/beta installation with the phone locked for five minutes. QR mode is insufficient for this check.
- [ ] If remembered setup is enabled, cold-launch restores only the packaged relay; Forget removes the saved connection. Test with a dedicated test relay, not personal conversations.
- [ ] Send all seven templates, including all image-backed templates. Check tile alignment, readable contrast, clipping, and the calendar's last week.
- [ ] Update only the answer; verify the artifact stays stable. Send a shorter answer; verify stale text is cleared.
- [ ] Switch layouts, clear, select an existing artifact, delete it, and wait for a short TTL to expire.
- [ ] Disconnect the relay network while keeping the app active; after ten seconds the client attempts to blank the display. Restore network and verify the latest state recovers without stale content.
- [ ] Restart the relay; re-publish. Old-session events must be rejected and a fresh state must render.
- [ ] Test SDK rejection/timeouts or disconnect Bluetooth. The UI must report failure; reopen Even Hub before retrying a failed surface. Never count an error as delivery.
- [ ] Only after visual confirmation, record **hardware-verified** evidence for this exact build in your deployment notes.

The repository does not claim these physical checks have been performed. An accepted SDK call confirms a bridge result, not physical pixel visibility.

References: [architecture](https://hub.evenrealities.com/docs/get-started/architecture), [display](https://hub.evenrealities.com/docs/build/display), [networking](https://hub.evenrealities.com/docs/build/networking), [official templates](https://github.com/even-realities/evenhub-templates), [SDK releases](https://www.npmjs.com/package/@evenrealities/even_hub_sdk).

# Maintainer handoff — 2026-10-09

## Included work

This branch consolidates the prior unpublished artifact/controller integration on public base `460ac82e8246bf274041e00506087efc1cd06d69`:

- Seven deterministic templates and bundled image aliases, split display and Gray4 tile evidence.
- Model-independent stdio controller and guarded publish/replace/observe/clear/select/delete flows.
- Session/revision checks, original gesture metadata, bounded event observation and conflict recovery.
- Serialized render/settings/exit SDK operations, fail-closed timeouts and system-owned double-tap exit.
- Opt-in exact-HTTPS-origin remembered settings and Forget behavior.
- Packaging, privacy/security, controller and store-preparation documentation.
- [Sites MCP source package and deployment guide](sites-mcp.md), preserving the nine tool names with owner-scoped D1 persistence, guarded writes and a managed-Sites overlay installer.
- [Sites feasibility research and acceptance plan](CHATGPT_SITES.md). Source implementation is included; hosting, plugin connection and device authentication are not deployed or verified.

## Run locally

Use Node 22.12+ and the committed lockfile:

```sh
npm ci --ignore-scripts
npm run check
npm audit --audit-level=high
npx playwright install chromium
npm run test:browser
npm run pack:g2
npm start
```

With the server running, use another terminal:

```sh
npm run example:controller -- --demo
npm run example:controller -- --observe
```

The demo requires an empty display and cleans up its own synthetic artifact. Observation does not call a model or perform an action based on a gesture. Read [CONTROLLER.md](CONTROLLER.md) for conflict and restart recovery.

For hosted packaging after choosing an authorized HTTPS relay and registered package ID:

```sh
npm run package:hosted -- --origin https://your-relay.example --package-id your.registered.package
```

This command packages configuration; it does not deploy a server or embed a token. Review [EVEN_HUB.md](EVEN_HUB.md) and [SECURITY.md](../SECURITY.md) before installation or exposure.

## Remaining work

- Install the Sites source overlay in an authorized managed Site and verify identity-header anti-spoofing and direct-origin isolation before enabling private data.
- Complete the private Site/real Even WebView authentication spike before integrating the phone UI transport. Sidebar controls, scheduled tasks and event-triggered agent turns are not implemented.
- Complete browser regression acceptance and real G2 display/input testing.
- Validate locked-phone/background, reconnect, expiry and restore behavior in beta/release-like host builds.
- Configure any real relay, device authorization and deployment deliberately; none is supplied here.
- Obtain official simulator/hardware captures and complete Even Hub review/install/submission requirements.
- Treat ChatGPT plugin submission as separate work using the [official submission guide](https://developers.openai.com/plugins/deploy/submission).

See [VERIFICATION.md](VERIFICATION.md) for dated passed, blocked and unrun checks. CI is intentionally skipped on this handoff commit with `[skip ci]`; that is not a CI pass. No workflow dispatch, main-branch merge, release, hosted deployment, operational credential or store submission accompanies this handoff.

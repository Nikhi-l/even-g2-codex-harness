# Compatibility and limitations

| Layer | Baseline | Evidence / limit |
| --- | --- | --- |
| Node | 22.12+; development on 24 | Types/build/tests; Node 22 and 24 in CI |
| Even Hub SDK | **0.0.14**, exact pin | Installed public types/README inspected; calls tested with an injected bridge |
| Even Hub CLI | **0.1.14**, exact pin | `pack`/`qr` command syntax inspected and packaging checked |
| Even app | **2.2.9+** | Floor from SDK `minAppVersion`; not a tested physical device claim |
| G2 | 576×288, grayscale | Official limits honored by container construction; physical test pending |
| Official simulator | 0.9.3 documented for SDK 0.0.14 | Optional external test layer; not bundled or run in this release |
| Browser preview | Current Chromium/WebKit-class browser with Canvas | Real template renderer; approximate native text/optics |
| Codex | MCP stdio or Streamable HTTP client | CLI syntax checked; official MCP SDK protocol integration tested |
| Hosted clients | Bearer-authenticated Streamable HTTP POST | No OAuth or SSE subscription, client support varies |

npm offered SDK 0.0.16 during development, while the official guide/simulator baseline was 0.0.14. The lockfile and pack command intentionally keep 0.0.14. Upgrade SDK, app floor, payload validation, device tests and package metadata together.

G2 is not a browser canvas: the phone rasterizes artifacts to bounded image tiles and sends native text separately. The template palette includes green/cyan in preview; outgoing image tiles are prequantized to sixteen grayscale levels and the device presents green intensity. Image-backed updates are heavier than native text. Polling adds roughly 750 ms under normal conditions, and queued render work coalesces; this is a readable artifact surface, not video or a real-time game renderer.

Image keys are bundled-only. Input events update/poll state but do not start agent turns. No audio/mic, firmware control, browser BLE, paid provider API, OAuth account system, multi-tenant service, automatic app publication, or durable storage is included. Phone background suspension, BLE latency, optical readability, battery behavior and firmware differences require real device testing.

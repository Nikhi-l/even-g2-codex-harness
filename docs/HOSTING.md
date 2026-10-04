# Self-host a private relay

This recipe prepares a server you control. It does not deploy anything automatically or publish an Even Hub listing. A public repository does not mean your relay should be publicly writable.

## One instance per wearer

Each process holds one artifact namespace. All clients with its bearer token share that state. For multiple people, deploy separate containers, origins and tokens. Do not give unrelated users one shared token or describe this release as multi-tenant. There is no user database, public signup, billing, or durable artifact history.

## Docker + Caddy

Prerequisites: a server with Docker Compose, a domain pointed to it, and ports 80/443 reachable. Keep 8787 private. The runtime container is non-root, read-only apart from a private tmpfs, and drops capabilities. For production, review and pin the Node/Caddy image digests used by your environment.

1. Clone the repository onto the server.
2. Copy `.env.example` to `.env`. Set `G2_HARNESS_DOMAIN` to your hostname and `G2_HARNESS_ORIGIN` to its exact HTTPS origin, with no trailing slash.
3. Generate a random token using `openssl rand -hex 32`. Put it only in the server's `.env` or secret manager. Restrict `.env` to its owner (`chmod 600 .env`). The sample placeholder is not a secret and must be replaced.
4. Run `docker compose config --quiet` to validate configuration without printing secrets, then `docker compose up -d --build`.
5. Check `https://YOUR_DOMAIN/health` returns `{"ok":true,"service":"even-g2-harness"}`. An unauthenticated `/api/state` or `/mcp` request must return 401.
6. Open the web console over HTTPS, press **Connect relay**, and enter the token. Supply the same token to your own MCP client and Even Hub app at runtime.

Caddy handles TLS. Access logging is not enabled in this configuration; never enable request-body or Authorization-header logging. Hosted startup does not print its token. Artifact data is in memory and vanishes on restart. Caddy's volumes hold certificates, not artifacts. The harness's `.local` tmpfs stores local connection configuration only.

If you already have a reverse proxy, run the harness privately behind it with:

```text
G2_HARNESS_HOST=0.0.0.0
G2_HARNESS_PORT=8787
G2_HARNESS_ALLOW_LAN=1
G2_HARNESS_ORIGIN=https://YOUR_DOMAIN
G2_HARNESS_TOKEN=<random-secret-at-least-32-characters>
```

Pass these as runtime environment variables. `npm start` does not implicitly load `.env`; Docker Compose uses the supplied file. Preserve the public Host header. Terminate HTTPS at the proxy, enforce a 16 KiB body limit, and apply rate limiting appropriate to your network. The provided relay validates bounds but does not include a distributed rate limiter.

## CORS / Even Hub network permission

The packaged app needs its relay's full HTTPS origin in `permissions[].whitelist`. `npm run package:hosted` writes exactly that origin, with no wildcard. The relay permits its own configured origin by default. If your installed Even Hub WebView sends a different Origin header, determine it using your controlled device's network diagnostics and add that exact origin to `G2_HARNESS_ALLOWED_ORIGINS` (comma-separated). Never add `*`, `null`, or untrusted origins as a convenience workaround.

CORS is not authentication. Every protected request must still include the bearer token. Some native WebViews may send no Origin; authenticated requests without Origin are accepted. A phone's `localhost` means the phone, not your server.

## Trusted LAN development

Use the server's actual LAN address, explicit origin, and a random token:

```text
G2_HARNESS_HOST=0.0.0.0
G2_HARNESS_ALLOW_LAN=1
G2_HARNESS_ORIGIN=http://YOUR_LAN_IP:8787
G2_HARNESS_TOKEN=<random-development-secret>
```

Run the process with those environment variables and create a QR with `npx evenhub qr --url http://YOUR_LAN_IP:8787`. Your phone must reach that address. HTTP is only a development option on a trusted network; hosted packaging requires HTTPS. The browser UI asks before using a non-loopback HTTP relay. The stdio MCP remote-relay client refuses non-loopback HTTP.

## Operations

- Rotate the token in runtime configuration and restart the server; reconnect all clients. Delete `.local/connection.json` to rotate an automatically generated local token.
- On restart, state/session changes; re-publish the desired artifact. Old session/revision inputs fail safely.
- Keep the app foregrounded for hardware testing. A phone suspended in the background cannot reliably poll or clear G2 content.
- Back up configuration through your usual secret handling; do not back up tokens into this repository.
- Use [the end-to-end checklist](EVEN_HUB.md#end-to-end-acceptance) before calling a deployment ready. A healthy endpoint does not prove physical display delivery.

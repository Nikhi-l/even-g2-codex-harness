# Sites-hosted MCP: implementation and deployment handoff

## What is implemented

`packages/sites-mcp` is a real server adapter, not just an architecture proposal:

- Stateless JSON-RPC MCP at `POST /mcp`: initialize, ping, tool discovery and tool calls. It interoperates with the pinned MCP SDK's `StreamableHTTPClientTransport` and the existing `ArtifactController`.
- The same nine display tools, twelve artifact schemas, registered image aliases and deterministic renderer as the local harness. Mutations require both the current session and revision. Events require the current session.
- Durable D1 state keyed only by the authenticated, Site-scoped user ID. Every read/write is owner-bound. Compare-and-swap covers concurrent mutations, receipts and input deduplication.
- Bounds: 20 artifacts, 100 journal events, 256 recent input IDs, 8 receipts, 32 KiB request bodies, 256 KiB serialized state. No URL fetching, arbitrary rendering code or unregistered images.
- Same-origin `/api/state`, `/api/input`, `/api/delivery` and a small `SitesTransport` browser client. No bearer token, service credential or identity value is accepted by that client.
- A build/installer that overlays the current Sites Vinext starter while retaining its Sites build integration, existing manifest fields and schema. It produces a self-contained server bundle and browser transport; it does not create accounts, mint credentials, publish a Site or modify the user's computer.

This adapter changes transport and persistence. The existing Even adapter, sequential render queue, canvas templates and local relay remain unchanged. Gestures go through the same `navigate()` as the local store, so a tap on `choices` produces the same `choice` event here.

## What has and has not been verified

Local verification covers typechecking, lint, bundle generation, protocol/error/auth/owner-isolation tests, concurrency, TTL, bounded events/receipts, a real SQLite-backed SQL test, real MCP SDK + controller roundtrip, and installer preservation/refusal checks. Auth in local handler tests is explicitly fake; SQLite is not hosted D1. No paid CI or model API calls are required.

Not yet verified: Sites deployment/build acceptance, real managed OAuth connection, production ingress-header spoof rejection, private Site access from the external Even WebView, G2 visible pixels, or real-device navigation. No Site was created or published for this handoff. The result is a source adapter prepared for deployment validation with a repeatable starter overlay, not a live or paired service.

There is no ChatGPT history/memory API access, model inference, automatic agent turns, scheduled task runner, native sidebar extension, or automatic credential pairing in this implementation. Plugin UI/scheduling ideas are separate from the operational MCP adapter. Display input is navigation data, never permission to execute a consequential action.

## Local checks

From the repository root:

```sh
npm ci
npm --prefix packages/sites-mcp run check
npm run check
```

The package uses the root locked dependencies. Do not run an independent package install. Its tests enable Node's built-in experimental SQLite module to support the repository's Node 22 baseline. The build writes ignored `packages/sites-mcp/dist/handler.js` and `client.js`; rebuilding after source changes is required before installing the overlay.

## Identity and security boundary

Sites supplies a stable `oai-authenticated-user-id` within one Site and owns sign-in/OAuth and identity-header injection. Email is not an authorization key. `sitesFetch` is exclusively an adapter for that managed dispatch boundary. It is unsafe to expose that function behind a generic proxy that passes arbitrary identity headers, on `workers.dev`, or on an unauthenticated origin. A direct origin must not be reachable around Sites dispatch.

The adapter defaults to denying data-bearing requests. `EVEN_SITES_AUTH_BOUNDARY_VERIFIED=true` is an explicit server-side deployment gate, not an authentication secret or substitute for platform enforcement. Only set it after the acceptance procedure below. Capability/schema discovery remains content-free. Tests use `createHandler` with a separate fake authenticator; no development authentication fallback is shipped in the server bundle.

Never put an `OAI-Sites-Authorization` bypass token in the browser, Even package, source, URL, deployment manifest, screenshot or logs. A service-access token does not establish a wearer identity. This package does not implement service-token-to-user impersonation, pairing tokens or a second OAuth stack.

Same-origin browser requests use the managed Site session. Cross-origin requests are rejected and no permissive CORS headers are added. JSON bodies are required for mutations, redirects are rejected by the browser transport, and responses use `Cache-Control: no-store`.

## Install into a new private Site

Use the current Sites plugin workflow to initialize a **Vinext** Site in a separate checkout, register it as private and persist the returned Site identity. Keep the starter's Sites build integration and authentication helpers. This repository does not include a real Site ID or hosted credentials.

1. Build this adapter using the local commands above.
2. From the repository root, run:

   ```sh
   node packages/sites-mcp/scripts/install-overlay.mjs /absolute/path/to/the-initialized-sites-checkout
   ```

   This preserves existing manifest fields, adds `capabilities: ["mcp"]` and a `DB` D1 binding, installs the server routes/client transport, and appends a Drizzle schema export. It refuses existing destination files or a conflicting D1 binding. The target must already contain a registered `project_id`. Do not rerun it to update an existing installation; inspect and merge the rebuilt bundle and schema intentionally.

3. In the Site checkout, use its supported dependency installer, then run `npm run db:generate`. Inspect and commit the generated migration and metadata. `deploy/schema.sql` in this repository is a reference used by tests; do not apply both it and the generated migration. Tables are never created during requests.
4. Use the current Sites local migration/build workflow. Keep all starter build/auth infrastructure. Package, save and deploy owner-private through Sites. Do not deploy the generated handler separately with Wrangler or expose a second public Worker origin.
5. Keep `EVEN_SITES_AUTH_BOUNDARY_VERIFIED` unset until the identity acceptance steps below are complete. The hosted routes will return 401 for user state until enabled.
6. After enabling safely, use the Site's managed plugin connection: get its MCP connection details, install/connect the generated private plugin and verify a read-only `display_status` tool call. Sites manages OAuth. Do not add a separate local stdio connection or copy a Site service token into the MCP client.

Hosting success alone is not proof of a working plugin connection. Record the deployment version and the first successful authenticated read separately.

## Platform acceptance: mandatory before real content

Use a dedicated private canary Site containing only synthetic data to establish platform behavior. Never use real artifacts to test an unknown boundary.

1. Verify that the Site is reached only through managed dispatch and there is no directly reachable Worker origin. Unauthenticated access to a private Site must require sign-in or be rejected.
2. In that synthetic canary only, temporarily enable the explicit gate. Send unauthenticated requests with forged `oai-authenticated-user-id` / email headers. They must not read or write another user's records. A caller-supplied identity must never survive ingress as an authenticated identity.
3. Sign in as account A and repeat a request carrying a forged account B identity header. It must still resolve to A (or be rejected). Test B through a platform-supported authenticated context without broadening the production Site audience. Verify independent empty state, then distinct synthetic artifacts. If you cannot establish this, leave production data access disabled.
4. Verify the generated MCP plugin with actual managed OAuth: initialize, list tools, read status, publish one synthetic artifact using fresh guards, and read it back. Confirm anonymous and wrong-user reads fail.
5. With those platform guarantees established for the deployment path, configure the production Site's `EVEN_SITES_AUTH_BOUNDARY_VERIFIED=true` using supported server environment configuration. Recheck audience and origin restrictions after hosting/access changes. Never accept the flag from a request.
6. Verify hosted D1 durability across deployments, conflicting concurrent writes, expiry and stale receipt rejection. Local tests do not establish these hosted guarantees.

If header spoofing is possible or origin isolation cannot be proved, stop. Retain the local authenticated relay or replace the resolver with a supported, independently verified identity mechanism. Do not weaken access or embed a site-wide token to get around private Site sign-in.

## Even client integration and remaining WebView gate

The installer serves `/even-sites-client.js`, exporting `SitesTransport`. It deliberately has no token setting or alternate-origin option. A UI hosted on the same Site can import it, call `state()`, feed `snapshot.frame` into the existing `RenderQueue`, post guarded `input()` events, and post `delivery()` only after the adapter callback. The package source is also importable from a repository-local front-end build.

Example wiring inside an existing authenticated, same-origin UI:

```ts
import { SitesTransport } from '/even-sites-client.js';
const transport = new SitesTransport();
const snapshot = await transport.state();
// Existing renderer/adapter, unchanged:
queue.submit(snapshot.frame);
// On an actual bridge callback, report the callback's session/revision:
await transport.delivery({ clientId, sessionId, revision, mode: 'even', status: 'bridge-accepted' });
```

`queue`, `clientId`, `sessionId` and `revision` above come from the existing application's queue and receipt callback; do not fabricate a receipt immediately after polling. Keep the original stale-frame blanking, sequential SDK writes and fail-closed timeout behavior when wiring a poll loop. The stock local-relay UI is not automatically switched to this transport by installation.

Sign-in must begin via top-level navigation to the Site's supported sign-in path. Whether the external Even WebView can complete and retain that private Site session is unresolved. Test top-level sign-in, cookie/session retention, API polling, reconnect after expiry, input delivery and sign-out on the actual device before calling the Site-to-glasses path operational. If this fails, use the already implemented local relay; no undocumented cookie copying, bypass-token embedding or inferred pairing is provided.

Receipts are client-reported observations. `browser-rendered` is allowed only in preview mode and `bridge-accepted` only in Even mode. Neither proves that pixels are visible on glasses; `hardwareVerified` stays false.

## TTL, retention and operational limits

Artifact TTL is **logical, lazy expiry**, enforced whenever the owner's state is accessed. Expired content is removed from returned state and that cleanup is persisted even when a stale write is rejected. It is not a timed physical-deletion guarantee: an idle D1 row can retain expired JSON until the next access. Journal/input IDs and receipts are bounded but durable. D1 backups may also retain older data.

For stricter retention, add and verify a supported scheduled cleanup path and backup policy before promising deletion by a deadline. No scheduler has been created here. Minimize sensitive content; this is a display cache, not a personal archive. Database cleanup/account deletion is an explicit operational action, not an undocumented side effect of a display clear. `display_clear` hides content but retains live artifacts; `display_delete` removes the selected artifact from current state.

The MCP transport is deliberately stateless: no transport session IDs or server-initiated SSE stream. `GET /mcp` returns 405; notifications are accepted with 202 and never execute data-bearing tool calls; batches are rejected. The server supports MCP protocol versions 2025-11-25, 2025-06-18 and 2025-03-26. Only the advertised tool methods are provided.

## Public references

- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [Upload and submit a plugin](https://developers.openai.com/plugins/deploy/submission)

Plugin submission and public distribution are separate from deploying and connecting a private Sites-generated plugin. Follow the current platform instructions at deployment time rather than treating this handoff as a guarantee of review or publication.

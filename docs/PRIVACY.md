# G2 Artifact Harness privacy policy draft

This draft describes the repository's current behavior. Before publishing a hosted app, its operator must identify their production service domain, support contact, hosting provider and any additional retention or access practices. This document does not assert that such a service is already running.

## Data used

The standalone demo uses bundled sample data and images. It does not request an account, microphone, camera, album, location or analytics permission.

When you connect a relay, the app sends its bearer token over HTTPS to authenticate requests to that specific relay. It receives artifact data and answer text, sends display inputs, and reports browser or bridge delivery status. These receipts do not prove that pixels were visible. An MCP client such as Codex can read and update that relay. Your model client's privacy settings and provider practices apply separately.

## Storage and deletion

In local-relay mode, artifact contents, display state and input history stay in relay/browser memory and have bounded size and expiry. Restarting the relay drops its artifact state. Clear blanks the display; Delete removes a selected artifact. Disconnected or suspended hardware can retain prior pixels until the next successful update.

Access tokens stay in tab memory by default. The packaged phone app offers an unchecked **Remember this connection on my phone** option. If selected, the app stores the relay origin and bearer token through Even's SDK local storage. This is not a hardware keystore. The saved token is restored only for the exact HTTPS origin configured in that package. **Forget saved connection** removes the saved value; the current in-memory session stays connected until the app closes or Local demo is selected. Revoke a token at your relay if the phone is lost.

No artifact text, image content or input journal is written into saved phone settings. The local relay's generated token is kept in its private ignored connection file. A hosting operator may have its own infrastructure access logs; review that operator's policy.

## Images, permissions and third parties

The current image templates use bundled diagram aliases. They do not fetch arbitrary remote images or access your photo library. The hosted package requests only network access to the exact configured relay origin. The zero-permission demo does not support remote relay use. Neither package records audio, changes firmware, pairs Bluetooth or reads Even account identity.

The repository configures no analytics or advertising service. The phone's Even app provides the native SDK and Bluetooth transport under Even's own terms and privacy practices. The relay operator and your model provider are distinct from this open-source project.

## Optional Sites-hosted mode

The source adapter in `packages/sites-mcp` uses the managed Site’s stable authenticated user ID to isolate durable D1 records. It can store artifact content, display state, bounded event history, input deduplication IDs and client-reported receipts. No Site or database has been provisioned by this source handoff.

Expiry is checked on access and removes expired artifacts from returned/current state; it does not guarantee physical deletion at a deadline. An idle row can retain expired JSON until accessed, and hosting backups can retain older content. Clear hides the current display while retaining live artifacts. Delete removes one artifact from current state; account/database deletion and backup cleanup are separate operator responsibilities.

The Sites transport uses same-origin managed sessions rather than phone-saved relay bearer tokens. Managed sign-in does not grant access to ChatGPT conversations or memory. The operator must verify hosting identity controls and document its hosting, access, retention and deletion practices before use. See [the Sites deployment guide](sites-mcp.md).

## Contact and changes

Project support: [repository](https://github.com/Nikhi-l/even-g2-codex-harness). Report security matters privately as described in [SECURITY.md](../SECURITY.md), without sharing credentials or private content. The production operator must provide a suitable contact and effective date before using this draft as a published policy.

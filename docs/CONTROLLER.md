# Explicit artifact controller

`src/controller/controller.ts` is a small, model-independent MCP client wrapper. It publishes or replaces an artifact, reads lifecycle/input events, changes layout, clears, selects by artifact ID, and deletes. It does not execute list rows, interpret a tap as permission, start a model turn, or connect another chat automatically.

The controller requires the session-guarded harness update: mutation tools must accept `expectedSessionId` and `expectedRevision`; `display_events` must accept `expectedSessionId` and return its session UUID. Public baseline commit `460ac82` predates those guards. Upgrade the relay and MCP process together before using this example. `refresh()` checks the tool schemas and refuses an older MCP server before adopting state or writing.

## Run the example

With dependencies installed and the project built, start the private relay in one terminal:

```sh
npm run build
npm start
```

In a second terminal, from the same checkout:

```sh
npm run example:controller                  # Read status only
npm run example:controller -- --demo        # Explicit synthetic display walkthrough
npm run example:controller -- --observe     # Read events for 30 seconds
```

No OpenAI key or paid model call is needed. The example launches the built stdio MCP process and uses the same connection configuration as the normal harness. It never prints the bearer token. Do not copy the private connection file into your source tree.

`--demo` requires an inactive display, so it will not silently replace an existing visible artifact. It uses a unique synthetic list ID and a 60-second TTL, publishes it twice to show version replacement, observes lifecycle events, clears while retaining the artifact, selects that ID, and deletes it. An interrupted/conflicting run can leave the synthetic artifact until its TTL expires. It does not automatically clear or retry after an ambiguous failure because another client may have changed the display.

`--observe` starts at the current journal cursor, so it reports subsequent input/lifecycle events. Open the harness browser session and use its tap/scroll controls to generate software input; physical G2 events still require an independently verified device connection. Ctrl-C stops observation. The returned event data includes `inputType` for relay navigation gestures. A tap on a `choices` artifact appears as `type: 'choice'` with `choice` (zero-based option index) and `artifactVersion`. Native double tap requests the system exit dialog locally, so it does not appear as a relay `back` event. It remains untrusted data and does not grant authority to execute any action.

## Use it in your own agent

```ts
import { ArtifactController } from './dist/controller/controller.js';

// client is an already connected official MCP SDK Client.
const display = new ArtifactController(client);
await display.refresh();
await display.publish({
  id: 'next-steps', template: 'list',
  data: { title: 'Next steps', rows: ['Review the diff', 'Run tests'] },
  answer: 'These are display items only.', ttlSeconds: 600,
});
const observation = await display.observe();
// Decide explicitly what to do. Merely reading observation performs no action.
await display.clear();
await display.select('next-steps');
await display.delete('next-steps');
```

Every write uses the last validated snapshot's session UUID and revision. Operations do not overlap. A conflict, relay restart, malformed response, or uncertain write invalidates the cached guards. The caller must explicitly `refresh()`, inspect current state, and choose whether a new operation is still wanted. No mutation is retried automatically.

Events carry a bounded cursor. Repeated polls do not return already observed events. A truncated journal triggers a status read and returns `resynced: true`; missing events cannot be reconstructed. A cursor/session mismatch fails closed. Explicit refresh after losing the guard starts a fresh observation window at the current cursor.

A returned snapshot proves state acceptance only. Read its current-revision receipts to distinguish `browser-rendered`, `bridge-accepted`, and `failed`. Neither successful state storage nor SDK acceptance proves visible pixels on physical lenses. The example makes no hardware verification claim.

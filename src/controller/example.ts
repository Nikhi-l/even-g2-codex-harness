import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ArtifactController, type ControllerState } from './controller.js';

const mode = process.argv.slice(2);
if (mode.length > 1 || (mode[0] && !['--demo', '--observe', '--help'].includes(mode[0]))) {
  console.error('Usage: npm run example:controller -- [--demo|--observe|--help]'); process.exitCode = 1;
} else if (mode[0] === '--help') {
  console.log('Default: read current status only. --observe: read events for 30 seconds. --demo: publish, replace, observe, clear, select, delete synthetic data on an inactive display. Requires npm start in another terminal. No model calls or hardware verification.');
} else {
  const client = new Client({ name: 'even-g2-controller-example', version: '0.1.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../server/mcp.js', import.meta.url))],
    env: { ...getDefaultEnvironment(),
      ...(process.env.G2_HARNESS_URL === undefined ? {} : { G2_HARNESS_URL: process.env.G2_HARNESS_URL }),
      ...(process.env.G2_HARNESS_TOKEN === undefined ? {} : { G2_HARNESS_TOKEN: process.env.G2_HARNESS_TOKEN }),
    },
  });
  const abort = new AbortController();
  const stop = () => abort.abort(); process.once('SIGINT', stop); process.once('SIGTERM', stop);
  const summarize = (state: ControllerState) => ({ sessionId: state.sessionId, revision: state.revision,
    activeId: state.activeId, artifacts: state.artifacts.map(item => ({ id: item.id, version: item.version })),
    deliveries: state.deliveries.map(item => ({ revision: item.revision, status: item.status, mode: item.mode })) });
  try {
    await client.connect(transport);
    const controller = new ArtifactController(client);
    const state = await controller.refresh(); console.log('Status:', JSON.stringify(summarize(state)));
    if (mode[0] === '--observe') {
      console.log('Observing for 30 seconds. Tap/scroll are data only; no action is triggered.');
      const until = Date.now() + 30_000;
      while (Date.now() < until && !abort.signal.aborted) {
        const result = await controller.observe();
        if (result.resynced || result.batch.events.length) console.log('Events:', JSON.stringify(result.batch));
        await delay(1000, undefined, { signal: abort.signal });
      }
    } else if (mode[0] === '--demo') {
      if (state.activeId !== null) throw new Error('Demo needs an inactive display. Clear it explicitly before running --demo.');
      const artifact = { id: `controller-demo-${randomUUID().slice(0, 8)}`, template: 'list' as const,
        data: { title: 'Controller walkthrough', rows: ['Publish structured data', 'Replace the same artifact', 'Observe without executing'] },
        answer: 'Synthetic example. These rows do not run commands.', ttlSeconds: 60 };
      for (const [label, operation] of [
        ['Published', () => controller.publish(artifact)],
        ['Replaced', () => controller.publish({ ...artifact, answer: 'The same ID now has a new version.' })],
      ] as const) console.log(`${label}:`, JSON.stringify(summarize(await operation())));
      console.log('Observed lifecycle:', JSON.stringify((await controller.observe()).batch));
      console.log('Cleared:', JSON.stringify(summarize(await controller.clear())));
      console.log('Selected by ID:', JSON.stringify(summarize(await controller.select(artifact.id))));
      console.log('Deleted:', JSON.stringify(summarize(await controller.delete(artifact.id))));
      console.log('Done. State acceptance is not a display receipt or proof of physical pixels.');
    }
  } catch (error) {
    if (!abort.signal.aborted) { console.error(error instanceof Error ? error.message : 'Controller failed'); process.exitCode = 1; }
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    await client.close();
  }
}

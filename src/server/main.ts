import { join } from 'node:path';
import { createHarnessServer } from './http.js';
import { projectRoot, serverConnection } from './config.js';

const host = process.env.G2_HARNESS_HOST ?? '127.0.0.1';
const port = Number(process.env.G2_HARNESS_PORT ?? 8787);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('G2_HARNESS_PORT must be 1024–65535');
const loopback = host === '127.0.0.1' || host === 'localhost';
if (!loopback && (process.env.G2_HARNESS_ALLOW_LAN !== '1' || !process.env.G2_HARNESS_ORIGIN || !process.env.G2_HARNESS_TOKEN)) {
  throw new Error('LAN requires G2_HARNESS_ALLOW_LAN=1, G2_HARNESS_ORIGIN, and a G2_HARNESS_TOKEN of at least 32 characters');
}
const connection = await serverConnection(`http://127.0.0.1:${port}`);
const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
if (process.env.G2_HARNESS_ORIGIN) {
  const origin = new URL(process.env.G2_HARNESS_ORIGIN);
  if (origin.origin !== process.env.G2_HARNESS_ORIGIN) throw new Error('G2_HARNESS_ORIGIN must be a full origin without path');
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('Origin must use HTTP or HTTPS');
  origins.push(origin.origin);
}
for (const allowed of (process.env.G2_HARNESS_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)) {
  const origin = new URL(allowed.trim());
  if (origin.origin !== allowed.trim() || !['http:', 'https:'].includes(origin.protocol)) throw new Error('Additional origins must be exact HTTP(S) origins');
  origins.push(origin.origin);
}
const { server } = createHarnessServer({ token: connection.token, origins, webRoot: join(projectRoot, 'dist/web') });
server.listen(port, host, () => {
  console.error(`Even G2 harness: ${connection.url}/`);
  if (loopback) console.error(`Open this private session link (do not share): ${connection.url}/#token=${connection.token}`);
  console.error('MCP: use the absolute path to dist/server/mcp.js. Artifact state is memory-only.');
  if (!loopback) console.error('LAN mode enabled: use only on a trusted network. HTTPS is required for production.');
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.close(); server.closeAllConnections(); });

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { z, ZodError } from 'zod';
import { CAPABILITIES, idSchema, layoutSchema } from '../core/contracts.js';
import { ConflictError, StateStore } from '../core/store.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { makeMcpServer } from './mcp-tools.js';

interface Options { token: string; origins: string[]; webRoot?: string; store?: StateStore }
const revision = z.number().int().nonnegative().optional();
const expectedSchema = z.strictObject({ expectedRevision: revision, expectedSessionId: z.string().uuid().optional() });
const selectSchema = expectedSchema.extend({ id: idSchema });
const publishSchema = expectedSchema.extend({ artifact: z.unknown() });
const MAX_BODY = 16_384;
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
async function body(request: IncomingMessage): Promise<unknown> {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Use application/json');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Uint8Array); size += buffer.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request exceeds 16 KiB');
    chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON'); }
}
function json(response: ServerResponse, code: number, data: unknown) {
  response.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

export function createHarnessServer(options: Options) {
  if (options.token.length < 32) throw new Error('Token must contain at least 32 characters');
  const store = options.store ?? new StateStore();
  const expectedAuth = Buffer.from(`Bearer ${options.token}`);
  const server = createServer(async (request, response) => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    response.setHeader('referrer-policy', 'no-referrer');
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' https: http://127.0.0.1:* http://localhost:*; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      if (!request.headers.host || !options.origins.some(allowed => new URL(allowed).host === request.headers.host)) throw new HttpError(403, 'Host not allowed');
      const origin = request.headers.origin;
      if (origin && !options.origins.includes(origin)) throw new HttpError(403, 'Origin not allowed');
      if (origin) {
        response.setHeader('access-control-allow-origin', origin);
        response.setHeader('vary', 'Origin');
      }
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'OPTIONS') {
        response.setHeader('access-control-allow-headers', 'authorization, content-type');
        response.setHeader('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
        response.writeHead(204); response.end(); return;
      }
      if (path === '/health' && request.method === 'GET') { json(response, 200, { ok: true, service: 'even-g2-harness' }); return; }
      if (!path.startsWith('/api/') && path !== '/mcp') {
        if (request.method !== 'GET' || !options.webRoot) throw new HttpError(404, 'Not found');
        const root = resolve(options.webRoot);
        const file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
        if (!file.startsWith(root + sep) || !mime[extname(file)]) throw new HttpError(404, 'Not found');
        try {
          const data = await readFile(file);
          response.writeHead(200, { 'content-type': mime[extname(file)]! }); response.end(data); return;
        } catch { throw new HttpError(404, 'Not found'); }
      }
      const auth = Buffer.from(request.headers.authorization ?? '');
      if (auth.length !== expectedAuth.length || !timingSafeEqual(auth, expectedAuth)) throw new HttpError(401, 'Valid bearer token required');
      const method = request.method;
      if (path === '/mcp') {
        if (method !== 'POST') throw new HttpError(405, 'Use stateless MCP POST requests');
        const data = await body(request);
        const address = server.address();
        if (!address || typeof address === 'string') throw new HttpError(503, 'Server not ready');
        const mcp = makeMcpServer({ url: `http://127.0.0.1:${address.port}`, token: options.token });
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        response.on('close', () => { void transport.close(); void mcp.close(); });
        await mcp.connect(transport);
        await transport.handleRequest(request, response, data);
        return;
      }
      if (method === 'GET' && path === '/api/state') { json(response, 200, store.snapshot()); return; }
      if (method === 'GET' && path === '/api/capabilities') { json(response, 200, CAPABILITIES); return; }
      if (method === 'GET' && path === '/api/events') {
        const query = new URL(request.url!, 'http://localhost').searchParams;
        const after = z.coerce.number().int().min(0).parse(query.get('after') ?? 0);
        const expectedSessionId = z.string().uuid().optional().parse(query.get('expectedSessionId') ?? undefined);
        json(response, 200, store.events(after, expectedSessionId)); return;
      }
      if (method === 'POST' && path === '/api/artifacts') {
        const data = publishSchema.parse(await body(request));
        json(response, 200, store.upsert(data.artifact, data.expectedRevision, data.expectedSessionId)); return;
      }
      if (method === 'POST' && path === '/api/select') {
        const data = selectSchema.parse(await body(request));
        json(response, 200, store.select(data.id, data.expectedRevision, data.expectedSessionId)); return;
      }
      if (method === 'POST' && path === '/api/layout') {
        const data = expectedSchema.extend({ layout: layoutSchema }).parse(await body(request));
        json(response, 200, store.setLayout(data.layout, data.expectedRevision, data.expectedSessionId)); return;
      }
      if (method === 'POST' && path === '/api/clear') {
        const data = expectedSchema.parse(await body(request));
        json(response, 200, store.clear(data.expectedRevision, data.expectedSessionId)); return;
      }
      if (method === 'DELETE' && path === '/api/artifacts') {
        const data = selectSchema.parse(await body(request));
        json(response, 200, store.remove(data.id, data.expectedRevision, data.expectedSessionId)); return;
      }
      if (method === 'POST' && path === '/api/input') { json(response, 200, store.input(await body(request))); return; }
      if (method === 'POST' && path === '/api/delivery') { json(response, 200, store.acknowledge(await body(request))); return; }
      throw new HttpError(404, 'Not found');
    } catch (error) {
      if (error instanceof HttpError) json(response, error.status, { error: error.message });
      else if (error instanceof ZodError) json(response, 400, { error: 'Invalid request', issues: error.issues.map(issue => issue.message) });
      else if (error instanceof ConflictError) json(response, 409, { error: error.message });
      else json(response, 500, { error: 'Internal server error' });
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  const ticker = setInterval(() => store.expire(), 1000);
  ticker.unref();
  server.on('close', () => clearInterval(ticker));
  return { server, store };
}

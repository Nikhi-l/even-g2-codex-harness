import { afterEach, expect, it, vi } from 'vitest';
import { SitesTransport } from '../src/client.js';
afterEach(() => vi.unstubAllGlobals());
it('uses same-origin session requests without identity or bearer headers', async () => {
  vi.stubGlobal('location', { origin: 'https://example.test' });
  const calls: { url: string; init?: RequestInit }[] = [];
  const request: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ revision: 1 }); };
  const client = new SitesTransport('https://example.test', request);
  await client.state();
  await client.input({ type: 'next', eventId: 'input-1', sessionId: '4ca22c98-1f22-4e3b-a7a4-fbb425b58e68', revision: 1 });
  expect(calls[0]?.url).toBe('https://example.test/api/state');
  expect(calls[0]?.init?.credentials).toBe('same-origin'); expect(calls[0]?.init?.redirect).toBe('error');
  expect(calls[1]?.init?.headers).toEqual({ 'content-type': 'application/json' });
  expect(() => new SitesTransport('https://other.test', request)).toThrow('current Site origin');
});
it('reports sign-in separately from generic request failures', async () => {
  vi.stubGlobal('location', { origin: 'https://example.test' });
  const client = new SitesTransport('https://example.test', async () => new Response(null, { status: 401 }));
  await expect(client.state()).rejects.toThrow('external WebView access is unverified');
});

import type { Delivery, DisplayInput, Snapshot } from '../../../src/core/contracts.js';
/** Same-origin, Sites-session transport. No bearer token or identity header is accepted.
 * External Even WebViews must pass the documented sign-in acceptance test first.
 */
export class SitesTransport {
  constructor(private readonly origin: string = location.origin, private readonly request = fetch) {
    if (new URL(origin).origin !== location.origin || !['https:', 'http:'].includes(new URL(origin).protocol)) throw new Error('Sites transport requires the current Site origin');
  }
  private async call(path: string, data?: unknown): Promise<Snapshot> {
    const response = await this.request(new URL(path, this.origin), { method: data === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
      headers: data === undefined ? {} : { 'content-type': 'application/json' },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    if (response.status === 401) throw new Error('Sign in to this Site in a top-level browser first; external WebView access is unverified');
    if (!response.ok) throw new Error(`Sites request failed (${response.status}); refresh state before retrying`);
    return await response.json() as Snapshot;
  }
  state() { return this.call('/api/state'); }
  input(input: DisplayInput) { return this.call('/api/input', input); }
  delivery(receipt: Omit<Delivery, 'at'>) { return this.call('/api/delivery', receipt); }
}

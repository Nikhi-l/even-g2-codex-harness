import { expire, freshState, operate, OperationError, type State } from './state.js';
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface D1Database { prepare(sql: string): D1Statement }
interface Row { version: number; body: string }
export interface StateRepository { execute(owner: string, name: string, args: Record<string, unknown>): Promise<unknown> }
export class D1Repository implements StateRepository {
  constructor(private db: D1Database, private now = Date.now) {}
  async execute(owner: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    // A single versioned row is the transaction boundary. Every query binds owner.
    // CAS includes receipt and input-dedup changes even when display revision stays unchanged.
    for (let attempt = 0; attempt < 5; attempt++) {
      const row = await this.db.prepare('SELECT version, body FROM even_display_state WHERE owner_id = ?').bind(owner).first<Row>();
      const s: State = row ? JSON.parse(row.body) as State : freshState();
      const before = JSON.stringify(s); const now = this.now();
      expire(s, now);
      const expired = JSON.stringify(s);
      let result: unknown; let error: unknown;
      try { result = operate(s, name, args, now); } catch (e) { error = e; }
      // Persist expiration even if the submitted revision is stale. Failed operations never persist partial state.
      const body = error ? expired : JSON.stringify(s);
      if (row && body === before) { if (error) throw error; return result; }
      if (new TextEncoder().encode(body).length > 262144) throw new OperationError('LIMIT', 'Stored state exceeds 256 KiB');
      const write = row
        ? await this.db.prepare('UPDATE even_display_state SET body = ?, version = version + 1, updated_at = ? WHERE owner_id = ? AND version = ?').bind(body, now, owner, row.version).run()
        : await this.db.prepare('INSERT OR IGNORE INTO even_display_state (owner_id, version, body, updated_at) VALUES (?, 0, ?, ?)').bind(owner, body, now).run();
      if (write.meta.changes === 1) { if (error) throw error; return result; }
    }
    throw new OperationError('BUSY', 'State is busy; refresh status before retrying');
  }
}

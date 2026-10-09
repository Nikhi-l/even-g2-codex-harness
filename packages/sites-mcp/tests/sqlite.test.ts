import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { D1Repository, type D1Database, type D1Statement } from '../src/repository.js';
import type { Snapshot } from '../../../src/core/contracts.js';
import { examples } from '../../../src/core/examples.js';
it('runs migration and bound repository SQL on real SQLite (not hosted D1)', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync(new URL('../deploy/schema.sql', import.meta.url), 'utf8'));
    const db: D1Database = { prepare(sql: string): D1Statement {
      const statement = sqlite.prepare(sql); let values: (string | number | null)[] = [];
      return { bind(...v) { values = v as typeof values; return this; },
        async first<T>() { return (statement.get(...values) ?? null) as T | null; },
        async run() { return { meta: { changes: Number(statement.run(...values).changes) } }; },
      };
    } };
    const repo = new D1Repository(db);
    const a = await repo.execute('owner-a', 'display_status', {}) as Snapshot;
    const b = await repo.execute('owner-b', 'display_status', {}) as Snapshot;
    await repo.execute('owner-a', 'show_artifact', { artifact: examples[0], expectedSessionId: a.sessionId, expectedRevision: a.revision });
    expect((await repo.execute('owner-b', 'display_status', {}) as Snapshot)).toEqual(b);
    expect((await repo.execute('owner-a', 'display_status', {}) as Snapshot).artifacts).toHaveLength(1);
    await expect(repo.execute('owner-a', 'display_clear', { expectedSessionId: a.sessionId, expectedRevision: a.revision })).rejects.toThrow('State changed');
    expect(sqlite.prepare('SELECT count(*) AS count FROM even_display_state').get()?.count).toBe(2);
  } finally { sqlite.close(); }
});

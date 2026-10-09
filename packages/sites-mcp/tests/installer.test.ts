import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
it('installs a preserving Sites overlay and refuses repeated writes or missing bundle', async () => {
  const root = await mkdtemp(join(tmpdir(), 'even-sites-overlay-'));
  try {
    const pkg = join(root, 'package'); const target = join(root, 'site');
    for (const p of ['package/scripts', 'package/deploy', 'package/dist', 'site/.openai', 'site/db']) await mkdir(join(root, p), { recursive: true });
    await copyFile(new URL('../scripts/install-overlay.mjs', import.meta.url), join(pkg, 'scripts/install-overlay.mjs'));
    await copyFile(new URL('../deploy/schema.ts', import.meta.url), join(pkg, 'deploy/schema.ts'));
    await writeFile(join(target, '.openai/hosting.json'), JSON.stringify({ project_id: 'synthetic-test-only', d1: null, r2: null, capabilities: ['existing'], plugins: ['preserve'] }));
    await writeFile(join(target, 'vite.config.ts'), 'sites()'); await writeFile(join(target, 'db/schema.ts'), '// existing schema\n');
    const run = () => execFileSync(process.execPath, [join(pkg, 'scripts/install-overlay.mjs'), target], { stdio: 'pipe' });
    expect(run).toThrow(); await expect(access(join(target, 'app'))).rejects.toThrow();
    await writeFile(join(pkg, 'dist/handler.js'), 'export const sitesFetch = () => {};');
    await writeFile(join(pkg, 'dist/LICENSE'), 'Synthetic fixture license');
    await writeFile(join(pkg, 'dist/THIRD_PARTY_NOTICES.md'), 'Synthetic fixture notices');
    await writeFile(join(pkg, 'dist/client.js'), 'export class SitesTransport {}');
    run();
    const manifest = JSON.parse(await readFile(join(target, '.openai/hosting.json'), 'utf8'));
    expect(manifest.capabilities).toEqual(['existing', 'mcp']); expect(manifest.plugins).toEqual(['preserve']); expect(manifest.d1).toBe('DB');
    const route = await readFile(join(target, 'app/api/state/route.ts'), 'utf8');
    expect(route).toContain('../../../lib/even-sites/handler.js'); expect(route).toContain('Managed Sites dispatch only');
    expect(await readFile(join(target, 'db/schema.ts'), 'utf8')).toContain('// existing schema');
    expect(run).toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});

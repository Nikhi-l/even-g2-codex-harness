import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2] && resolve(process.argv[2]);
if (!target) throw new Error('Usage: node scripts/install-overlay.mjs /absolute/path/to/initialized-sites-vinext-checkout');
await access(join(here, 'dist/handler.js'));
await access(join(here, 'dist/client.js'));
await access(join(here, 'dist/LICENSE'));
await access(join(here, 'dist/THIRD_PARTY_NOTICES.md'));
await access(join(here, 'deploy/schema.ts'));
const manifestPath = join(target, '.openai/hosting.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!manifest.project_id) throw new Error('Register the Site and persist project_id with Sites set-project-id first');
if (manifest.d1 && manifest.d1 !== 'DB') throw new Error('Existing D1 binding differs from DB; adapt the route explicitly');
const vite = await readFile(join(target, 'vite.config.ts'), 'utf8');
if (!vite.includes('sites(')) throw new Error('Expected the current Sites Vinext starter and its sites() integration');
const destinations = ['lib/even-sites/LICENSE', 'lib/even-sites/THIRD_PARTY_NOTICES.md', 'public/even-sites-client.js', 'lib/even-sites/handler.js', 'lib/even-sites/handler.d.ts', 'db/even-schema.ts', 'app/mcp/route.ts', 'app/api/state/route.ts', 'app/api/input/route.ts', 'app/api/delivery/route.ts'];
for (const path of destinations) {
  try { await access(join(target, path)); } catch { continue; }
  throw new Error(`Refusing to overwrite ${path}; merge updates manually`);
}
const schemaPath = join(target, 'db/schema.ts');
const originalSchema = await readFile(schemaPath, 'utf8');
for (const path of destinations) await mkdir(dirname(join(target, path)), { recursive: true });
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(join(here, 'dist', file), join(target, 'lib/even-sites', file));
await copyFile(join(here, 'dist/client.js'), join(target, 'public/even-sites-client.js'));
await copyFile(join(here, 'dist/handler.js'), join(target, 'lib/even-sites/handler.js'));
await writeFile(join(target, 'lib/even-sites/handler.d.ts'), 'export function sitesFetch(request: Request, env: { DB: unknown; EVEN_SITES_AUTH_BOUNDARY_VERIFIED?: string }): Promise<Response>;\n');
await copyFile(join(here, 'deploy/schema.ts'), join(target, 'db/even-schema.ts'));
await writeFile(schemaPath, originalSchema + '\nexport { evenDisplayState } from "./even-schema";\n');
for (const path of destinations.filter(p => p.endsWith('route.ts'))) {
  const depth = path.split('/').length - 1;
  const relative = '../'.repeat(depth) + 'lib/even-sites/handler.js';
  await writeFile(join(target, path), `// Managed Sites dispatch only. Never expose on a generic HTTP server or workers.dev.\n// Data access remains disabled until EVEN_SITES_AUTH_BOUNDARY_VERIFIED is explicitly configured.\nimport { env } from 'cloudflare:workers';\nimport { sitesFetch } from '${relative}';\nexport const dynamic = 'force-dynamic';\nconst handle = (request: Request) => sitesFetch(request, env as unknown as { DB: unknown; EVEN_SITES_AUTH_BOUNDARY_VERIFIED?: string });\nexport { handle as GET, handle as POST, handle as DELETE, handle as OPTIONS };\n`);
}
manifest.d1 = 'DB'; manifest.r2 ??= null;
manifest.capabilities = [...new Set([...(manifest.capabilities ?? []), 'mcp'])];
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('Installed server overlay. Run db:generate, inspect migrations, then use the Sites build/publish workflow. No deployment or credentials created.');

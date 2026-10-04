import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
const skip = new Set(['.git', 'node_modules', 'dist', '.local', 'test-results', 'playwright-report', 'coverage']);
const issues = [];
let count = 0;
async function walk(directory) {
 for (const entry of await readdir(directory, { withFileTypes: true })) {
  if (skip.has(entry.name)) continue;
  const path = join(directory, entry.name);
  if (entry.isSymbolicLink()) { issues.push(`${path}: symbolic link`); continue; }
  if (entry.isDirectory()) { await walk(path); continue; }
  if (entry.name.endsWith('.ehpk')) continue; // Generated package, excluded by .gitignore.
  if (/^\.env(?:\.|$)/.test(entry.name) && entry.name !== '.env.example') issues.push(`${path}: environment file`);
  if (/\.(pem|key|p12|ehpk|log)$/i.test(entry.name)) issues.push(`${path}: private/generated file type`);
  if (/\.(png|jpg|jpeg|webp)$/i.test(entry.name)) continue;
  const content = await readFile(path, 'utf8'); count++;
  const patterns = [
   /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
   /(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/,
   /sk-(?:proj-)?[A-Za-z0-9_-]{25,}/,
   /(?:AKIA|ASIA)[A-Z0-9]{16}/,
   /\/(?:Users|home)\/[a-zA-Z0-9_-]+\//,
  ];
  if (patterns.some(pattern => pattern.test(content))) issues.push(`${relative('.', path)}: possible sensitive data`);
 }
}
await walk('.');
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
else console.log(`Public file audit passed: ${count} text files; ignored private/build directories excluded. Review screenshots and Git contents separately.`);

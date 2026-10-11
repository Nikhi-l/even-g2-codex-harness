import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { join } from 'node:path';

const sdkVersion = '0.0.14';
const cliVersion = '0.1.14';
const directory = 'dist/social';
const output = '.local/sideband.ehpk';
const offline = process.argv.includes('--offline');
if (process.argv.slice(2).some(argument => argument !== '--offline')) throw new Error('Usage: node scripts/package-social.mjs [--offline]');
const manifest = JSON.parse(await readFile('app.social.json', 'utf8'));
const sdk = JSON.parse(await readFile('node_modules/@evenrealities/even_hub_sdk/package.json', 'utf8'));
const cli = JSON.parse(await readFile('node_modules/@evenrealities/evenhub-cli/package.json', 'utf8'));
if (sdk.version !== sdkVersion || cli.version !== cliVersion) throw new Error('Install the locked Sideband SDK and CLI versions before packaging.');
if (manifest.min_sdk_version !== sdkVersion || manifest.min_app_version !== sdk.minAppVersion) throw new Error('The manifest must match the installed SDK and its minimum app version.');
if (manifest.entrypoint !== 'social.html' || manifest.permissions?.length !== 0) throw new Error('The Sideband prototype must use social.html and request no permissions.');
await stat(join(directory, manifest.entrypoint));
await copyFile('LICENSE', join(directory, 'LICENSE.txt'));
const sdkLicense = await readFile('node_modules/@evenrealities/even_hub_sdk/LICENSE', 'utf8');
await writeFile(join(directory, 'THIRD_PARTY_NOTICES.txt'), `Sideband includes Even Hub SDK ${sdkVersion}.\n\n${sdkLicense}`);

const files = [];
async function inspect(relative = '') {
  for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
    const path = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Sideband output contains a symbolic link: ${path}`);
    if (entry.isDirectory()) {
      if (path !== 'assets') throw new Error(`Unexpected Sideband output directory: ${path}`);
      await inspect(path);
      continue;
    }
    if (!/^(?:social\.html|LICENSE\.txt|THIRD_PARTY_NOTICES\.txt|assets\/[A-Za-z0-9_.-]+\.(?:js|css))$/.test(path)) {
      throw new Error(`Unexpected Sideband output file: ${path}`);
    }
    const bytes = await readFile(join(directory, path));
    const content = bytes.toString('utf8');
    if (/\/(?:Users|home)\/[a-zA-Z0-9_-]+\/|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{25,}|(?:AKIA|ASIA)[A-Z0-9]{16}/.test(content)) {
      throw new Error(`Possible private data in Sideband output: ${path}`);
    }
    files.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
}
await inspect();
files.sort((a, b) => a.path.localeCompare(b.path));
await mkdir('.local', { recursive: true });
await rm(output, { force: true });

// Offline verification substitutes only the npm metadata lookup. The official
// CLI still validates the manifest and creates the actual package. No upload,
// account access, package-ID check, external API, or device call is performed.
let registry;
const environment = { ...process.env };
if (offline) {
  registry = createServer((request, response) => {
    if (request.url !== `/@evenrealities/even_hub_sdk/${sdkVersion}`) {
      response.writeHead(404); response.end(); return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ version: sdk.version, minAppVersion: sdk.minAppVersion }));
  });
  await new Promise((resolve, reject) => {
    registry.once('error', reject);
    registry.listen(0, '127.0.0.1', resolve);
  });
  const address = registry.address();
  if (!address || typeof address === 'string') throw new Error('Offline SDK metadata fixture failed to start.');
  environment.EVENHUB_NPM_REGISTRY = `http://127.0.0.1:${address.port}`;
}
try {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/@evenrealities/evenhub-cli/main.js', 'pack', 'app.social.json', directory, '--sdk-ver', sdkVersion, '-o', output], { stdio: 'inherit', shell: false, env: environment });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Sideband packaging failed (${code}).`)));
  });
} finally {
  if (registry) await new Promise((resolve, reject) => registry.close(error => error ? reject(error) : resolve()));
}
const packageBytes = await readFile(output);
if (packageBytes.subarray(0, 4).toString('ascii') !== 'EHPK') throw new Error('The official CLI did not produce an EHPK package.');
await writeFile('.local/sideband-files.json', JSON.stringify({
  package: output, packageBytes: packageBytes.length,
  packageSha256: createHash('sha256').update(packageBytes).digest('hex'),
  sdkVersion, cliVersion, metadataSource: offline ? 'installed-sdk-fixture' : 'npm-registry-or-cli-fallback',
  sourceManifest: manifest,
  files,
}, null, 2));
console.log(`Created ${output}; ${files.length} isolated web files. Inventory: .local/sideband-files.json.`);
if (offline) console.log('Offline validation used installed SDK metadata; package availability and live registry were not checked.');
console.log('Prototype only. No account, transcription, peer messaging, upload, publication, or physical-display verification.');

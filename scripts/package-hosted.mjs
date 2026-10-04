import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
function argument(name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
const origin = argument('--origin'); const packageId = argument('--package-id');
if (!origin || !packageId) throw new Error('Usage: npm run package:hosted -- --origin https://your-relay.example --package-id your.registered.package');
const url = new URL(origin);
if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password) throw new Error('Supply one HTTPS origin without a path, credentials, query or trailing slash');
if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*){2,}$/.test(packageId)) throw new Error('Use your registered reverse-domain package id');
function run(command, commandArgs) {
 const result = spawnSync(command, commandArgs, { stdio: 'inherit', shell: false });
 if (result.status !== 0) throw new Error(`${command} failed`);
}
run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']);
const manifest = JSON.parse(await readFile('app.json', 'utf8'));
manifest.package_id = packageId;
manifest.permissions = [{ name: 'network', desc: 'Read and update artifacts on your private relay.', whitelist: [origin] }];
await mkdir('.local', { recursive: true });
await writeFile('.local/app.hosted.json', JSON.stringify(manifest, null, 2));
await writeFile('dist/web/harness-config.json', JSON.stringify({ relayOrigin: origin }));
run(process.execPath, ['node_modules/@evenrealities/evenhub-cli/main.js', 'pack', '.local/app.hosted.json', 'dist/web', '--sdk-ver', '0.0.14', '-o', '.local/even-g2-harness.ehpk']);
console.log('Created .local/even-g2-harness.ehpk and .local/app.hosted.json. No token was embedded. Review the manifest before installing through Even Hub.');

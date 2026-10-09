import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
await writeFile('dist/web/harness-config.json', JSON.stringify({ relayOrigin: '', autoConnectEven: true }));
const result = spawnSync(process.execPath, ['node_modules/@evenrealities/evenhub-cli/main.js', 'pack', 'app.json', 'dist/web', '--sdk-ver', '0.0.14', '-o', 'even-g2-harness.ehpk'], { stdio: 'inherit' });
if (result.status !== 0) throw new Error('Demo packaging failed');
console.log('Local demo package created. Store submission and physical testing are still required.');

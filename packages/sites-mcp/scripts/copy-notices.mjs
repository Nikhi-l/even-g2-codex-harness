import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  await copyFile(fileURLToPath(new URL(`../../../${file}`, import.meta.url)), fileURLToPath(new URL(`../dist/${file}`, import.meta.url)));
}

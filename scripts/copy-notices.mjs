import { copyFile } from 'node:fs/promises';
await copyFile('THIRD_PARTY_NOTICES.md', 'dist/web/THIRD_PARTY_NOTICES.txt');

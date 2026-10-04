import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const connectionFile = fileURLToPath(new URL('../../.local/connection.json', import.meta.url));
const connectionSchema = z.strictObject({ url: z.string().url(), token: z.string().min(32) });
export async function readConnection() {
  if (process.env.G2_HARNESS_URL && process.env.G2_HARNESS_TOKEN) {
    return connectionSchema.parse({ url: process.env.G2_HARNESS_URL, token: process.env.G2_HARNESS_TOKEN });
  }
  if (process.env.G2_HARNESS_URL || process.env.G2_HARNESS_TOKEN) throw new Error('Set both G2_HARNESS_URL and G2_HARNESS_TOKEN');
  try { return connectionSchema.parse(JSON.parse(await readFile(connectionFile, 'utf8'))); }
  catch { throw new Error('Start the harness first with npm start, or provide G2_HARNESS_URL and G2_HARNESS_TOKEN'); }
}
export async function serverConnection(url: string) {
  let token = process.env.G2_HARNESS_TOKEN;
  if (!token) {
    try { token = connectionSchema.parse(JSON.parse(await readFile(connectionFile, 'utf8'))).token; }
    catch { token = randomBytes(32).toString('hex'); }
  }
  const connection = connectionSchema.parse({ url, token });
  await mkdir(new URL('../../.local/', import.meta.url), { recursive: true, mode: 0o700 });
  await writeFile(connectionFile, JSON.stringify(connection), { mode: 0o600 });
  return connection;
}

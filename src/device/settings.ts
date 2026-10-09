import { z } from 'zod';

export const SETTINGS_KEY = 'g2-artifact-relay-v1';
const settingsSchema = z.object({
  version: z.literal(1),
  origin: z.string().url().refine(value => {
    const url = new URL(value);
    return url.origin === value && url.protocol === 'https:';
  }),
  token: z.string().min(32).max(512),
}).strict();
export type RememberedRelay = z.infer<typeof settingsSchema>;
export function parseRememberedRelay(raw: string, allowedOrigin: string): RememberedRelay | null {
  if (!raw || raw.length > 2048 || !allowedOrigin) return null;
  try {
    const result = settingsSchema.safeParse(JSON.parse(raw));
    return result.success && result.data.origin === allowedOrigin ? result.data : null;
  } catch { return null; }
}
export function rememberRelay(origin: string, token: string, allowedOrigin: string): string {
  const serialized = JSON.stringify({ version: 1, origin, token });
  if (!parseRememberedRelay(serialized, allowedOrigin)) throw new Error('Only this package’s HTTPS relay can be remembered');
  return serialized;
}

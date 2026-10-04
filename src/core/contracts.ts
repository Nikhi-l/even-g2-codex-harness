import { z } from 'zod';

const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !/[\u0000-\u001f\u007f]/u.test(value), 'Use printable single-line text');
export const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/);
export const imageKeySchema = z.enum(['architecture', 'waveform', 'route', 'grid']);
const heading = { title: text(80).optional() };
export const templateSchemas = {
  list: z.strictObject({ ...heading, rows: z.array(z.union([text(160), z.strictObject({ label: text(24).optional(), value: text(160) })])).min(1).max(40) }),
  schedule: z.strictObject({ ...heading, events: z.array(z.strictObject({ time: text(16).optional(), title: text(100), location: text(60).optional(), tag: text(24).optional() })).min(1).max(30) }),
  image: z.strictObject({ src: imageKeySchema, caption: text(80).optional() }),
  image_grid: z.strictObject({ ...heading, items: z.array(z.strictObject({ src: imageKeySchema, label: text(40).optional() })).min(2).max(4) }),
  list_thumbnails: z.strictObject({ ...heading, rows: z.array(z.strictObject({ src: imageKeySchema.optional(), primary: text(80), secondary: text(80).optional() })).min(1).max(30) }),
  card: z.strictObject({ title: text(80), subtitle: text(80).optional(), src: imageKeySchema.optional(), rows: z.array(z.strictObject({ label: text(30), value: text(160) })).max(5).default([]) }),
  calendar: z.strictObject({ ...heading, month: z.string().regex(/^(20\d{2})-(0[1-9]|1[0-2])$/), marks: z.array(z.strictObject({ day: z.number().int().min(1).max(31), label: text(60).optional() })).max(31).default([]) }).superRefine((value, ctx) => {
    const [year, month] = value.month.split('-').map(Number);
    const last = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
    if (value.marks.some(mark => mark.day > last)) ctx.addIssue({ code: 'custom', message: 'Marked day does not exist in this month' });
  }),
};
const base = { id: idSchema, answer: z.string().max(2400).default(''), ttlSeconds: z.number().int().min(10).max(3600).default(600) };
export const artifactSchema = z.discriminatedUnion('template', [
  z.strictObject({ ...base, template: z.literal('list'), data: templateSchemas.list }),
  z.strictObject({ ...base, template: z.literal('schedule'), data: templateSchemas.schedule }),
  z.strictObject({ ...base, template: z.literal('image'), data: templateSchemas.image }),
  z.strictObject({ ...base, template: z.literal('image_grid'), data: templateSchemas.image_grid }),
  z.strictObject({ ...base, template: z.literal('list_thumbnails'), data: templateSchemas.list_thumbnails }),
  z.strictObject({ ...base, template: z.literal('card'), data: templateSchemas.card }),
  z.strictObject({ ...base, template: z.literal('calendar'), data: templateSchemas.calendar }),
]);
export type TemplateId = keyof typeof templateSchemas;
export type ArtifactInput = z.input<typeof artifactSchema>;
export type Artifact = z.output<typeof artifactSchema> & { version: number; expiresAt: number };
export const inputSchema = z.strictObject({ type: z.enum(['next', 'previous', 'select', 'back']), eventId: idSchema, sessionId: z.string().uuid(), revision: z.number().int().nonnegative() });
export type DisplayInput = z.infer<typeof inputSchema>;
export const layoutSchema = z.enum(['split', 'answer']);
export const deliverySchema = z.strictObject({
  clientId: idSchema, sessionId: z.string().uuid(), revision: z.number().int().nonnegative(),
  status: z.enum(['browser-rendered', 'bridge-accepted', 'failed']), mode: z.enum(['preview', 'even']), detail: z.string().max(160).optional(),
}).refine(value => value.status !== 'bridge-accepted' || value.mode === 'even', 'Only Even mode can accept bridge delivery')
  .refine(value => value.status !== 'browser-rendered' || value.mode === 'preview', 'Preview delivery requires preview mode');
export type Delivery = z.infer<typeof deliverySchema> & { at: number };
export interface DisplayFrame {
  sessionId: string; revision: number; artifact: Artifact | null; layout: 'split' | 'answer'; scroll: number;
  text: string; page: number; pages: number;
}
export interface HarnessEvent { sequence: number; at: number; type: string; artifactId: string | null; revision: number }
export interface Snapshot {
  sessionId: string; revision: number; activeId: string | null; artifacts: Artifact[];
  frame: DisplayFrame; deliveries: Delivery[]; latestEventSequence: number;
}
export const CAPABILITIES = Object.freeze({
  screen: { width: 576, height: 288, color: '4-bit green grayscale' },
  renderer: 'canvas-artifact-tiles-and-native-answer-text', templates: Object.keys(templateSchemas),
  imageKeys: imageKeySchema.options, input: ['next', 'previous', 'select', 'back'],
  maxArtifacts: 20, imageContainers: 2, textContainers: 1, hardwareVerified: false,
  microphone: false, directBluetooth: false, automaticAgentTurns: false, statePersistence: 'memory-only',
});

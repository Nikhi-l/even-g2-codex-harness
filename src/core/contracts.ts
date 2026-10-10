import { z } from 'zod';

const printable = (value: string) => !/[\u0000-\u001f\u007f]/u.test(value);
const text = (max: number) => z.string().trim().min(1).max(max).refine(printable, 'Use printable single-line text');
/** Code keeps indentation and blank lines but still rejects control characters (send spaces, not tabs). */
const codeText = z.string().max(100).refine(printable, 'Use printable single-line text; replace tabs with spaces');
export const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/);
export const speakerSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]{0,15}$/, 'Use a short name such as Claude or Codex');
export const imageKeySchema = z.enum(['architecture', 'waveform', 'route', 'grid', 'moonrise', 'ginkgo']);
export const turnSchema = z.enum(['straight', 'left', 'right', 'slight_left', 'slight_right', 'u_turn', 'lift', 'arrive']);
export const portraitKeySchema = z.enum(['portrait-mira', 'portrait-ren']);
export const backdropSchema = z.enum(['none', 'moonrise', 'ginkgo', 'contours', 'stars']);
export const motionModeSchema = z.enum(['breathe', 'orbit', 'sweep', 'listen']);
const phase = z.number().int().min(0).max(15).default(0);
const heading = { title: text(80).optional() };
export const templateSchemas = {
  portrait: z.strictObject({ name: text(32), subtitle: text(48).optional(), src: portraitKeySchema, note: text(48).optional() }),
  glance: z.strictObject({ title: text(32), value: text(12), detail: text(48).optional(), backdrop: backdropSchema.default('moonrise'), footer: text(32).optional() }),
  focus: z.strictObject({ title: text(32), value: text(12), detail: text(48).optional(), progress: z.number().min(0).max(1).default(0), backdrop: backdropSchema.default('stars') }),
  motion: z.strictObject({ title: text(32), detail: text(48).optional(), mode: motionModeSchema.default('breathe'), phase, backdrop: backdropSchema.default('none') }),
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
  checklist: z.strictObject({ ...heading, items: z.array(z.strictObject({ text: text(100), state: z.enum(['todo', 'active', 'done', 'blocked']).default('todo') })).min(1).max(30) }),
  choices: z.strictObject({ ...heading, options: z.array(text(60)).min(2).max(9) }),
  stat: z.strictObject({ ...heading, metrics: z.array(z.strictObject({
    label: text(24), value: text(10), unit: text(8).optional(), delta: text(10).optional(),
    trend: z.array(z.number().finite()).min(2).max(32).optional(),
  })).min(1).max(3) }),
  directions: z.strictObject({ destination: text(60), eta: text(16).optional(), distance: text(16).optional(),
    steps: z.array(z.strictObject({ turn: turnSchema, text: text(80), detail: text(60).optional(), distance: text(12).optional() })).min(1).max(20) }),
  code: z.strictObject({ ...heading, language: text(16).optional(),
    lines: z.array(z.union([codeText, z.strictObject({ text: codeText, kind: z.enum(['add', 'remove', 'context']).default('context') })])).min(1).max(60) }),
};
const base = { id: idSchema, answer: z.string().max(2400).default(''), ttlSeconds: z.number().int().min(10).max(3600).default(600), speaker: speakerSchema.optional() };
export const artifactSchema = z.discriminatedUnion('template', [
  z.strictObject({ ...base, template: z.literal('portrait'), data: templateSchemas.portrait }),
  z.strictObject({ ...base, template: z.literal('glance'), data: templateSchemas.glance }),
  z.strictObject({ ...base, template: z.literal('focus'), data: templateSchemas.focus }),
  z.strictObject({ ...base, template: z.literal('motion'), data: templateSchemas.motion }),

  z.strictObject({ ...base, template: z.literal('list'), data: templateSchemas.list }),
  z.strictObject({ ...base, template: z.literal('schedule'), data: templateSchemas.schedule }),
  z.strictObject({ ...base, template: z.literal('image'), data: templateSchemas.image }),
  z.strictObject({ ...base, template: z.literal('image_grid'), data: templateSchemas.image_grid }),
  z.strictObject({ ...base, template: z.literal('list_thumbnails'), data: templateSchemas.list_thumbnails }),
  z.strictObject({ ...base, template: z.literal('card'), data: templateSchemas.card }),
  z.strictObject({ ...base, template: z.literal('calendar'), data: templateSchemas.calendar }),
  z.strictObject({ ...base, template: z.literal('checklist'), data: templateSchemas.checklist }),
  z.strictObject({ ...base, template: z.literal('choices'), data: templateSchemas.choices }),
  z.strictObject({ ...base, template: z.literal('stat'), data: templateSchemas.stat }),
  z.strictObject({ ...base, template: z.literal('directions'), data: templateSchemas.directions }),
  z.strictObject({ ...base, template: z.literal('code'), data: templateSchemas.code }),
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
  /** Option the wearer chose on the active `choices` artifact, if any. */
  chosen: number | null;
}
export interface HarnessEvent {
  sequence: number; at: number; type: string; artifactId: string | null; revision: number;
  inputType?: DisplayInput['type']; artifactVersion?: number; choice?: number;
}
export interface Snapshot {
  sessionId: string; revision: number; activeId: string | null; artifacts: Artifact[];
  frame: DisplayFrame; deliveries: Delivery[]; latestEventSequence: number;
}
export const CAPABILITIES = Object.freeze({
  screen: { width: 576, height: 288, color: '4-bit green grayscale' },
  renderer: 'canvas-artifact-tiles-and-native-answer-text', templates: Object.keys(templateSchemas),
  imageKeys: imageKeySchema.options, portraitKeys: portraitKeySchema.options, input: ['next', 'previous', 'select', 'back'],
  answerText: { linesPerScreen: 10, rowsPerPage: 8, splitWidthPx: 260, fullWidthPx: 530, measuredWith: 'Even Hub simulator 0.9.5' },
  choices: 'On a choices artifact, tap records a choice event for the highlighted option; it never runs an action.',
  maxArtifacts: 20, imageContainers: 2, textContainers: 1, hardwareVerified: false,
  microphone: false, directBluetooth: false, automaticAgentTurns: false, statePersistence: 'memory-only',
  sessionGuard: true, eventsSession: true, nativeDoubleTap: 'system-exit-dialog',
});

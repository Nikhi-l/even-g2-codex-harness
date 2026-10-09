import type { ArtifactInput } from './contracts.js';

/**
 * Worst-case artifacts: every string at its schema maximum in wide glyphs and every list at its
 * maximum length. The gallery renders them with `?stress=1` and the browser suite checks that no
 * template draws into the edge of its 288 × 288 pane.
 */
const w = (length: number) => 'W'.repeat(length);
const answer = `${w(30)} ${'Wide words overflow narrow panes. '.repeat(70)}`.slice(0, 2400);
export const stressArtifacts: ArtifactInput[] = [
  { id: 'stress-list', template: 'list', answer, data: { title: w(80), rows: Array.from({ length: 40 }, () => ({ label: w(24), value: w(160) })) } },
  { id: 'stress-schedule', template: 'schedule', answer, data: { title: w(80), events: Array.from({ length: 30 }, () => ({ time: w(16), title: w(100), location: w(60), tag: w(24) })) } },
  { id: 'stress-image', template: 'image', answer, data: { src: 'architecture', caption: w(80) } },
  { id: 'stress-image-grid', template: 'image_grid', answer, data: { title: w(80), items: Array.from({ length: 4 }, () => ({ src: 'grid' as const, label: w(40) })) } },
  { id: 'stress-thumbnails', template: 'list_thumbnails', answer, data: { title: w(80), rows: Array.from({ length: 30 }, () => ({ src: 'route' as const, primary: w(80), secondary: w(80) })) } },
  { id: 'stress-card', template: 'card', answer, data: { title: w(80), subtitle: w(80), src: 'waveform', rows: Array.from({ length: 5 }, () => ({ label: w(30), value: w(160) })) } },
  { id: 'stress-calendar', template: 'calendar', answer, data: { title: w(80), month: '2026-12', marks: Array.from({ length: 31 }, (_, day) => ({ day: day + 1, label: w(60) })) } },
  { id: 'stress-checklist', template: 'checklist', answer, data: { title: w(80), items: Array.from({ length: 30 }, (_, index) => ({ text: w(100), state: (['done', 'active', 'todo', 'blocked'] as const)[index % 4] })) } },
  { id: 'stress-choices', template: 'choices', answer, data: { title: w(80), options: Array.from({ length: 9 }, () => w(60)) } },
  { id: 'stress-stat', template: 'stat', answer, data: { title: w(80), metrics: Array.from({ length: 3 }, (_, index) => ({ label: w(24), value: w(10), unit: w(8), delta: index % 2 ? `-${w(9)}` : `+${w(9)}`, trend: Array.from({ length: 32 }, (_, x) => Math.sin(x / 3) * 100) })) } },
  { id: 'stress-stat-one', template: 'stat', answer, data: { metrics: [{ label: w(24), value: w(10), unit: w(8), delta: `+${w(9)}`, trend: Array.from({ length: 32 }, (_, x) => x * x) }] } },
  { id: 'stress-directions', template: 'directions', answer, data: { destination: w(60), eta: w(16), distance: w(16), steps: Array.from({ length: 20 }, (_, index) => ({ turn: (['straight', 'left', 'right', 'slight_left', 'slight_right', 'u_turn', 'lift', 'arrive'] as const)[index % 8]!, text: w(80), detail: w(60), distance: w(12) })) } },
  { id: 'stress-code', template: 'code', answer, data: { title: w(80), language: w(16), lines: Array.from({ length: 60 }, (_, index) => ({ text: ' '.repeat(index % 8) + w(92), kind: (['add', 'remove', 'context'] as const)[index % 3] })) } },
];

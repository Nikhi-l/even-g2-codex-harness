import type { ArtifactInput } from './contracts.js';

/** Extra variants are kept out of the one-per-template main catalog. All people and values are fictional. */
export const quietExamples: ArtifactInput[] = [
  { id: 'quiet-mira', template: 'portrait', data: { name: 'Mira', src: 'portrait-mira', subtitle: 'Here when you need me.', note: 'YOUR FICTIONAL ASSISTANT' }, answer: 'Mira is an AI-generated fictional person. This portrait is a visual theme, not a live contact.', speaker: 'Codex' },
  { id: 'quiet-ren', template: 'portrait', data: { name: 'Ren', src: 'portrait-ren', subtitle: 'A little space to think.', note: 'YOUR FICTIONAL ASSISTANT' }, answer: 'Ren is an AI-generated fictional person. No real person is represented.', speaker: 'Codex' },
  { id: 'quiet-moon', template: 'glance', data: { title: 'Up next', value: '09:40', detail: 'A moment to prepare.', backdrop: 'moonrise', footer: 'ONE SMALL STEP' }, answer: 'A quiet glance card with a lunar backdrop. This is sample information.', speaker: 'Codex' },
  { id: 'quiet-leaf', template: 'glance', data: { title: 'A little pause', value: 'Breathe', detail: 'Look up. Rest your eyes.', backdrop: 'ginkgo', footer: 'ROOM TO THINK' }, answer: 'A botanical pause card. Keep this background still and let the short message do the work.', speaker: 'Codex' },
  { id: 'quiet-focus', template: 'focus', data: { title: 'Deep work', value: '24:00', detail: 'One step at a time.', progress: 0.35, backdrop: 'stars' }, answer: 'Focus dial preview. The time and progress are supplied values, not a running countdown.', speaker: 'Codex' },
  { id: 'quiet-contours', template: 'glance', data: { title: 'A clear direction', value: '120 m', detail: 'Turn right at next street.', backdrop: 'contours', footer: 'DEMO ROUTE' }, answer: 'Example route information with static contour details. No live navigation is connected.', speaker: 'Codex' },
  ...(['breathe', 'orbit', 'sweep', 'listen'] as const).map(mode => ({
    id: `quiet-${mode}`, template: 'motion' as const, speaker: 'Codex',
    data: { title: { breathe: 'A slower moment', orbit: 'Working on it', sweep: 'One step forward', listen: 'Voice preview' }[mode], detail: 'A little room to think.', mode, phase: 0, backdrop: 'none' as const },
    answer: mode === 'listen' ? 'These bars are decorative demo motion. They do not indicate that a microphone is recording.' : 'A small animated indicator. Motion starts only when you press Play in the Quiet Surfaces studio.',
  })),
];

export const quietDefaults = ['portrait', 'glance', 'focus', 'motion'].map(template => quietExamples.find(example => example.template === template)!);

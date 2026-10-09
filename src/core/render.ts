import type { Artifact, DisplayFrame, DisplayInput } from './contracts.js';
import { G2_TEXT, fitText, textWidth, wrapText } from './text.js';

/** Answer rows per page: the screen's ten lines minus the header and a blank separator. */
export const ANSWER_ROWS = G2_TEXT.maxLines - 2;
/** Rows each scrolling template draws at once. Templates import these so scroll bounds and pixels agree. */
export const VISIBLE_ROWS = Object.freeze({ list: 7, schedule: 5, list_thumbnails: 5, checklist: 7, code: 13 });
type Layout = 'split' | 'answer';
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function maxScroll(artifact: Artifact): number {
  switch (artifact.template) {
    case 'list': return Math.max(0, artifact.data.rows.length - VISIBLE_ROWS.list);
    case 'schedule': return Math.max(0, artifact.data.events.length - VISIBLE_ROWS.schedule);
    case 'list_thumbnails': return Math.max(0, artifact.data.rows.length - VISIBLE_ROWS.list_thumbnails);
    case 'checklist': return Math.max(0, artifact.data.items.length - VISIBLE_ROWS.checklist);
    case 'code': return Math.max(0, artifact.data.lines.length - VISIBLE_ROWS.code);
    // Scroll moves the highlighted option or the current step, not a window.
    case 'choices': return artifact.data.options.length - 1;
    case 'directions': return artifact.data.steps.length - 1;
    default: return 0;
  }
}
export function answerRows(answer: string, layout: Layout): string[] {
  return layout === 'split' ? wrapText(answer, G2_TEXT.splitWidth, G2_TEXT.splitChars) : wrapText(answer, G2_TEXT.fullWidth, G2_TEXT.fullChars);
}
export function pageCount(answer: string, layout: Layout): number {
  return Math.max(1, Math.ceil(answerRows(answer, layout).length / ANSWER_ROWS));
}
function header(artifact: Artifact, page: number, pages: number, layout: Layout): string {
  const marker = pages > 1 ? `  ${page + 1}/${pages}` : '';
  const width = (layout === 'split' ? G2_TEXT.splitWidth : G2_TEXT.fullWidth) - textWidth(marker);
  return fitText((artifact.speaker ?? 'Agent').toUpperCase(), width) + marker;
}
export function render(artifact: Artifact | undefined, scroll: number, answerPage: number, layout: Layout, revision: number, sessionId: string, chosen: number | null = null): DisplayFrame {
  if (!artifact) return { sessionId, revision, artifact: null, layout: 'answer', scroll: 0, page: 0, pages: 1, text: '', chosen: null };
  const rows = answerRows(artifact.answer, layout);
  const pages = Math.max(1, Math.ceil(rows.length / ANSWER_ROWS));
  const page = clamp(answerPage, 0, pages - 1);
  const text = [header(artifact, page, pages, layout), '', ...rows.slice(page * ANSWER_ROWS, page * ANSWER_ROWS + ANSWER_ROWS)].join('\n');
  return { sessionId, revision, artifact, layout, scroll: clamp(scroll, 0, maxScroll(artifact)), page, pages, text,
    chosen: artifact.template === 'choices' && chosen !== null ? clamp(chosen, 0, maxScroll(artifact)) : null };
}

export interface Navigation { layout: Layout; scroll: number; answerPage: number }
/**
 * One gesture's effect on the visible state, shared by the local relay and the Sites adapter.
 * A tap on a split `choices` artifact reports the highlighted option instead of toggling the pane.
 */
export function navigate(artifact: Artifact, current: Navigation, type: DisplayInput['type']): { next: Navigation; event: string; choice?: number } {
  if (type === 'select' && artifact.template === 'choices' && current.layout === 'split') {
    return { next: current, event: 'choice', choice: clamp(current.scroll, 0, maxScroll(artifact)) };
  }
  if (type === 'back' || type === 'select') {
    const layout = type === 'back' || current.layout === 'split' ? 'answer' : 'split';
    return { next: { ...current, layout, answerPage: 0 }, event: `layout:${layout}` };
  }
  const direction = type === 'next' ? 1 : -1;
  if (current.layout === 'split') return { next: { ...current, scroll: clamp(current.scroll + direction, 0, maxScroll(artifact)) }, event: `input:${type}` };
  return { next: { ...current, answerPage: clamp(current.answerPage + direction, 0, pageCount(artifact.answer, 'answer') - 1) }, event: `input:${type}` };
}

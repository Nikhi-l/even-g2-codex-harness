import type { Artifact, DisplayFrame } from './contracts.js';
export function columns(text: string): number {
  return [...text].reduce((width, char) => width + (/[^\u0000-\u00ff]/u.test(char) ? 2 : 1), 0);
}
export function wrap(text: string, limit: number): string[] {
  const rows: string[] = [];
  for (const paragraph of text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/gu, ' ').split('\n')) {
    let row = '';
    for (const word of paragraph.split(/\s+/u)) {
      if (columns((row ? row + ' ' : '') + word) <= limit) { row += (row ? ' ' : '') + word; continue; }
      if (row) rows.push(row);
      row = '';
      for (const char of word) {
        if (columns(row + char) > limit) { rows.push(row); row = ''; }
        row += char;
      }
    }
    rows.push(row);
  }
  return rows.length ? rows : [''];
}
export function maxScroll(artifact: Artifact): number {
  switch (artifact.template) {
    case 'list': return Math.max(0, artifact.data.rows.length - 7);
    case 'schedule': return Math.max(0, artifact.data.events.length - 5);
    case 'list_thumbnails': return Math.max(0, artifact.data.rows.length - 5);
    default: return 0;
  }
}
export function render(artifact: Artifact | undefined, scroll: number, answerPage: number, layout: 'split' | 'answer', revision: number, sessionId: string): DisplayFrame {
  if (!artifact) return { sessionId, revision, artifact: null, layout: 'answer', scroll: 0, page: 0, pages: 1, text: '' };
  const rows = wrap(artifact.answer, layout === 'split' ? 21 : 43);
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const page = Math.min(Math.max(answerPage, 0), pages - 1);
  const text = ['CODEX', '', ...rows.slice(page * 10, page * 10 + 10), ...(pages > 1 ? [`${page + 1}/${pages}`] : [])].join('\n');
  return { sessionId, revision, artifact, layout, scroll: Math.min(Math.max(scroll, 0), maxScroll(artifact)), page, pages, text };
}

/**
 * Native text metrics for the G2 firmware font.
 *
 * The firmware draws text containers with one proportional font, wraps at the
 * container width, and scrolls an event-capture container whose text overflows.
 * Scrolling steals the wearer's scroll gesture from the artifact, so every frame
 * must fit without wrapping. Advances were measured in the official Even Hub
 * simulator 0.9.5 (see docs/DISPLAY.md); budgets keep a margin for hardware.
 */

/** Advance width in pixels for printable ASCII, U+0020 to U+007E. */
const ASCII_ADVANCE = [
  5, 4, 6, 14, 12, 14, 15, 4, 6, 6, 8, 10, 5, 10, 5, 5, 12, 7, 11, 12, 12, 12, 12, 12, 12, 12, 4, 5, 10, 10, 10, 12,
  17, 13, 12, 11, 12, 10, 10, 12, 12, 5, 8, 12, 9, 16, 12, 12, 12, 12, 12, 11, 10, 12, 13, 16, 13, 13, 12, 7, 5, 7, 10, 9,
  6, 11, 11, 10, 11, 10, 7, 11, 11, 5, 5, 9, 4, 16, 11, 10, 11, 11, 7, 10, 6, 11, 11, 15, 11, 11, 9, 8, 4, 8, 16,
];

export const G2_TEXT = Object.freeze({
  /** Line pitch of the firmware font. */
  lineHeight: 27,
  /** Lines fully visible in a 288 px tall container with 6 px padding. */
  maxLines: 10,
  /** Wrap budgets: 288 or 576 px containers, minus padding and a hardware margin. */
  splitWidth: 260,
  fullWidth: 530,
  /** Character caps keep a page under the SDK's 1000-character startup limit. */
  splitChars: 48,
  fullChars: 96,
});

function advance(char: string): number {
  const code = char.codePointAt(0)!;
  if (code >= 32 && code <= 126) return ASCII_ADVANCE[code - 32]!;
  if (code < 0x2000) return 13; // Latin supplements, Greek, Cyrillic
  if (code < 0x2e80) return 20; // punctuation, arrows, symbols, box drawing
  return 24; // CJK, Hangul, full-width forms, emoji
}

export function textWidth(text: string): number {
  let width = 0;
  for (const char of text) width += advance(char);
  return width;
}

/** Word-wrap into rows that each fit `maxWidth` pixels and `maxChars` characters. */
export function wrapText(text: string, maxWidth: number, maxChars: number): string[] {
  const rows: string[] = [];
  const fits = (value: string) => textWidth(value) <= maxWidth && [...value].length <= maxChars;
  for (const paragraph of text.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/gu, ' ').split('\n')) {
    let row = '';
    for (const word of paragraph.split(/\s+/u).filter(Boolean)) {
      const joined = row ? `${row} ${word}` : word;
      if (fits(joined)) { row = joined; continue; }
      if (row) rows.push(row);
      row = '';
      for (const char of word) {
        if (row && !fits(row + char)) { rows.push(row); row = ''; }
        row += char;
      }
    }
    rows.push(row);
  }
  return rows.length ? rows : [''];
}

/** Truncate one line to `maxWidth` pixels, ending with three dots when shortened. */
export function fitText(text: string, maxWidth: number): string {
  if (textWidth(text) <= maxWidth) return text;
  const chars = [...text];
  while (chars.length && textWidth(`${chars.join('')}...`) > maxWidth) chars.pop();
  return `${chars.join('').trimEnd()}...`;
}

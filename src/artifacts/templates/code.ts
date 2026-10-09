// `code` template: a short monospace snippet or diff hunk. Lines keep their
// indentation; added and removed lines get a gutter marker. Scroll moves by line.

import { VISIBLE_ROWS } from "../../core/render.js";
import { ARTIFACT_FONT, fitCanvasText } from "../render.js";
import { registerTemplate } from "../registry.js";
import type { RenderContext } from "../types.js";

type LineKind = "add" | "remove" | "context";
type CodeLine = { text: string; kind: LineKind };
type CodeData = { title?: string; language?: string; lines?: Array<string | { text: string; kind?: LineKind }> };

/** Truncates without collapsing spaces, so indentation survives. */
function fitCode(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let next = text;
  while (next.length > 1 && ctx.measureText(`${next}…`).width > maxWidth) next = next.slice(0, -1);
  return `${next}…`;
}

registerTemplate({
  id: "code",
  title: "Code",
  dataHint:
    "monospace snippet or diff hunk. data: { title?: string, language?: string, lines: Array<string | { text: string, kind?: 'add' | 'remove' | 'context' }> } (indent with spaces)",
  render(rc: RenderContext, raw: unknown): void {
    const { ctx, width, height, colors } = rc;
    const data = (raw ?? {}) as CodeData;
    const lines: CodeLine[] = (Array.isArray(data.lines) ? data.lines : []).map((line) =>
      typeof line === "string" ? { text: line, kind: "context" } : { text: String(line?.text ?? ""), kind: line?.kind ?? "context" });
    const padX = 12;

    ctx.font = `700 12px ${ARTIFACT_FONT}`;
    const language = data.language ? data.language.toUpperCase() : "";
    const languageWidth = language ? ctx.measureText(language).width : 0;
    if (language) {
      ctx.fillStyle = colors.dim;
      ctx.fillText(language, width - padX - languageWidth, 22);
    }
    ctx.fillStyle = colors.green;
    ctx.font = `800 14px ${ARTIFACT_FONT}`;
    ctx.fillText(fitCanvasText(ctx, (data.title ?? "CODE").toUpperCase(), width - padX * 2 - languageWidth - 10), padX, 22);
    ctx.strokeStyle = colors.panel;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, 30);
    ctx.lineTo(width - padX, 30);
    ctx.stroke();

    const lineHeight = 18;
    const top = 48;
    const visible = VISIBLE_ROWS.code;
    const maxStart = Math.max(0, lines.length - visible);
    const start = Math.min(Math.max(0, Math.floor(rc.view.scroll)), maxStart);
    const gutter = 16;
    lines.slice(start, start + visible).forEach((line, index) => {
      const y = top + index * lineHeight;
      if (line.kind === "add") {
        ctx.fillStyle = colors.panel;
        ctx.fillRect(padX - 4, y - 13, 3, lineHeight - 2);
      }
      ctx.fillStyle = line.kind === "context" ? colors.dim : colors.green;
      ctx.font = `800 12px ${ARTIFACT_FONT}`;
      ctx.fillText(line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ", padX, y);
      ctx.fillStyle = line.kind === "remove" ? colors.dim : colors.green;
      ctx.font = `${line.kind === "add" ? 700 : 400} 12px ${ARTIFACT_FONT}`;
      const text = fitCode(ctx, line.text, width - padX * 2 - gutter);
      ctx.fillText(text, padX + gutter, y);
      if (line.kind === "remove" && text.trim()) {
        const indent = ctx.measureText(text.match(/^ */u)![0]).width;
        ctx.strokeStyle = colors.dim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padX + gutter + indent, y - 4);
        ctx.lineTo(padX + gutter + ctx.measureText(text).width, y - 4);
        ctx.stroke();
      }
    });

    if (lines.length > visible) {
      ctx.fillStyle = colors.dim;
      ctx.font = `700 11px ${ARTIFACT_FONT}`;
      const marker = `${start + 1}-${Math.min(lines.length, start + visible)}/${lines.length}`;
      ctx.fillText(marker, width - padX - ctx.measureText(marker).width, height - 6);
    }
  }
});

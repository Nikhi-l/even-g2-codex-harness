// `list` template: a scrolling vertical list of text rows. Each row is a value
// with an optional dim label/prefix. The visible window is driven by view.scroll
// so the surface can scroll it incrementally.

import { ARTIFACT_FONT, fitCanvasText, strokeRoundRect } from "../render.js";
import { registerTemplate } from "../registry.js";
import type { RenderContext } from "../types.js";

type ListRow = { label?: string; value: string };
type ListData = { title?: string; rows?: Array<ListRow | string> };

function normalizeRows(rows: ListData["rows"]): ListRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (typeof row === "string" ? { value: row } : row))
    .filter((row): row is ListRow => Boolean(row && typeof row.value === "string"));
}

registerTemplate({
  id: "list",
  title: "List",
  dataHint: "scrolling text list. data: { title?: string, rows: Array<{ label?: string, value: string } | string> }",
  render(rc: RenderContext, raw: unknown): void {
    const { ctx, width, height, colors } = rc;
    const data = (raw ?? {}) as ListData;
    const rows = normalizeRows(data.rows);
    const padX = 16;
    const innerW = width - padX * 2;

    // Header
    ctx.fillStyle = colors.green;
    ctx.font = `800 15px ${ARTIFACT_FONT}`;
    ctx.fillText(fitCanvasText(ctx, (data.title ?? "LIST").toUpperCase(), innerW), padX, 26);
    ctx.strokeStyle = colors.panel;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, 34);
    ctx.lineTo(width - padX, 34);
    ctx.stroke();

    // Rows (windowed by scroll)
    const rowHeight = 30;
    const top = 52;
    const visibleCount = Math.max(1, Math.floor((height - top - 6) / rowHeight));
    const maxStart = Math.max(0, rows.length - visibleCount);
    const start = Math.min(Math.max(0, Math.floor(rc.view.scroll)), maxStart);
    const window = rows.slice(start, start + visibleCount);

    window.forEach((row, index) => {
      const absolute = start + index;
      const y = top + index * rowHeight;
      // Inline dim label (or row number) to the left of the value.
      ctx.fillStyle = colors.dim;
      ctx.font = `700 13px ${ARTIFACT_FONT}`;
      const marker = fitCanvasText(ctx, row.label ? `${row.label}` : `${absolute + 1}`, 56);
      ctx.fillText(marker, padX, y + 3);
      const markerWidth = ctx.measureText(marker).width;
      const valueX = padX + Math.max(18, markerWidth + 10);
      ctx.fillStyle = colors.green;
      ctx.font = `700 15px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, row.value, width - valueX - padX), valueX, y + 3);
    });

    // Scroll affordance
    if (rows.length > visibleCount) {
      ctx.strokeStyle = colors.panel;
      ctx.lineWidth = 1;
      strokeRoundRect(ctx, width - 7, top - 12, 3, height - top - 4, 1.5);
      const trackH = height - top - 8;
      const thumbH = Math.max(14, (visibleCount / rows.length) * trackH);
      const thumbY = top - 10 + (start / Math.max(1, maxStart)) * (trackH - thumbH);
      ctx.fillStyle = colors.green;
      ctx.fillRect(width - 7, thumbY, 3, thumbH);
    }
  }
});

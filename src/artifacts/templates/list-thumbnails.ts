// `list_thumbnails` template: a scrolling list where each row has a small
// square image, a primary line and an optional secondary line.

import { ARTIFACT_FONT, drawCoverImage, fitCanvasText, roundRectPath, strokeRoundRect } from "../render.js";
import { registerTemplate } from "../registry.js";
import type { RenderContext } from "../types.js";

type ThumbRow = { src?: string; primary: string; secondary?: string };
type ThumbData = { title?: string; rows?: ThumbRow[] };

function normalizeRows(rows: ThumbData["rows"]): ThumbRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is ThumbRow => Boolean(row && typeof row.primary === "string"));
}

registerTemplate({
  id: "list_thumbnails",
  title: "List with thumbnails",
  dataHint:
    "scrolling list with small images. data: { title?: string, rows: Array<{ src?: string (bundled image key), primary: string, secondary?: string }> }",
  images: (raw) => normalizeRows(((raw ?? {}) as ThumbData).rows).flatMap((row) => (row.src ? [row.src] : [])),
  render(rc: RenderContext, raw: unknown): void {
    const { ctx, width, height, colors } = rc;
    const data = (raw ?? {}) as ThumbData;
    const rows = normalizeRows(data.rows);
    const padX = 16;
    const innerW = width - padX * 2;

    ctx.fillStyle = colors.green;
    ctx.font = `800 15px ${ARTIFACT_FONT}`;
    ctx.fillText(fitCanvasText(ctx, (data.title ?? "LIST").toUpperCase(), innerW), padX, 26);
    ctx.strokeStyle = colors.panel;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, 34);
    ctx.lineTo(width - padX, 34);
    ctx.stroke();

    const rowHeight = 46;
    const top = 46;
    const thumb = 36;
    const visibleCount = Math.max(1, Math.floor((height - top - 6) / rowHeight));
    const maxStart = Math.max(0, rows.length - visibleCount);
    const start = Math.min(Math.max(0, Math.floor(rc.view.scroll)), maxStart);
    const window = rows.slice(start, start + visibleCount);

    window.forEach((row, index) => {
      const y = top + index * rowHeight;
      const image = rc.image(row.src);
      ctx.strokeStyle = colors.panel;
      ctx.lineWidth = 1;
      strokeRoundRect(ctx, padX, y, thumb, thumb, 5);
      if (image) {
        ctx.save();
        ctx.beginPath();
        roundRectPath(ctx, padX + 1, y + 1, thumb - 2, thumb - 2, 4);
        ctx.clip();
        drawCoverImage(ctx, image, padX + 1, y + 1, thumb - 2, thumb - 2);
        ctx.restore();
      } else {
        ctx.fillStyle = colors.panel;
        ctx.fillRect(padX + 1, y + 1, thumb - 2, thumb - 2);
      }

      const textX = padX + thumb + 12;
      const textW = width - textX - padX;
      ctx.fillStyle = colors.green;
      ctx.font = `700 14px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, row.primary, textW), textX, y + 15);
      if (row.secondary) {
        ctx.fillStyle = colors.dim;
        ctx.font = `700 12px ${ARTIFACT_FONT}`;
        ctx.fillText(fitCanvasText(ctx, row.secondary, textW), textX, y + 32);
      }
    });

    if (rows.length > visibleCount) {
      ctx.strokeStyle = colors.panel;
      ctx.lineWidth = 1;
      strokeRoundRect(ctx, width - 7, top, 3, height - top - 8, 1.5);
      const trackH = height - top - 12;
      const thumbH = Math.max(14, (visibleCount / rows.length) * trackH);
      const thumbY = top + 2 + (start / Math.max(1, maxStart)) * (trackH - thumbH);
      ctx.fillStyle = colors.green;
      ctx.fillRect(width - 7, thumbY, 3, thumbH);
    }
  }
});

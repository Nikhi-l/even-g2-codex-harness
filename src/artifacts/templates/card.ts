// `card` template: a hero card — optional image, title, and key/value rows.
// Good for a single entity (person, product, room, session).

import { ARTIFACT_FONT, drawCoverImage, fitCanvasText, roundRectPath, strokeRoundRect, wrapCanvasText } from "../render.js";
import { registerTemplate } from "../registry.js";
import type { RenderContext } from "../types.js";

type CardRow = { label: string; value: string };
type CardData = { title?: string; subtitle?: string; src?: string; rows?: CardRow[] };

function normalizeRows(rows: CardData["rows"]): CardRow[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is CardRow => Boolean(row && typeof row.value === "string"))
    .map((row) => ({ label: typeof row.label === "string" ? row.label : "", value: row.value }))
    .slice(0, 5);
}

registerTemplate({
  id: "card",
  title: "Card",
  dataHint:
    "hero card for one entity. data: { title: string, subtitle?: string, src?: string (bundled image key), rows?: Array<{ label: string, value: string }> }",
  images: (raw) => {
    const data = (raw ?? {}) as CardData;
    return data.src ? [data.src] : [];
  },
  render(rc: RenderContext, raw: unknown): void {
    const { ctx, width, height, colors } = rc;
    const data = (raw ?? {}) as CardData;
    const rows = normalizeRows(data.rows);
    const pad = 16;
    const imageSize = 76;
    const hasImage = Boolean(data.src);

    if (hasImage) {
      ctx.strokeStyle = colors.green;
      ctx.lineWidth = 1.5;
      strokeRoundRect(ctx, pad - 2, pad - 2, imageSize + 4, imageSize + 4, 6);
      const image = rc.image(data.src);
      if (image) {
        ctx.save();
        ctx.beginPath();
        roundRectPath(ctx, pad, pad, imageSize, imageSize, 5);
        ctx.clip();
        drawCoverImage(ctx, image, pad, pad, imageSize, imageSize);
        ctx.restore();
      } else {
        ctx.fillStyle = colors.panel;
        ctx.fillRect(pad, pad, imageSize, imageSize);
      }
    }

    const headX = hasImage ? pad + imageSize + 12 : pad;
    const headW = width - headX - pad;
    ctx.fillStyle = colors.green;
    ctx.font = `800 18px ${ARTIFACT_FONT}`;
    const titleLines = wrapCanvasText(ctx, (data.title ?? "CARD").toUpperCase(), headW).slice(0, 2);
    titleLines.forEach((line, index) => ctx.fillText(line, headX, 34 + index * 22));
    if (data.subtitle) {
      ctx.fillStyle = colors.dim;
      ctx.font = `700 13px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, data.subtitle, headW), headX, 34 + titleLines.length * 22 + 2);
    }

    const dividerY = Math.max(hasImage ? pad + imageSize + 14 : 0, 96);
    ctx.strokeStyle = colors.panel;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, dividerY);
    ctx.lineTo(width - pad, dividerY);
    ctx.stroke();

    const rowHeight = 34;
    rows.forEach((row, index) => {
      const y = dividerY + 24 + index * rowHeight;
      if (y > height - 10) return;
      if (row.label) {
        ctx.fillStyle = colors.dim;
        ctx.font = `800 11px ${ARTIFACT_FONT}`;
        ctx.fillText(fitCanvasText(ctx, row.label.toUpperCase(), width - pad * 2), pad, y - 13);
      }
      ctx.fillStyle = colors.green;
      ctx.font = `700 14px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, row.value, width - pad * 2), pad, y + 3);
    });
  }
});

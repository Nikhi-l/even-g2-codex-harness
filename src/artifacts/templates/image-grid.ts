// `image_grid` template: 2-4 images with optional labels, laid out as one row
// of two or a 2x2 grid.

import { ARTIFACT_FONT, drawCoverImage, fitCanvasText, roundRectPath, strokeRoundRect } from "../render.js";
import { registerTemplate } from "../registry.js";
import type { RenderContext } from "../types.js";

type GridItem = { src?: string; label?: string };
type GridData = { title?: string; items?: GridItem[] };

function normalizeItems(items: GridData["items"]): GridItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is GridItem => Boolean(item && typeof item === "object")).slice(0, 4);
}

registerTemplate({
  id: "image_grid",
  title: "Image grid",
  dataHint:
    "2-4 images with labels. data: { title?: string, items: Array<{ src: string (bundled image key), label?: string }> }",
  images: (raw) => normalizeItems(((raw ?? {}) as GridData).items).flatMap((item) => (item.src ? [item.src] : [])),
  render(rc: RenderContext, raw: unknown): void {
    const { ctx, width, height, colors } = rc;
    const data = (raw ?? {}) as GridData;
    const items = normalizeItems(data.items);
    const title = data.title?.trim();
    const pad = 14;
    let top = pad;

    if (title) {
      ctx.fillStyle = colors.green;
      ctx.font = `800 15px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, title.toUpperCase(), width - pad * 2), pad, 26);
      top = 38;
    }

    if (items.length === 0) {
      ctx.fillStyle = colors.dim;
      ctx.font = `700 14px ${ARTIFACT_FONT}`;
      ctx.fillText("No images", pad, top + 24);
      return;
    }

    const columns = items.length === 1 ? 1 : 2;
    const rows = Math.ceil(items.length / columns);
    const gap = 10;
    const labelH = 20;
    const cellW = (width - pad * 2 - gap * (columns - 1)) / columns;
    const cellH = (height - top - pad - gap * (rows - 1)) / rows;
    const imageH = cellH - labelH;

    items.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = pad + col * (cellW + gap);
      const y = top + row * (cellH + gap);

      ctx.strokeStyle = colors.panel;
      ctx.lineWidth = 1.5;
      strokeRoundRect(ctx, x, y, cellW, imageH, 6);

      const image = rc.image(item.src);
      if (image) {
        ctx.save();
        ctx.beginPath();
        roundRectPath(ctx, x + 1.5, y + 1.5, cellW - 3, imageH - 3, 5);
        ctx.clip();
        drawCoverImage(ctx, image, x + 1.5, y + 1.5, cellW - 3, imageH - 3);
        ctx.restore();
      } else {
        ctx.fillStyle = colors.panel;
        ctx.fillRect(x + 1.5, y + 1.5, cellW - 3, imageH - 3);
      }

      if (item.label) {
        ctx.fillStyle = colors.green;
        ctx.font = `700 12px ${ARTIFACT_FONT}`;
        ctx.fillText(fitCanvasText(ctx, item.label, cellW), x + 2, y + imageH + 14);
      }
    });
  }
});

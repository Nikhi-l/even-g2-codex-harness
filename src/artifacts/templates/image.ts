// `image` template: one large image with an optional caption bar.

import { ARTIFACT_FONT, drawCoverImage, fitCanvasText, roundRectPath, strokeRoundRect } from "../render.js";
import { registerTemplate } from "../registry.js";
import type { RenderContext } from "../types.js";

type ImageData = { src?: string; caption?: string };

registerTemplate({
  id: "image",
  title: "Image",
  dataHint: "one large image with optional caption. data: { src: string (bundled image key), caption?: string }",
  images: (raw) => {
    const data = (raw ?? {}) as ImageData;
    return data.src ? [data.src] : [];
  },
  render(rc: RenderContext, raw: unknown): void {
    const { ctx, width, height, colors } = rc;
    const data = (raw ?? {}) as ImageData;
    const caption = data.caption?.trim();
    const pad = 14;
    const imageX = pad;
    const imageY = pad;
    const imageW = width - pad * 2;
    const imageH = height - pad * 2 - (caption ? 34 : 0);

    ctx.strokeStyle = colors.green;
    ctx.lineWidth = 1.5;
    strokeRoundRect(ctx, imageX - 2, imageY - 2, imageW + 4, imageH + 4, 8);

    const image = rc.image(data.src);
    if (image) {
      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, imageX, imageY, imageW, imageH, 6);
      ctx.clip();
      drawCoverImage(ctx, image, imageX, imageY, imageW, imageH);
      ctx.restore();
    } else {
      ctx.fillStyle = colors.panel;
      ctx.fillRect(imageX, imageY, imageW, imageH);
      ctx.fillStyle = colors.green;
      ctx.font = `800 16px ${ARTIFACT_FONT}`;
      const label = fitCanvasText(ctx, (data.src ?? "IMAGE").toUpperCase(), imageW - 24);
      ctx.fillText(label, imageX + Math.max(12, (imageW - ctx.measureText(label).width) / 2), imageY + imageH / 2 + 6);
    }

    if (caption) {
      ctx.fillStyle = colors.green;
      ctx.font = `700 14px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, caption, width - pad * 2), pad, height - 16);
    }
  }
});

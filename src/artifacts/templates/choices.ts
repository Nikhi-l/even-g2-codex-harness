// `choices` template: a question with numbered options. Scrolling moves the
// highlight; a tap records the highlighted option as the wearer's answer. The
// relay reports that answer as data. It never runs an action by itself.

import { ARTIFACT_FONT, fitCanvasText, roundRectPath, strokeRoundRect, wrapCanvasText } from "../render.js";
import { registerTemplate } from "../registry.js";
import type { RenderContext } from "../types.js";

type ChoicesData = { title?: string; options?: string[] };
const VISIBLE = 6;

registerTemplate({
  id: "choices",
  title: "Choices",
  dataHint:
    "question with 2-9 options the wearer can pick by scrolling and tapping. data: { title?: string, options: string[] }",
  render(rc: RenderContext, raw: unknown): void {
    const { ctx, width, height, colors } = rc;
    const data = (raw ?? {}) as ChoicesData;
    const options = (Array.isArray(data.options) ? data.options : []).filter((value) => typeof value === "string");
    const padX = 14;
    const highlight = Math.min(Math.max(0, Math.floor(rc.view.scroll)), Math.max(0, options.length - 1));
    const chosen = typeof rc.view.chosen === "number" ? rc.view.chosen : null;

    ctx.fillStyle = colors.green;
    ctx.font = `800 15px ${ARTIFACT_FONT}`;
    const titleLines = wrapCanvasText(ctx, (data.title ?? "CHOOSE ONE").toUpperCase(), width - padX * 2).slice(0, 2);
    titleLines.forEach((line, index) => ctx.fillText(line, padX, 24 + index * 19));
    const dividerY = 24 + titleLines.length * 19 - 6;
    ctx.strokeStyle = colors.panel;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, dividerY);
    ctx.lineTo(width - padX, dividerY);
    ctx.stroke();

    const rowHeight = 32;
    const top = dividerY + 10;
    const start = Math.min(Math.max(0, highlight - Math.floor(VISIBLE / 2)), Math.max(0, options.length - VISIBLE));
    options.slice(start, start + VISIBLE).forEach((option, index) => {
      const absolute = start + index;
      const y = top + index * rowHeight;
      const active = absolute === highlight;
      if (active) {
        ctx.fillStyle = colors.panel;
        ctx.beginPath();
        roundRectPath(ctx, padX - 4, y, width - padX * 2 + 8, rowHeight - 4, 5);
        ctx.fill();
        ctx.strokeStyle = colors.green;
        ctx.lineWidth = 1.5;
        strokeRoundRect(ctx, padX - 4, y, width - padX * 2 + 8, rowHeight - 4, 5);
      }
      ctx.fillStyle = active ? colors.green : colors.dim;
      ctx.font = `800 13px ${ARTIFACT_FONT}`;
      ctx.fillText(String(absolute + 1), padX + 4, y + 19);
      ctx.fillStyle = colors.green;
      ctx.font = `${active ? 800 : 700} 14px ${ARTIFACT_FONT}`;
      const markWidth = chosen === absolute ? 22 : 0;
      ctx.fillText(fitCanvasText(ctx, option, width - padX * 2 - 30 - markWidth), padX + 26, y + 19);
      if (chosen === absolute) {
        ctx.strokeStyle = colors.green;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(width - padX - 18, y + 14);
        ctx.lineTo(width - padX - 12, y + 20);
        ctx.lineTo(width - padX - 2, y + 8);
        ctx.stroke();
      }
    });

    ctx.fillStyle = colors.dim;
    ctx.font = `700 11px ${ARTIFACT_FONT}`;
    const footer = chosen === null ? "SCROLL TO MOVE · TAP TO CHOOSE" : `SENT OPTION ${chosen + 1} · TAP TO CHANGE`;
    ctx.fillText(fitCanvasText(ctx, footer, width - padX * 2), padX, height - 10);
  }
});

// `checklist` template: a plan with per-item state (done, active, todo, blocked)
// and a progress bar. Suits an agent's task list, build steps or a routine.

import { VISIBLE_ROWS } from "../../core/render.js";
import { ARTIFACT_FONT, fitCanvasText, strokeRoundRect } from "../render.js";
import { registerTemplate } from "../registry.js";
import type { RenderContext } from "../types.js";

type ItemState = "todo" | "active" | "done" | "blocked";
type ChecklistItem = { text: string; state?: ItemState };
type ChecklistData = { title?: string; items?: ChecklistItem[] };

function drawBox(rc: RenderContext, x: number, y: number, state: ItemState): void {
  const { ctx, colors } = rc;
  const size = 14;
  ctx.lineWidth = state === "active" ? 2 : 1.5;
  ctx.strokeStyle = state === "done" || state === "blocked" ? colors.dim : colors.green;
  if (state === "done") {
    ctx.fillStyle = colors.dim;
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = colors.bg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 7);
    ctx.lineTo(x + 6, y + 10);
    ctx.lineTo(x + 11, y + 4);
    ctx.stroke();
    return;
  }
  ctx.strokeRect(x, y, size, size);
  if (state === "active") {
    ctx.fillStyle = colors.green;
    ctx.fillRect(x + 4, y + 4, size - 8, size - 8);
  } else if (state === "blocked") {
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 3);
    ctx.lineTo(x + size - 3, y + size - 3);
    ctx.moveTo(x + size - 3, y + 3);
    ctx.lineTo(x + 3, y + size - 3);
    ctx.stroke();
  }
}

registerTemplate({
  id: "checklist",
  title: "Checklist",
  dataHint:
    "plan or task list with progress. data: { title?: string, items: Array<{ text: string, state?: 'todo' | 'active' | 'done' | 'blocked' }> }",
  render(rc: RenderContext, raw: unknown): void {
    const { ctx, width, height, colors } = rc;
    const data = (raw ?? {}) as ChecklistData;
    const items = (Array.isArray(data.items) ? data.items : []).filter((item) => typeof item?.text === "string");
    const padX = 16;
    const done = items.filter((item) => item.state === "done").length;

    ctx.font = `800 13px ${ARTIFACT_FONT}`;
    const count = `${done}/${items.length}`;
    const countWidth = ctx.measureText(count).width;
    ctx.fillStyle = colors.cyan;
    ctx.fillText(count, width - padX - countWidth, 26);
    ctx.fillStyle = colors.green;
    ctx.font = `800 15px ${ARTIFACT_FONT}`;
    ctx.fillText(fitCanvasText(ctx, (data.title ?? "PLAN").toUpperCase(), width - padX * 2 - countWidth - 10), padX, 26);

    // Progress bar
    const barY = 36;
    ctx.strokeStyle = colors.panel;
    ctx.lineWidth = 1;
    strokeRoundRect(ctx, padX, barY, width - padX * 2, 8, 3);
    if (items.length) {
      ctx.fillStyle = colors.green;
      ctx.fillRect(padX + 2, barY + 2, Math.round(((width - padX * 2 - 4) * done) / items.length), 4);
    }

    const rowHeight = 30;
    const top = 60;
    const visible = VISIBLE_ROWS.checklist;
    const maxStart = Math.max(0, items.length - visible);
    const start = Math.min(Math.max(0, Math.floor(rc.view.scroll)), maxStart);
    items.slice(start, start + visible).forEach((item, index) => {
      const state = item.state ?? "todo";
      const y = top + index * rowHeight;
      drawBox(rc, padX, y, state);
      ctx.fillStyle = state === "done" || state === "blocked" ? colors.dim : colors.green;
      ctx.font = `${state === "active" ? 800 : 700} 14px ${ARTIFACT_FONT}`;
      const label = fitCanvasText(ctx, item.text, width - padX * 2 - 28);
      ctx.fillText(label, padX + 24, y + 12);
      if (state === "done") {
        // Strike through finished work so the active item stands out on a monochrome display.
        ctx.strokeStyle = colors.dim;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padX + 24, y + 7);
        ctx.lineTo(padX + 24 + ctx.measureText(label).width, y + 7);
        ctx.stroke();
      }
    });

    if (items.length > visible) {
      ctx.fillStyle = colors.dim;
      ctx.font = `700 11px ${ARTIFACT_FONT}`;
      const marker = `${start + 1}-${Math.min(items.length, start + visible)} of ${items.length}`;
      ctx.fillText(marker, width - padX - ctx.measureText(marker).width, height - 8);
    }
  }
});

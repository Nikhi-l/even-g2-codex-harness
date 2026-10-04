// `schedule` template: an agenda/timeline of events (time + title + location/tag),
// windowed by view.scroll.

import { ARTIFACT_FONT, fitCanvasText } from "../render.js";
import { registerTemplate } from "../registry.js";
import type { RenderContext } from "../types.js";

type ScheduleEvent = { time?: string; title: string; location?: string; tag?: string };
type ScheduleData = { title?: string; events?: ScheduleEvent[] };

function normalizeEvents(events: ScheduleData["events"]): ScheduleEvent[] {
  if (!Array.isArray(events)) return [];
  return events.filter((event): event is ScheduleEvent => Boolean(event && typeof event.title === "string"));
}

registerTemplate({
  id: "schedule",
  title: "Schedule",
  dataHint:
    "event agenda/timeline. data: { title?: string, events: Array<{ time?: string, title: string, location?: string, tag?: string }> }",
  render(rc: RenderContext, raw: unknown): void {
    const { ctx, width, height, colors } = rc;
    const data = (raw ?? {}) as ScheduleData;
    const events = normalizeEvents(data.events);
    const padX = 16;
    const innerW = width - padX * 2;

    ctx.fillStyle = colors.green;
    ctx.font = `800 15px ${ARTIFACT_FONT}`;
    ctx.fillText(fitCanvasText(ctx, (data.title ?? "SCHEDULE").toUpperCase(), innerW), padX, 26);
    ctx.strokeStyle = colors.panel;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, 34);
    ctx.lineTo(width - padX, 34);
    ctx.stroke();

    const rowHeight = 44;
    const top = 56;
    const visibleCount = Math.max(1, Math.floor((height - top - 6) / rowHeight));
    const maxStart = Math.max(0, events.length - visibleCount);
    const start = Math.min(Math.max(0, Math.floor(rc.view.scroll)), maxStart);
    const window = events.slice(start, start + visibleCount);

    window.forEach((event, index) => {
      const y = top + index * rowHeight;
      // time (left rail)
      ctx.fillStyle = colors.cyan;
      ctx.font = `800 14px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, event.time ?? "", 56), padX, y);
      // title
      ctx.fillStyle = colors.green;
      ctx.font = `700 14px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, event.title, innerW - 60), padX + 62, y);
      // location · tag
      const sub = [event.location, event.tag].filter(Boolean).join(" · ");
      if (sub) {
        ctx.fillStyle = colors.dim;
        ctx.font = `700 12px ${ARTIFACT_FONT}`;
        ctx.fillText(fitCanvasText(ctx, sub, innerW - 60), padX + 62, y + 18);
      }
    });

    if (events.length > visibleCount) {
      ctx.fillStyle = colors.dim;
      ctx.font = `700 11px ${ARTIFACT_FONT}`;
      ctx.fillText(`${start + window.length}/${events.length}`, width - 48, height - 8);
    }
  }
});

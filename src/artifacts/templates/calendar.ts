// `calendar` template: a month grid with marked days and up to two mark labels.

import { ARTIFACT_FONT, fitCanvasText, roundRectPath } from "../render.js";
import { registerTemplate } from "../registry.js";
import type { RenderContext } from "../types.js";

type CalendarMark = { day: number; label?: string };
type CalendarData = { title?: string; month?: string; marks?: CalendarMark[] };

const MONTH_NAMES = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
];

function parseMonth(month: string | undefined): { year: number; monthIndex: number } {
  const match = month?.trim().match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    const year = Number(match[1]);
    const monthIndex = Math.min(11, Math.max(0, Number(match[2]) - 1));
    return { year, monthIndex };
  }
  const now = new Date();
  return { year: now.getFullYear(), monthIndex: now.getMonth() };
}

function normalizeMarks(marks: CalendarData["marks"]): CalendarMark[] {
  if (!Array.isArray(marks)) return [];
  return marks.filter((mark): mark is CalendarMark => Boolean(mark && Number.isFinite(mark.day)));
}

registerTemplate({
  id: "calendar",
  title: "Calendar",
  dataHint:
    "month calendar with highlighted days. data: { title?: string, month?: 'YYYY-MM' (defaults to current), marks?: Array<{ day: number, label?: string }> }",
  render(rc: RenderContext, raw: unknown): void {
    const { ctx, width, height, colors } = rc;
    const data = (raw ?? {}) as CalendarData;
    const { year, monthIndex } = parseMonth(data.month);
    const marks = normalizeMarks(data.marks);
    const markedDays = new Set(marks.map((mark) => Math.trunc(mark.day)));
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    // Monday-first column of the 1st.
    const firstColumn = (new Date(year, monthIndex, 1).getDay() + 6) % 7;

    const padX = 18;
    const header = data.title?.trim() || `${MONTH_NAMES[monthIndex]} ${year}`;
    ctx.fillStyle = colors.green;
    ctx.font = `800 15px ${ARTIFACT_FONT}`;
    ctx.fillText(fitCanvasText(ctx, header.toUpperCase(), width - padX * 2), padX, 26);
    ctx.strokeStyle = colors.panel;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, 34);
    ctx.lineTo(width - padX, 34);
    ctx.stroke();

    const cellW = (width - padX * 2) / 7;
    const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
    ctx.fillStyle = colors.dim;
    ctx.font = `800 11px ${ARTIFACT_FONT}`;
    weekdays.forEach((day, index) => {
      ctx.fillText(day, padX + index * cellW + cellW / 2 - 4, 52);
    });

    const gridTop = 76;
    const rowH = 27;
    ctx.font = `700 13px ${ARTIFACT_FONT}`;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const cellIndex = firstColumn + day - 1;
      const col = cellIndex % 7;
      const row = Math.floor(cellIndex / 7);
      const x = padX + col * cellW;
      const y = gridTop + row * rowH;
      const label = String(day);
      const textX = x + cellW / 2 - ctx.measureText(label).width / 2;
      if (markedDays.has(day)) {
        ctx.fillStyle = colors.panel;
        ctx.beginPath();
        roundRectPath(ctx, x + 3, y - 14, cellW - 6, 20, 5);
        ctx.fill();
        ctx.fillStyle = colors.green;
      } else {
        ctx.fillStyle = colors.dim;
      }
      ctx.fillText(label, textX, y);
    }

    // Up to two mark labels in the footer.
    const labeled = marks.filter((mark) => mark.label?.trim()).slice(0, 2);
    labeled.forEach((mark, index) => {
      const y = height - 26 + index * 16;
      ctx.fillStyle = colors.green;
      ctx.font = `800 12px ${ARTIFACT_FONT}`;
      ctx.fillText(String(Math.trunc(mark.day)).padStart(2, " "), padX, y);
      ctx.fillStyle = colors.dim;
      ctx.font = `700 12px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, mark.label!.trim(), width - padX * 2 - 30), padX + 28, y);
    });
  }
});

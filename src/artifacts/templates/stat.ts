// `stat` template: one to three headline numbers with an optional delta and
// sparkline. Suits build times, health or fitness numbers, prices and counts.

import { ARTIFACT_FONT, fitCanvasText } from "../render.js";
import { registerTemplate } from "../registry.js";
import type { RenderContext } from "../types.js";

type Metric = { label: string; value: string; unit?: string; delta?: string; trend?: number[] };
type StatData = { title?: string; metrics?: Metric[] };

function sparkline(rc: RenderContext, values: number[], x: number, y: number, width: number, height: number): void {
  const { ctx, colors } = rc;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const point = (value: number, index: number) => [x + (index * width) / (values.length - 1), y + height - ((value - min) / span) * height] as const;
  ctx.strokeStyle = colors.panel;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + height + 0.5);
  ctx.lineTo(x + width, y + height + 0.5);
  ctx.stroke();
  ctx.strokeStyle = colors.green;
  ctx.lineWidth = 2;
  ctx.beginPath();
  values.forEach((value, index) => {
    const [px, py] = point(value, index);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  const [lastX, lastY] = point(values.at(-1)!, values.length - 1);
  ctx.fillStyle = colors.green;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function delta(rc: RenderContext, text: string, x: number, baseline: number, maxWidth: number): void {
  const { ctx, colors } = rc;
  const up = text.trim().startsWith("+");
  const down = /^[-−]/u.test(text.trim());
  let offset = 0;
  if (up || down) {
    ctx.fillStyle = colors.cyan;
    ctx.beginPath();
    ctx.moveTo(x, up ? baseline - 2 : baseline - 11);
    ctx.lineTo(x + 10, up ? baseline - 2 : baseline - 11);
    ctx.lineTo(x + 5, up ? baseline - 11 : baseline - 2);
    ctx.closePath();
    ctx.fill();
    offset = 15;
  }
  ctx.fillStyle = colors.cyan;
  ctx.font = `800 13px ${ARTIFACT_FONT}`;
  ctx.fillText(fitCanvasText(ctx, text, maxWidth - offset), x + offset, baseline);
}

/** Largest bold size, from `max` down, at which value + unit fit `width`. */
function valueFont(rc: RenderContext, metric: Metric, width: number, max: number): number {
  const { ctx } = rc;
  for (let size = max; size > 14; size -= 2) {
    ctx.font = `800 ${size}px ${ARTIFACT_FONT}`;
    const valueWidth = ctx.measureText(metric.value).width;
    ctx.font = `700 ${Math.round(size * 0.4)}px ${ARTIFACT_FONT}`;
    if (valueWidth + (metric.unit ? ctx.measureText(` ${metric.unit}`).width : 0) <= width) return size;
  }
  return 14;
}

function drawValue(rc: RenderContext, metric: Metric, x: number, baseline: number, width: number, max: number): void {
  const { ctx, colors } = rc;
  const size = valueFont(rc, metric, width, max);
  ctx.fillStyle = colors.green;
  ctx.font = `800 ${size}px ${ARTIFACT_FONT}`;
  const value = fitCanvasText(ctx, metric.value, width);
  ctx.fillText(value, x, baseline);
  if (metric.unit) {
    const valueWidth = ctx.measureText(value).width;
    ctx.fillStyle = colors.dim;
    ctx.font = `700 ${Math.round(size * 0.4)}px ${ARTIFACT_FONT}`;
    ctx.fillText(fitCanvasText(ctx, metric.unit, Math.max(0, width - valueWidth - 6)), x + valueWidth + 6, baseline);
  }
}

registerTemplate({
  id: "stat",
  title: "Stat",
  dataHint:
    "one to three headline numbers. data: { title?: string, metrics: Array<{ label: string, value: string, unit?: string, delta?: string (e.g. '+12%'), trend?: number[] }> }",
  render(rc: RenderContext, raw: unknown): void {
    const { ctx, width, height, colors } = rc;
    const data = (raw ?? {}) as StatData;
    const metrics = (Array.isArray(data.metrics) ? data.metrics : []).filter((metric) => typeof metric?.value === "string").slice(0, 3);
    const padX = 16;
    const innerW = width - padX * 2;
    let top = 14;
    if (data.title) {
      ctx.fillStyle = colors.green;
      ctx.font = `800 15px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, data.title.toUpperCase(), innerW), padX, 26);
      ctx.strokeStyle = colors.panel;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, 34);
      ctx.lineTo(width - padX, 34);
      ctx.stroke();
      top = 44;
    }

    if (metrics.length === 1) {
      const metric = metrics[0]!;
      ctx.fillStyle = colors.dim;
      ctx.font = `800 13px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, metric.label.toUpperCase(), innerW), padX, top + 16);
      drawValue(rc, metric, padX, top + 80, innerW, 58);
      if (metric.delta) delta(rc, metric.delta, padX, top + 108, innerW);
      if (metric.trend && metric.trend.length > 1) sparkline(rc, metric.trend, padX + 4, Math.max(top + 126, height - 84), innerW - 8, 62);
      return;
    }

    const block = Math.floor((height - top - 6) / Math.max(1, metrics.length));
    metrics.forEach((metric, index) => {
      const y = top + index * block;
      if (index > 0) {
        ctx.strokeStyle = colors.panel;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padX, y - 2);
        ctx.lineTo(width - padX, y - 2);
        ctx.stroke();
      }
      const hasTrend = Boolean(metric.trend && metric.trend.length > 1);
      const textW = hasTrend ? innerW - 96 : innerW;
      ctx.fillStyle = colors.dim;
      ctx.font = `800 11px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, metric.label.toUpperCase(), textW), padX, y + 16);
      drawValue(rc, metric, padX, y + 16 + Math.min(40, block - 34), textW, Math.min(36, block - 30));
      if (metric.delta) delta(rc, metric.delta, padX, Math.min(y + block - 8, y + 16 + Math.min(40, block - 34) + 20), textW);
      if (hasTrend) sparkline(rc, metric.trend!, width - padX - 86, y + 14, 84, Math.max(18, block - 34));
    });
  }
});

import type { z } from 'zod';
import { templateSchemas } from '../../core/contracts.js';
import { ARTIFACT_FONT, drawCoverImage, fitCanvasText } from '../render.js';
import { registerTemplate } from '../registry.js';
import type { RenderContext } from '../types.js';

type Backdrop = z.output<typeof templateSchemas.glance>['backdrop'];
const ink = '#00ff00';
const secondary = '#00bb00';
const quiet = '#006600';

function label(rc: RenderContext, value: string | undefined, x: number, y: number, size = 15, width = 256, color = ink) {
  if (!value) return;
  rc.ctx.font = `500 ${size}px ${ARTIFACT_FONT}`;
  rc.ctx.fillStyle = color;
  rc.ctx.fillText(fitCanvasText(rc.ctx, value, width), x, y);
}
function line(rc: RenderContext, x: number, y: number, endX: number, endY: number, color = quiet, thickness = 2) {
  rc.ctx.strokeStyle = color; rc.ctx.lineWidth = thickness;
  rc.ctx.beginPath(); rc.ctx.moveTo(x, y); rc.ctx.lineTo(endX, endY); rc.ctx.stroke();
}
function circle(rc: RenderContext, x: number, y: number, radius: number, fill = false, color = ink) {
  rc.ctx.strokeStyle = color; rc.ctx.fillStyle = color; rc.ctx.lineWidth = 2;
  rc.ctx.beginPath(); rc.ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (fill) rc.ctx.fill(); else rc.ctx.stroke();
}
function furniture(rc: RenderContext, heading: string) {
  label(rc, heading.toUpperCase(), 16, 29, 15);
  line(rc, 16, 42, 42, 42, secondary);
  line(rc, 264, 16, 272, 16); line(rc, 272, 16, 272, 24);
  line(rc, 16, 264, 16, 272); line(rc, 16, 272, 24, 272);
}
/** Static decoration stays below the text. All motion is below the 144 px tile seam. */
function backdrop(rc: RenderContext, key: Backdrop) {
  const { ctx } = rc;
  if (key === 'moonrise' || key === 'ginkgo') {
    const image = rc.image(key);
    if (image) {
      ctx.save(); ctx.globalAlpha = 0.65;
      // Keep photo details away from the headline and subtitle lanes.
      drawCoverImage(ctx, image, 80, 80, 200, 200); ctx.restore();
    }
  } else if (key === 'contours') {
    ctx.strokeStyle = quiet; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(192 + i * 16, 146);
      ctx.bezierCurveTo(138 + i * 16, 190, 280 - i * 12, 206, 204 + i * 18, 268); ctx.stroke();
    }
  } else if (key === 'stars') {
    ctx.fillStyle = quiet;
    for (let i = 0; i < 18; i++) ctx.fillRect(182 + (i * 29) % 90, 150 + (i * 41) % 110, 2, 2);
  }
}
function images(raw: unknown): string[] {
  const key = (raw as { backdrop?: string })?.backdrop;
  return key === 'moonrise' || key === 'ginkgo' ? [key] : [];
}

registerTemplate({
  id: 'portrait', title: 'Portrait',
  dataHint: 'fictional AI portrait, always labelled. data: {name, src: "portrait-mira" | "portrait-ren", subtitle?, note?}',
  images: raw => [(raw as { src: string }).src],
  render(rc, raw) {
    const data = templateSchemas.portrait.parse(raw);
    const image = rc.image(data.src);
    if (image) drawCoverImage(rc.ctx, image, 56, 57, 176, 176);
    furniture(rc, data.name);
    // This provenance label is renderer-owned and cannot be removed by a payload.
    label(rc, 'AI FICTIONAL', 16, 55, 12, 256, secondary);
    label(rc, data.subtitle ?? 'Here when you need me.', 16, 249, 15);
    label(rc, data.note, 34, 273, 12, 238, secondary);
  },
});
registerTemplate({
  id: 'glance', title: 'Glance',
  dataHint: 'a headline over a quiet backdrop. data: {title, value, detail?, footer?, backdrop?: "none" | "moonrise" | "ginkgo" | "contours" | "stars"}',
  images,
  render(rc, raw) {
    const data = templateSchemas.glance.parse(raw);
    backdrop(rc, data.backdrop); furniture(rc, data.title);
    label(rc, data.value, 16, 102, 36);
    label(rc, data.detail, 16, 133, 15, 256, secondary);
    // Background details occupy the lower-right; keep the footer on a black strip.
    rc.ctx.fillStyle = '#000'; rc.ctx.fillRect(30, 253, 246, 25);
    label(rc, data.footer, 34, 272, 12, 238, secondary);
  },
});
registerTemplate({
  id: 'focus', title: 'Focus',
  dataHint: 'static focus dial; values are supplied by caller, not a running timer. data: {title, value, detail?, progress?: 0..1, backdrop?}',
  images,
  render(rc, raw) {
    const data = templateSchemas.focus.parse(raw);
    backdrop(rc, data.backdrop); furniture(rc, data.title);
    label(rc, data.value, 16, 101, 36);
    label(rc, data.detail, 16, 132, 15, 256, secondary);
    circle(rc, 91, 211, 48, false, quiet);
    rc.ctx.strokeStyle = ink; rc.ctx.lineWidth = 4;
    if (data.progress > 0) {
      rc.ctx.beginPath(); rc.ctx.arc(91, 211, 48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * data.progress); rc.ctx.stroke();
    }
    label(rc, `${Math.round(data.progress * 100)}%`, 62, 217, 20, 70);
    label(rc, 'ONE THING', 160, 219, 12, 112, secondary);
  },
});
registerTemplate({
  id: 'motion', title: 'Motion',
  dataHint: 'one deterministic animation frame; no auto-play. data: {title, detail?, mode?: "breathe" | "orbit" | "sweep" | "listen", phase?: integer 0..15, backdrop?}. Listening bars are decorative, not microphone telemetry.',
  images,
  render(rc, raw) {
    const data = templateSchemas.motion.parse(raw);
    backdrop(rc, data.backdrop); furniture(rc, data.title);
    label(rc, data.detail, 16, 81, 15, 256, secondary);
    label(rc, data.mode.toUpperCase(), 16, 115, 12, 256, secondary);
    const theta = data.phase * Math.PI / 8;
    if (data.mode === 'breathe') {
      circle(rc, 144, 208, 45, false, quiet);
      circle(rc, 144, 208, 21 + 16 * (1 - Math.cos(theta)) / 2, false, ink);
      circle(rc, 144, 208, 3, true);
    } else if (data.mode === 'orbit') {
      circle(rc, 144, 208, 40, false, quiet);
      circle(rc, 144 + 40 * Math.cos(theta), 208 + 40 * Math.sin(theta), 5, true);
      circle(rc, 144, 208, 4, false, secondary);
    } else if (data.mode === 'sweep') {
      line(rc, 40, 208, 248, 208, quiet, 3);
      const x = 40 + data.phase / 15 * 208;
      line(rc, Math.max(40, x - 28), 208, x, 208, ink, 5);
      for (let i = 0; i < 5; i++) line(rc, 40 + i * 52, 221, 40 + i * 52, 225, secondary);
    } else {
      for (let i = 0; i < 13; i++) {
        const height = 10 + Math.round((1 + Math.sin(theta + i * 1.8)) * 14);
        line(rc, 60 + i * 14, 208 - height / 2, 60 + i * 14, 208 + height / 2, ink, 4);
      }
    }
  },
});

// `directions` template: turn-by-turn steps with a large current step, ported
// from the Display_Mcp route artifact. Scrolling advances the current step.

import { ARTIFACT_FONT, fitCanvasText, strokeRoundRect, wrapCanvasText } from "../render.js";
import { registerTemplate } from "../registry.js";
import type { RenderContext } from "../types.js";

type Turn = "straight" | "left" | "right" | "slight_left" | "slight_right" | "u_turn" | "lift" | "arrive";
type Step = { turn: Turn; text: string; detail?: string; distance?: string };
type DirectionsData = { destination?: string; eta?: string; distance?: string; steps?: Step[] };

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(-size * 0.8, size * 0.35);
  ctx.lineTo(size * 0.8, size * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draws a turn glyph centred on (cx, cy) inside a square of side `size`. */
function drawTurn(rc: RenderContext, turn: Turn, cx: number, cy: number, size: number, color: string): void {
  const { ctx } = rc;
  const s = size / 2;
  const head = Math.max(4, size * 0.2);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, size / 9);
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  const mirror = turn === "right" || turn === "slight_right" ? -1 : 1;
  switch (turn) {
    case "straight":
      ctx.beginPath();
      ctx.moveTo(cx, cy + s);
      ctx.lineTo(cx, cy - s + head);
      ctx.stroke();
      arrowHead(ctx, cx, cy - s + head, 0, head);
      break;
    case "left":
    case "right":
      ctx.beginPath();
      ctx.moveTo(cx + mirror * s * 0.5, cy + s);
      ctx.lineTo(cx + mirror * s * 0.5, cy - s * 0.2);
      ctx.lineTo(cx - mirror * (s - head), cy - s * 0.2);
      ctx.stroke();
      arrowHead(ctx, cx - mirror * (s - head), cy - s * 0.2, (-mirror * Math.PI) / 2, head);
      break;
    case "slight_left":
    case "slight_right":
      ctx.beginPath();
      ctx.moveTo(cx + mirror * s * 0.2, cy + s);
      ctx.lineTo(cx + mirror * s * 0.2, cy);
      ctx.lineTo(cx - mirror * (s * 0.55), cy - s + head);
      ctx.stroke();
      arrowHead(ctx, cx - mirror * (s * 0.55), cy - s + head, (-mirror * Math.PI) / 4, head);
      break;
    case "u_turn":
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.45, cy + s);
      ctx.lineTo(cx + s * 0.45, cy - s * 0.25);
      ctx.arc(cx, cy - s * 0.25, s * 0.45, 0, Math.PI, true);
      ctx.lineTo(cx - s * 0.45, cy + s * 0.35);
      ctx.stroke();
      arrowHead(ctx, cx - s * 0.45, cy + s * 0.35 + head * 0.5, Math.PI, head);
      break;
    case "lift":
      ctx.strokeRect(cx - s * 0.6, cy - s * 0.45, s * 1.2, s * 1.4);
      arrowHead(ctx, cx - s * 0.25, cy - s * 0.75, 0, head * 0.7);
      arrowHead(ctx, cx + s * 0.25, cy - s * 0.95, Math.PI, head * 0.7);
      ctx.fillRect(cx - s * 0.35, cy - s * 0.1, s * 0.25, s * 0.8);
      ctx.fillRect(cx + s * 0.1, cy - s * 0.1, s * 0.25, s * 0.8);
      break;
    case "arrive":
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.45, cy + s);
      ctx.lineTo(cx - s * 0.45, cy - s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.4, cy - s);
      ctx.lineTo(cx + s * 0.75, cy - s * 0.6);
      ctx.lineTo(cx - s * 0.4, cy - s * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
  }
  ctx.restore();
}

registerTemplate({
  id: "directions",
  title: "Directions",
  dataHint:
    "turn-by-turn route; scroll advances the current step. data: { destination: string, eta?: string, distance?: string, steps: Array<{ turn: 'straight' | 'left' | 'right' | 'slight_left' | 'slight_right' | 'u_turn' | 'lift' | 'arrive', text: string, detail?: string, distance?: string }> }",
  render(rc: RenderContext, raw: unknown): void {
    const { ctx, width, height, colors } = rc;
    const data = (raw ?? {}) as DirectionsData;
    const steps = (Array.isArray(data.steps) ? data.steps : []).filter((step) => typeof step?.text === "string");
    const padX = 14;
    const innerW = width - padX * 2;
    const current = Math.min(Math.max(0, Math.floor(rc.view.scroll)), Math.max(0, steps.length - 1));

    ctx.fillStyle = colors.green;
    ctx.font = `800 15px ${ARTIFACT_FONT}`;
    ctx.fillText(fitCanvasText(ctx, (data.destination ?? "ROUTE").toUpperCase(), innerW), padX, 24);
    const meta = [data.eta, data.distance].filter(Boolean).join(" · ");
    ctx.fillStyle = colors.cyan;
    ctx.font = `800 13px ${ARTIFACT_FONT}`;
    const counter = steps.length ? `STEP ${current + 1}/${steps.length}` : "";
    const counterWidth = ctx.measureText(counter).width;
    if (meta) ctx.fillText(fitCanvasText(ctx, meta.toUpperCase(), innerW - counterWidth - 10), padX, 44);
    ctx.fillStyle = colors.dim;
    ctx.fillText(counter, width - padX - counterWidth, 44);

    const step = steps[current];
    if (!step) return;
    // Current step: large glyph and up to two lines of instruction.
    const cardY = 56;
    const cardH = 98;
    ctx.strokeStyle = colors.green;
    ctx.lineWidth = 1.5;
    strokeRoundRect(ctx, padX - 2, cardY, innerW + 4, cardH, 6);
    drawTurn(rc, step.turn, padX + 34, cardY + cardH / 2, 44, colors.green);
    const textX = padX + 70;
    const textW = width - textX - padX - 6;
    ctx.fillStyle = colors.green;
    ctx.font = `800 16px ${ARTIFACT_FONT}`;
    const lines = wrapCanvasText(ctx, step.text.toUpperCase(), textW).slice(0, 2);
    lines.forEach((line, index) => ctx.fillText(line, textX, cardY + 30 + index * 20));
    const below = cardY + 30 + lines.length * 20;
    if (step.distance) {
      ctx.fillStyle = colors.cyan;
      ctx.font = `800 14px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, step.distance, textW), textX, below + 2);
    }
    if (step.detail) {
      ctx.fillStyle = colors.dim;
      ctx.font = `700 11px ${ARTIFACT_FONT}`;
      ctx.fillText(fitCanvasText(ctx, step.detail.toUpperCase(), textW), textX, Math.min(cardY + cardH - 10, below + (step.distance ? 20 : 4)));
    }

    // Following steps, smaller and dimmer.
    const rowH = 32;
    const listY = cardY + cardH + 10;
    const remaining = Math.max(0, Math.floor((height - listY - 4) / rowH));
    steps.slice(current + 1, current + 1 + remaining).forEach((next, index) => {
      const y = listY + index * rowH;
      ctx.strokeStyle = colors.panel;
      ctx.lineWidth = 1;
      strokeRoundRect(ctx, padX - 2, y, innerW + 4, rowH - 6, 4);
      drawTurn(rc, next.turn, padX + 14, y + (rowH - 6) / 2, 16, colors.dim);
      ctx.fillStyle = colors.dim;
      ctx.font = `700 13px ${ARTIFACT_FONT}`;
      const suffix = next.distance ? `  ${next.distance}` : "";
      ctx.fillText(fitCanvasText(ctx, `${next.text}${suffix}`, innerW - 36), padX + 30, y + 17);
    });
  }
});

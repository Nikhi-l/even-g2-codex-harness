import type { DisplayFrame } from '../core/contracts.js';
import { artifactCanvas } from '../device/tiles.js';
export async function paintPreview(canvas: HTMLCanvasElement, frame: DisplayFrame) {
  const tile = frame.layout === 'split' ? await artifactCanvas(frame) : null;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 576, 288);
  if (tile) ctx.drawImage(tile, 288, 0);
  ctx.fillStyle = '#31f79c'; ctx.font = '500 18px Menlo, Monaco, Consolas, monospace';
  frame.text.split('\n').forEach((line, index) => ctx.fillText(line, 8, 24 + index * 20));
  if (tile) { ctx.fillStyle = '#123c27'; ctx.fillRect(287, 0, 1, 288); }
}

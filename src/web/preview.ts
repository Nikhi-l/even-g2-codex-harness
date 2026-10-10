import type { DisplayFrame } from '../core/contracts.js';
import { artifactCanvas } from '../device/tiles.js';
export async function paintPreview(canvas: HTMLCanvasElement, frame: DisplayFrame) {
  const tile = frame.layout === 'split' ? await artifactCanvas(frame) : null;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 576, 288);
  if (tile) ctx.drawImage(tile, 288, 0);
  // Native text is proportional with a measured 27 px line pitch. Clip the
  // approximation to its own pane so a browser font never covers the artifact.
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, tile ? 287 : 576, 288); ctx.clip();
  ctx.fillStyle = '#00ff00'; ctx.font = '400 18px Arial, sans-serif';
  frame.text.split('\n').forEach((line, index) => ctx.fillText(line, 8, 26 + index * 27));
  ctx.restore();
  if (tile) { ctx.fillStyle = '#004400'; ctx.fillRect(287, 0, 1, 288); }
}

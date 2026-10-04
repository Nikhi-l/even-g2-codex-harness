import type { DisplayFrame } from '../core/contracts.js';
import { renderArtifact, preloadArtifactImages } from '../artifacts/index.js';
import { createCanvas, requiredCanvasContext, canvasToPngBytes } from '../artifacts/render.js';

export async function artifactCanvas(frame: DisplayFrame): Promise<HTMLCanvasElement> {
  const canvas = createCanvas(288, 288);
  if (frame.artifact && frame.layout === 'split') {
    await preloadArtifactImages(frame.artifact.template, frame.artifact.data);
    renderArtifact(requiredCanvasContext(canvas), frame.artifact.template, frame.artifact.data, { scroll: frame.scroll });
  }
  return canvas;
}
/** Two 288×144 PNG tiles: the original artifact pane split to fit G2 image limits. */
export async function encodeTiles(frame: DisplayFrame): Promise<Uint8Array[]> {
  const canvas = await artifactCanvas(frame);
  const tiles: Uint8Array[] = [];
  for (let index = 0; index < 2; index++) {
    const tile = createCanvas(288, 144);
    const ctx = requiredCanvasContext(tile);
    ctx.drawImage(canvas, 0, index * 144, 288, 144, 0, 0, 288, 144);
    // The SDK converts PNG to Gray4. Prequantize brightness to sixteen levels.
    const pixels = ctx.getImageData(0, 0, 288, 144);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const level = Math.round(Math.max(pixels.data[i]!, pixels.data[i + 1]!, pixels.data[i + 2]!) / 17) * 17;
      pixels.data[i] = level; pixels.data[i + 1] = level; pixels.data[i + 2] = level; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    tiles.push(await canvasToPngBytes(tile));
  }
  return tiles;
}

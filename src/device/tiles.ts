import type { DisplayFrame } from '../core/contracts.js';
import { renderArtifact, preloadArtifactImages } from '../artifacts/index.js';
import { createCanvas, requiredCanvasContext, canvasToPngBytes } from '../artifacts/render.js';

/**
 * Displayed brightness of each Gray4 input level, measured end to end through the SDK in Even Hub
 * simulator 0.9.5 (its 0.9.3 release matched encoded-image conversion to the glasses). Levels 9 to 15
 * all show at full brightness, and low levels are lifted: a linear level 6 fill shows at 84%, so text
 * drawn on it disappears. Confirm on hardware; see docs/DISPLAY.md.
 */
export const DISPLAYED_LEVELS = [0, 96, 131, 157, 179, 197, 214, 230, 244, 255] as const;
/** Input byte to send for each intended brightness, so the glasses show what the canvas preview shows. */
export const COMPENSATED = Uint8Array.from({ length: 256 }, (_, intended) => {
  let best = 0;
  for (let level = 1; level < DISPLAYED_LEVELS.length; level++) {
    if (Math.abs(DISPLAYED_LEVELS[level]! - intended) < Math.abs(DISPLAYED_LEVELS[best]! - intended)) best = level;
  }
  // Full brightness goes out as level 15 rather than the first saturated level, in case hardware differs.
  return best === DISPLAYED_LEVELS.length - 1 ? 255 : best * 17;
});

export async function artifactCanvas(frame: DisplayFrame): Promise<HTMLCanvasElement> {
  const canvas = createCanvas(288, 288);
  if (frame.artifact && frame.layout === 'split') {
    await preloadArtifactImages(frame.artifact.template, frame.artifact.data);
    renderArtifact(requiredCanvasContext(canvas), frame.artifact.template, frame.artifact.data, { scroll: frame.scroll, chosen: frame.chosen });
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
    // The SDK converts PNG to Gray4. Send levels already compensated for the display response.
    const pixels = ctx.getImageData(0, 0, 288, 144);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const level = COMPENSATED[Math.max(pixels.data[i]!, pixels.data[i + 1]!, pixels.data[i + 2]!)]!;
      pixels.data[i] = level; pixels.data[i + 1] = level; pixels.data[i + 2] = level; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    tiles.push(await canvasToPngBytes(tile));
  }
  return tiles;
}

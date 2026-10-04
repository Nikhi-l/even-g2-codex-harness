// Self-contained canvas/render primitives for the G2 artifact template
// framework. Owned by this module (mirrors the helpers in main.ts) so the
// `artifacts/` package can later be extracted into a standalone Even G2 app
// without depending on the demo app. All primitives are pure / browser-only.

export const ARTIFACT_W = 288;
export const ARTIFACT_H = 288;

export const ARTIFACT_COLORS = {
  green: "#31f79c",
  dim: "#15915b",
  panel: "#176e49",
  cyan: "#46c7e0",
  bg: "#000000"
} as const;

export const ARTIFACT_FONT = "Menlo, Monaco, Consolas, monospace";

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function requiredCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering context is unavailable.");
  return context;
}

export async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("Artifact PNG encode failed."));
    }, "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export function fitCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (context.measureText(compact).width <= maxWidth) return compact;
  let next = compact;
  while (next.length > 4 && context.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1).trimEnd();
  }
  return `${next}...`;
}

export function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of normalized.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.map((entry) => fitCanvasText(context, entry, maxWidth));
}

export function roundRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
}

export function strokeRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  context.beginPath();
  roundRectPath(context, x, y, width, height, radius);
  context.stroke();
}

export function drawCoverImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = Math.max(0, (image.naturalWidth - sourceWidth) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceHeight) / 2);
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

// Image cache (by src). Templates declare the srcs they need; the surface
// preloads them before drawing, and templates read them synchronously.
//
// Srcs can also be ALIASES: the host app registers stable keys (e.g. an asset's
// key "architecture" -> a bundled asset URL) so the agent can reference images by
// key in show_artifact data without knowing bundle URLs.
const imagePromises = new Map<string, Promise<HTMLImageElement>>();
const loadedImages = new Map<string, HTMLImageElement>();
const imageAliases = new Map<string, string>();

/** Normalize an alias/reference: "Architecture" -> "architecture". */
export function imageKey(ref: string): string {
  return ref
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function registerImageAlias(alias: string, src: string): void {
  imageAliases.set(imageKey(alias), src);
}

export function registeredImageKeys(): string[] {
  return [...imageAliases.keys()];
}

/** Only explicitly registered, bundled image aliases are accepted. No network URLs. */
export function resolveImageSrc(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  return imageAliases.get(imageKey(ref));
}

export function loadImage(ref: string): Promise<HTMLImageElement> {
  const src = resolveImageSrc(ref);
  if (!src) return Promise.reject(new Error("Artifact image src is empty."));
  const cached = imagePromises.get(src);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => { image.src = ""; imagePromises.delete(src); reject(new Error("Image load timed out")); }, 5000);
    image.onload = () => {
      clearTimeout(timer);
      loadedImages.set(src, image);
      resolve(image);
    };
    image.onerror = () => { clearTimeout(timer); imagePromises.delete(src); reject(new Error("Bundled image failed to load")); };
    image.src = src;
  });
  imagePromises.set(src, promise);
  return promise;
}

export async function preloadImages(refs: string[]): Promise<void> {
  await Promise.all([...new Set(refs.filter(Boolean))].map((ref) => loadImage(ref)));
}

export function cachedImage(ref: string | undefined): HTMLImageElement | null {
  const src = resolveImageSrc(ref);
  if (!src) return null;
  return loadedImages.get(src) ?? null;
}

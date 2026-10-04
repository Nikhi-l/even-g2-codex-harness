// Template registry + the public render / preload / tool-building entry points.

import { z } from "zod";
import { artifactSchema } from "../core/contracts.js";

import {
  ARTIFACT_COLORS,
  ARTIFACT_FONT,
  ARTIFACT_H,
  ARTIFACT_W,
  cachedImage,
  preloadImages
} from "./render.js";
import type { ArtifactTemplate, ArtifactToolSpec, ArtifactView, RenderContext } from "./types.js";

const registry = new Map<string, ArtifactTemplate>();

export function registerTemplate(template: ArtifactTemplate): void {
  registry.set(template.id, template);
}

export function getTemplate(id: string): ArtifactTemplate | undefined {
  return registry.get(id);
}

export function allTemplates(): ArtifactTemplate[] {
  return [...registry.values()];
}

export function isTemplate(id: string): boolean {
  return registry.has(id);
}

/** Preload any images a template+data needs, before a synchronous render(). */
export async function preloadArtifactImages(templateId: string, data: unknown): Promise<void> {
  const template = registry.get(templateId);
  if (!template?.images) return;
  await preloadImages(template.images(data));
}

/** Draw a template+data onto a 288x288 artifact context (structure for one frame). */
export function renderArtifact(
  context: CanvasRenderingContext2D,
  templateId: string,
  data: unknown,
  view: ArtifactView = { scroll: 0 }
): void {
  context.clearRect(0, 0, ARTIFACT_W, ARTIFACT_H);
  context.fillStyle = ARTIFACT_COLORS.bg;
  context.fillRect(0, 0, ARTIFACT_W, ARTIFACT_H);
  context.lineCap = "square";
  context.lineJoin = "round";

  const template = registry.get(templateId);
  if (!template) {
    context.fillStyle = ARTIFACT_COLORS.green;
    context.font = `700 16px ${ARTIFACT_FONT}`;
    context.fillText(`Unknown artifact: ${templateId}`.slice(0, 28), 16, 40);
    return;
  }

  const rc: RenderContext = {
    ctx: context,
    width: ARTIFACT_W,
    height: ARTIFACT_H,
    colors: ARTIFACT_COLORS,
    view,
    image: cachedImage
  };
  template.render(rc, data);
}

/**
 * Build the single registry-driven agent tool. The core catalog supplies the
 * validated schema while this registry supplies renderer descriptions, so a custom agent only ever
 * needs this one tool to render any registered artifact.
 */
export function buildShowArtifactTool(): ArtifactToolSpec {
  const templates = allTemplates();
  const guide = templates.map((t) => `- ${t.id}: ${t.dataHint}`).join("\n");
  return {
    type: "function",
    name: "show_artifact",
    description:
      "Show a custom UI artifact on the wearer's Even G2 display. Pick the template that best presents the information, and pass its data. Templates and their data shapes:\n" +
      guide,
    parameters: z.toJSONSchema(z.strictObject({
      artifact: artifactSchema,
      expectedRevision: z.number().int().nonnegative().optional()
    }))
  };
}

/** Short prose describing the templates, for injection into the agent instructions. */
export function describeTemplatesForPrompt(): string {
  return (
    "You can render custom display cards with show_artifact({artifact: {id, template, data, answer}}). Available templates: " +
    allTemplates()
      .map((t) => t.id)
      .join(", ") +
    ". Prefer show_artifact for structured information (lists, schedules, agendas)."
  );
}

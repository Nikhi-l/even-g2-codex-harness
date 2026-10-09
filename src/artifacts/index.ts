// Public API of the G2 artifact template framework.
//
// Importing this module registers the built-in templates (side effects below)
// and re-exports the render/registry/tool entry points. The host app (main.ts)
// only needs this file; nothing here depends on the demo, so the module can be
// lifted into a standalone Even G2 app later.

// Built-in templates self-register on import:
import "./templates/list.js";
import "./templates/schedule.js";
import "./templates/image.js";
import "./templates/image-grid.js";
import "./templates/list-thumbnails.js";
import "./templates/card.js";
import "./templates/calendar.js";
import "./templates/checklist.js";
import "./templates/choices.js";
import "./templates/stat.js";
import "./templates/directions.js";
import "./templates/code.js";

export {
  registerTemplate,
  getTemplate,
  allTemplates,
  isTemplate,
  renderArtifact,
  preloadArtifactImages,
  buildShowArtifactTool,
  describeTemplatesForPrompt
} from "./registry.js";
export { ARTIFACT_W, ARTIFACT_H, imageKey, registerImageAlias, registeredImageKeys } from "./render.js";
export type { ArtifactTemplate, ArtifactToolSpec, ArtifactView, RenderContext } from "./types.js";

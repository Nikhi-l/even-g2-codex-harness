// Core types for the declarative artifact template framework.
//
// A template renders one kind of "custom UI element" onto the G2 artifact pane.
// The agent picks a template id + data; the surface renders the structure once
// and pushes only incremental updates. Templates are pure draw functions over a
// RenderContext, so the module stays decoupled from the demo app and can be
// extracted into a standalone Even G2 app later.

import { ARTIFACT_COLORS } from "./render.js";

/** Per-render view state (scroll position, thinking flag) supplied by the surface. */
export type ArtifactView = {
  scroll: number;
  thinking?: boolean;
  /** Option the wearer chose on a `choices` artifact. */
  chosen?: number | null;
};

/** Everything a template needs to draw, without importing the host app. */
export type RenderContext = {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  colors: typeof ARTIFACT_COLORS;
  view: ArtifactView;
  /** Synchronous lookup of a preloaded image by src (null if not yet loaded). */
  image: (src: string | undefined) => HTMLImageElement | null;
};

/**
 * A registered artifact template. `id` is what the agent passes to show_artifact;
 * `dataHint` documents the expected `data` shape for the agent tool; `images`
 * declares any srcs to preload before drawing; `render` draws onto the context.
 */
export type ArtifactTemplate = {
  id: string;
  title: string;
  /** One-line description + the `data` shape, surfaced in the agent tool description. */
  dataHint: string;
  /** Optional: srcs the surface should preload before render() runs. */
  images?: (data: unknown) => string[];
  render: (rc: RenderContext, data: unknown) => void;
};

/** The agent-facing function-tool shape (OpenAI realtime "function" tool). */
export type ArtifactToolSpec = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

# Quiet Surfaces asset provenance

Created for this repository with the built-in image generation tool on 2026-10-11. No external photos, real contacts or celebrity likenesses were supplied. The portraits are realistic **fictional AI-generated people**, as requested. Originals are bundled locally; there is no runtime third-party image request.

| File in `src/web/public/assets/` | Generation brief | Use |
| --- | --- | --- |
| `portrait-mira.png` | Fictional South Asian woman in her late thirties; natural curly hair, head and shoulders, grayscale photography, black seamless background, simple dark clothing and clear facial structure. | Always-labelled portrait card |
| `portrait-ren.png` | Fictional East Asian man in his early sixties; thoughtful, friendly expression, natural smile lines, short salt-and-pepper hair, simple dark crew neck. Close portrait with clear side lighting, pure black background and grayscale photographic texture. | Always-labelled portrait card |
| `moonrise.png` | Quiet grayscale lunar crescent in the lower-right above a low dark ridge, black sky with large empty upper-left space. Clear silhouette and minimal detail for a small display. No text. | Static background |
| `ginkgo.png` | Three photographic grayscale ginkgo leaves in the lower-right; subtle veins, pure black background, large empty upper-left space. No text. | Static background |

The generated files are source art. Runtime canvas composition downsamples them, places labels separately, and converts the whole artifact to green brightness levels. Original portrait files do not contain a baked-in label; their filename, this manifest and the renderer identify them as fictional. Preserve this provenance when reusing the source files.

`docs/assets/quiet-surfaces-concepts.png` is AI-generated concept art: six wide interface directions (portrait, field note, focus, botanical, voice and wayfinder), sparse details, generous black space and restrained typography. A second generation pass corrected every display pixel and label to monochrome green and added “AI FICTIONAL” and “CONCEPTS / GREEN MONOCHROME / NOT DEVICE CAPTURES”. These are design directions; the actual runtime keeps the existing answer/artifact split. Contours, stars, dials and motion frames are deterministic canvas code, not generated photos.

The source prompt constraints were: no real identifiable person, celebrity, branding, watermark or unrelated text; clear shapes that survive small-resolution display; no colored source photographs. The green concept edit additionally prohibited white/cyan/teal display graphics and neon bloom. All deliverable assets are in this repository, with no dependency on a generator cache path.

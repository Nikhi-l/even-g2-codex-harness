# G2 screen rules: fitting text and contrast

The phone renders artifacts, but the glasses firmware draws the answer text and converts the artifact tiles. Two firmware behaviours decide whether a screen is readable. Both were measured on 2026-10-10 in the official Even Hub simulator 0.9.5 through the real SDK, and both still need confirmation on hardware.

## 1. Native text must fit, or the wearer loses scrolling

The firmware draws text containers in one proportional font with no size control, wraps at the container width, and **scrolls an event-capture container whose text overflows**. That scrolling takes the wearer's scroll gesture: it moves hidden text instead of the artifact list, and it emits boundary events. So every frame is built to fit.

| Measurement | Value |
| --- | --- |
| Line pitch | 27 px |
| Lines fully visible in a 288 px tall container with 6 px padding | 10 (an eleventh is cut off and a scrollbar appears) |
| Advance widths | space 5, `i` `l` 4 to 5, most lower case 10 to 11, digits 12, `M` `W` `m` 16, `@` 17 px |
| Wrapping | word wrap at the container width; long words break mid-word |
| Glyph coverage in the simulator | Latin with accents, CJK, arrows, box symbols. `✓` was dropped |

`src/core/text.ts` holds the measured ASCII advance table and wraps by pixel width, with conservative widths for other scripts (13 px Latin supplements, 20 px symbols, 24 px CJK and emoji). Budgets keep a hardware margin:

- Split view (288 px pane): 260 px and at most 48 characters per row.
- Full width (576 px): 530 px and at most 96 characters per row.
- Every page is a header, a blank line and **8 answer rows**. The header carries the speaker (`CLAUDE`, `CODEX`, `AGENT`) and, when there is more than one page, the page marker, for example `CLAUDE  2/5`.

The previous 21-column wrap was wrong both ways: 21 `W` glyphs are 336 px wide and overflow the 276 px usable width, while ordinary lower case fits about 27 characters. Its paged frames could also reach 13 lines.

### Updating text without overflow

`textContainerUpgrade` is the fast, flicker-free update. In the simulator it ignores `contentOffset` and `contentLength` and replaces the whole text, so the old "append the new tail at an offset" optimisation showed only the tail. Display_Mcp had already disabled offset appends after device testing ("firmware mis-renders partial text updates"). Padding a shorter text with spaces, to clear an old tail on firmware that overwrites in place, is also unsafe: spaces wrap into extra lines (900 trailing spaces after "Tiny" produced a scrollbar).

The adapter therefore:

1. Rewrites the whole text from offset 0 when it is at least as long as the previous text. That covers the old buffer under either firmware behaviour.
2. Rebuilds the page when the text gets shorter, then refills both image tiles. No padding is ever sent.

## 2. Artifact tiles need tone compensation

The SDK converts each PNG tile to 4-bit grey. The displayed brightness of each input level is not linear:

| Input level (value) | 0 | 1 (17) | 2 (34) | 3 (51) | 4 (68) | 5 (85) | 6 (102) | 7 (119) | 8 (136) | 9 to 15 (153 to 255) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Displayed (0 to 255) | 0 | 96 | 131 | 157 | 179 | 197 | 214 | 230 | 244 | 255 |

Levels 9 to 15 all show at full brightness, and dark levels are lifted. With plain linear quantization the dark green panel colour (level 6) showed at 84%, so text drawn on it vanished: the calendar's marked days and the highlighted choice were unreadable on the simulated glasses. The simulator's 0.9.3 notes say its encoded-image conversion matches the glasses.

`src/device/tiles.ts` now maps each pixel's intended brightness to the input level whose displayed brightness is closest, and sends full brightness as level 15. Panel fills go out at level 1, dim text at level 3, cyan at level 7 and bright green at 15. The browser preview keeps drawing the intended colours; only the glasses tiles are compensated.

## Checking a change

- `npm test` asserts that every example and every worst-case fixture, in both layouts and on every page, stays within 10 lines and the pixel budget, and that the tone table is monotonic.
- `/gallery.html?stress=1` draws worst-case data (every string at its schema maximum in wide glyphs, every list at its maximum length) at the first and last scroll position. The browser suite fails if any template draws into the outer two pixels of its pane.
- `npm run smoke:simulator` (relay running, `EVENHUB_SIMULATOR` pointing at the simulator binary) publishes all examples and worst cases through the real SDK in the simulator, waits for each `bridge-accepted` receipt, saves split and full-width glasses screenshots to `test-results/simulator/`, and fails on a lit scrollbar column or text below line ten.
- `npm run capture:gallery -- <file.png> [--stress]` saves the gallery as one contact sheet.

The 2026-10-10 run: 25 artifacts, 50 glasses screens, no overflow.

## Hardware questions

The pages in [tools/calibrate](../tools/calibrate/README.md) reproduce every measurement above; open them on the glasses with `evenhub qr`. Record the answers in VERIFICATION.md when a G2 is available:

- Does the device font match the simulator's advances and 27 px pitch? Photograph the worst-case list answer.
- Does `textContainerUpgrade` replace the text or overwrite in place? Send a long text, then a shorter one, and look for a stale tail.
- Does the tone table hold? Compare `month-view` marked days and the `next-step` highlight with the browser preview.
- Which characters are dropped? Try `✓`, emoji and the scripts your users need.

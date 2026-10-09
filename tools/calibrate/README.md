# Display calibration pages

Three Even Hub pages that measured the numbers in [DISPLAY.md](../../docs/DISPLAY.md). Run them in the simulator, and on real glasses to confirm them.

```sh
npm run calibrate                                   # serves http://127.0.0.1:5199
evenhub-simulator http://127.0.0.1:5199/ --automation-port 9898
```

| Page | What it shows | Advance with |
| --- | --- | --- |
| `/` (index) | Numbered lines in 288 and 576 px containers (line pitch, visible lines), space and wrap tests, a Unicode sample, then every printable ASCII glyph repeated 10 and 20 times (advance = width difference / 10) | Tap |
| `/upgrade.html` | `textContainerUpgrade` with offsets, content-only updates, and space padding, to see whether text is replaced or overwritten in place and whether padding wraps | Tap |
| `/gray.html` | One tile with sixteen bands at input levels 0 to 15, to read the displayed brightness of each | (static) |

In the simulator, `curl localhost:9898/api/screenshot/glasses` saves each state and `POST /api/input {"action":"click"}` advances. On glasses, serve the pages on your LAN (`npm run calibrate -- --host YOUR_MAC_LAN_IP`), open them with `evenhub qr`, and photograph the lenses. Record results in VERIFICATION.md.

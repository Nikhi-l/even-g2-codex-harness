/* global document */
// Captures the template gallery as one contact sheet: `node scripts/capture-gallery.mjs <out.png> [--stress]`.
// Needs a running relay (npm start) or demo server, and Playwright's Chromium.
import { chromium } from '@playwright/test';
const [out, ...flags] = process.argv.slice(2);
if (!out) { console.error('Usage: node scripts/capture-gallery.mjs <out.png> [--stress] [--origin http://127.0.0.1:8787]'); process.exit(1); }
const originFlag = flags.indexOf('--origin');
const origin = originFlag >= 0 ? flags[originFlag + 1] : 'http://127.0.0.1:8787';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(`${origin}/gallery.html${flags.includes('--stress') ? '?stress=1' : ''}`);
  await page.waitForSelector('body[data-ready="true"]');
  const overflow = await page.evaluate(() => document.body.dataset.overflow);
  const size = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    const cols = Math.min(4, canvases.length), pad = 12, rows = Math.ceil(canvases.length / cols);
    const sheet = document.createElement('canvas');
    sheet.width = cols * (288 + pad) + pad; sheet.height = rows * (288 + pad) + pad;
    const ctx = sheet.getContext('2d'); ctx.fillStyle = '#1b2a22'; ctx.fillRect(0, 0, sheet.width, sheet.height);
    canvases.forEach((canvas, i) => ctx.drawImage(canvas, pad + (i % cols) * (288 + pad), pad + Math.floor(i / cols) * (288 + pad)));
    document.body.replaceChildren(sheet); document.body.style.margin = '0';
    return { width: sheet.width, height: sheet.height };
  });
  await page.setViewportSize(size);
  await page.locator('canvas').screenshot({ path: out });
  console.log(`Saved ${out} (${size.width}×${size.height}); edge overflow: ${overflow}`);
} finally { await browser.close(); }

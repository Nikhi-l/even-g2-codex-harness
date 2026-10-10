import { test, expect } from '@playwright/test';

test('collection is green-only, contains real images, and defaults to still playback', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/surfaces.html'); await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#collection canvas')).toHaveCount(10);
  const stats = await page.locator('#collection canvas').evaluateAll(nodes => nodes.map(node => {
    const pixels = (node as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 288, 288).data;
    let lit = 0, offGreen = 0; const levels = new Set<number>();
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 1]! > 0) lit++;
      if (pixels[i]! !== 0 || pixels[i + 2]! !== 0 || pixels[i + 1]! % 17 !== 0) offGreen++;
      levels.add(pixels[i + 1]!);
    }
    return { lit, offGreen, levels: levels.size };
  }));
  expect(stats.every(result => result.offGreen === 0 && result.lit > 500 && result.levels <= 16)).toBe(true);
  expect(stats[0]!.levels).toBeGreaterThan(8); // Portrait shading loaded, not a placeholder.
  await page.getByRole('button', { name: 'Select A slower moment', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', '0');
  await page.waitForTimeout(1200); await expect(page.locator('body')).toHaveAttribute('data-phase', '0');
  await page.getByRole('button', { name: 'Step frame', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', '1');
  await page.getByRole('button', { name: 'Play motion', exact: true }).click();
  await expect.poll(() => page.locator('body').getAttribute('data-phase')).not.toBe('1');
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click();
  const paused = await page.locator('body').getAttribute('data-phase');
  await page.waitForTimeout(1200); await expect(page.locator('body')).toHaveAttribute('data-phase', paused!);
  await page.getByRole('button', { name: 'Play motion', exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: 'Play motion', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('every motion mode changes only the lower tile across all sixteen phases', async ({ page }) => {
  test.setTimeout(45000);
  await page.goto('/surfaces.html'); await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  for (const scene of ['6', '7', '8', '9']) {
    await page.selectOption('#scene', scene);
    let top: string | undefined; const lower = new Set<string>();
    for (let phase = 0; phase < 16; phase++) {
      const pixels = await page.locator('#display').evaluate(node => {
        const ctx = (node as HTMLCanvasElement).getContext('2d')!;
        // Compact, exact pixel serialization avoids transferring repeated RGBA
        // arrays: these pixels have only a green channel and an opaque alpha.
        const key = (y: number) => {
          const pixels = ctx.getImageData(288, y, 288, 144).data;
          let result = '';
          for (let i = 1; i < pixels.length; i += 4) result += String.fromCharCode(pixels[i]!);
          return result;
        };
        return { top: key(0), lower: key(144) };
      });
      if (!top) top = pixels.top;
      else expect(pixels.top).toEqual(top);
      lower.add(pixels.lower);
      await page.getByRole('button', { name: 'Step frame', exact: true }).click();
    }
    expect(lower.size).toBeGreaterThanOrEqual(8);
  }
});

test('studio uses the real SDK with a mock bridge and survives HTTP UUID restrictions', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined });
    const methods: string[] = []; let inFlight = 0, maxInFlight = 0;
    Object.assign(window, { studioNative: { methods, max: () => maxInFlight }, flutter_inappwebview: { async callHandler(_handler: string, raw: string) {
      const message = JSON.parse(raw) as { method: string }; methods.push(message.method);
      if (message.method === 'createStartUpPageContainer') return 0;
      if (message.method === 'updateImageRawData') {
        maxInFlight = Math.max(maxInFlight, ++inFlight);
        await new Promise(resolve => setTimeout(resolve, 40)); inFlight--;
        return 'success';
      }
      return true;
    } } });
  });
  await page.goto('/surfaces.html'); await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.selectOption('#scene', '7');
  await page.getByRole('button', { name: 'Connect Even Hub', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Bridge accepted');
  await page.getByRole('button', { name: 'Step frame', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Bridge accepted');
  const native = await page.evaluate(() => {
    const native = (window as unknown as { studioNative: { methods: string[]; max: () => number } }).studioNative;
    return { max: native.max(), images: native.methods.filter(method => method === 'updateImageRawData').length };
  });
  expect(native.max).toBe(1);
  // Two initial tiles, then one changed tile if the host adapter supports
  // tile deduplication, otherwise both tiles. Either path must stay serial.
  expect([3, 4]).toContain(native.images);
  await page.getByLabel('Also send to Even Hub').uncheck();
  await page.getByRole('button', { name: 'Step frame', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Device sending paused');
});

test('capture the actual studio and collection for review', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.goto('/surfaces.html'); await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.screenshot({ path: 'test-results/quiet-surfaces-studio.png', fullPage: true });
  await page.locator('#collection').screenshot({ path: 'test-results/quiet-surfaces-collection.png' });
});

test('reduced motion allows manual steps and mobile layout stays within viewport', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 360, height: 844 });
  await page.goto('/surfaces.html'); await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  await page.selectOption('#scene', '9');
  await expect(page.getByRole('button', { name: 'Play motion', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Step frame', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#payload')).toContainText('decorative demo motion');
});

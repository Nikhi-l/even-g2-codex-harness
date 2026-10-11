import { test, expect, type Page } from '@playwright/test';

const choose = (page: Page, id: string) => page.locator(`[data-option="${id}"]`).click();
async function reply(page: Page) {
  await page.locator('[data-destination="people"]').click();
  await choose(page, 'person:mira');
  await page.locator('#voice').click();
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'listening');
}

test('social preview rehearses a private voice reply without network or microphone calls', async ({ page }) => {
  const errors: string[] = [], outbound: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (new URL(request.url()).host !== '127.0.0.1:8799') outbound.push(request.url()); });
  await page.addInitScript(() => {
    Object.assign(window, { microphoneRequests: 0 });
    navigator.mediaDevices.getUserMedia = async () => { (window as unknown as { microphoneRequests: number }).microphoneRequests++; throw new Error('Microphone forbidden in prototype'); };
  });
  await page.goto('/social.html');
  await expect(page).toHaveTitle('Sideband · Social for G2');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'trending');
  await expect(page.locator('#display')).toHaveAttribute('aria-label', /Took the long way home/);
  await reply(page);
  await page.locator('#transcript').fill('See you at the bookshop tomorrow.');
  await page.locator('#use-transcript').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'review');
  await expect(page.locator('#display')).toHaveAttribute('aria-label', /To Mira/);
  await expect(page.locator('body')).toHaveAttribute('data-message-count', '2');
  await expect(page.locator('[data-destination="people"]')).toBeDisabled();
  await choose(page, 'send');
  await expect(page.locator('body')).toHaveAttribute('data-message-count', '3');
  await expect(page.locator('#display')).toHaveAttribute('aria-label', /Demo sent/);
  await expect(page.locator('#display')).toHaveAttribute('aria-label', /See you at the bookshop tomorrow/);
  expect(await page.evaluate(() => (window as unknown as { microphoneRequests: number }).microphoneRequests)).toBe(0);
  expect(errors).toEqual([]); expect(outbound).toEqual([]);
});

test('offline send keeps the reviewed draft and reconnect does not send automatically', async ({ page }) => {
  await page.goto('/social.html'); await reply(page);
  await page.locator('#use-transcript').click();
  await page.locator('#network').click();
  await choose(page, 'send');
  await expect(page.locator('#display')).toHaveAttribute('aria-label', /Offline. Draft kept/);
  await expect(page.locator('body')).toHaveAttribute('data-message-count', '2');
  await page.locator('#network').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'review');
  await expect(page.locator('body')).toHaveAttribute('data-message-count', '2');
  await choose(page, 'send');
  await expect(page.locator('body')).toHaveAttribute('data-message-count', '3');
});

test('cancel, rerecord, and backgrounding never send; keyboard controls remain operable', async ({ page }) => {
  await page.goto('/social.html');
  await page.locator('#menu').click();
  await page.locator('body').click({ position: { x: 220, y: 100 } });
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'people');
  await choose(page, 'person:mira'); await page.locator('#voice').click();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'review');
  await choose(page, 'rerecord');
  await expect(page.locator('body')).toHaveAttribute('data-phase', 'ready');
  await choose(page, 'cancel');
  await expect(page.locator('body')).toHaveAttribute('data-message-count', '2');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'conversation');
});

test('local save, report, block and empty states are honest and reversible by reset', async ({ page }) => {
  await page.goto('/social.html'); await choose(page, 'post-actions');
  await choose(page, 'save');
  await page.locator('[data-destination="saved"]').click();
  await expect(page.locator('#display')).toHaveAttribute('aria-label', /SAVED/);
  await choose(page, 'post-actions'); await choose(page, 'report'); await choose(page, 'report:spam');
  await expect(page.locator('#status')).toContainText('No report was sent');
  await choose(page, 'profile'); await choose(page, 'block');
  await page.locator('[data-destination="people"]').click();
  await expect(page.locator('[data-option="person:mira"]')).toHaveCount(0);
  await page.locator('#reset').click(); await page.locator('[data-destination="people"]').click();
  await expect(page.locator('[data-option="person:mira"]')).toBeVisible();
  await page.goto('/social.html?fixture=empty');
  await expect(page.locator('#display')).toHaveAttribute('aria-label', /all caught up/);
  await choose(page, 'home');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'home');
});

test('real SDK with mocked host sends text serially and never opens the microphone', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: { method: string; data: unknown }[] = []; let active = 0, max = 0;
    Object.assign(window, { socialNative: { calls, max: () => max }, flutter_inappwebview: { async callHandler(_handler: string, raw: string) {
      const message = JSON.parse(raw) as { method: string; data: unknown }; calls.push(message);
      max = Math.max(max, ++active); await new Promise(resolve => setTimeout(resolve, 20)); active--;
      return message.method === 'createStartUpPageContainer' ? 0 : true;
    } } });
  });
  await page.goto('/social.html'); await page.locator('#connect').click();
  await expect(page.locator('#status')).toContainText('Bridge accepted');
  await page.locator('[data-destination="people"]').click(); await choose(page, 'person:mira');
  await expect.poll(() => page.evaluate(() => {
    const native = (window as unknown as { socialNative: { calls: { method: string; data: unknown }[] } }).socialNative;
    return JSON.stringify(native.calls.at(-1)?.data);
  })).toContain('MIRA');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('evenHubEvent', { detail: { sysEvent: { eventType: 3 } } })));
  await expect.poll(() => page.evaluate(() => (window as unknown as { socialNative: { calls: { method: string }[] } }).socialNative.calls.at(-1)?.method)).toBe('shutDownPageContainer');
  const native = await page.evaluate(() => {
    const value = (window as unknown as { socialNative: { calls: { method: string; data: unknown }[]; max: () => number } }).socialNative;
    return { calls: value.calls, max: value.max() };
  });
  expect(native.max).toBe(1);
  expect(native.calls.map(call => call.method)).not.toContain('audioControl');
  expect(native.calls.map(call => call.method)).not.toContain('updateImageRawData');
  const create = native.calls.find(call => call.method === 'createStartUpPageContainer')!.data as { textObject: { isEventCapture: number; content: string }[] };
  expect(create.textObject.filter(container => container.isEventCapture === 1)).toHaveLength(1);
  expect(create.textObject.every(container => container.content.split('\n').length <= 10)).toBe(true);
});

test('ordinary browser connection failure is visible and cannot silently retry', async ({ page }) => {
  await page.goto('/social.html'); await page.locator('#connect').click();
  await expect(page.locator('#status')).toContainText(/not found|rejected/, { timeout: 10000 });
  await expect(page.locator('#connect')).toBeDisabled();
  await page.locator('[data-destination="people"]').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'people');
});

for (const width of [360, 390, 1440]) test(`social layout and worst-case text stay bounded at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/social.html?fixture=stress');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const before = await page.locator('#display').getAttribute('aria-label');
  expect(before?.split('\n').length).toBeLessThanOrEqual(10);
  await choose(page, 'post-page');
  await expect(page.locator('#display')).not.toHaveAttribute('aria-label', before!);
  await expect(page.locator('#select')).toBeVisible();
});

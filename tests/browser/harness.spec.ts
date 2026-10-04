import { test, expect } from '@playwright/test';
const testToken = 'browser-test-only-token-00000000000000';

test('gallery renders all seven genuine canvases', async ({ page }) => {
 const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
 await page.goto('/gallery.html'); await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
 await expect(page.locator('canvas')).toHaveCount(7);
 const rendered = await page.locator('canvas').evaluateAll(nodes => nodes.map(node => {
  const canvas = node as HTMLCanvasElement;
  const pixels = canvas.getContext('2d')!.getImageData(0,0,288,288).data;
  let lit = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i+1]! > 30) lit++;
  return lit;
 }));
 expect(rendered.every(count => count > 500)).toBe(true); expect(errors).toEqual([]);
});

test('template selection, editor, scroll, pane toggle and clear work', async ({ page }) => {
 await page.goto('/'); await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 const before = await page.locator('#display').evaluate(node => (node as HTMLCanvasElement).toDataURL());
 await page.getByRole('button',{ name: '↓ Scroll down', exact: true }).click();
 await expect(page.locator('#activity-log')).toContainText('Input · next');
 await expect.poll(() => page.locator('#display').evaluate(node => (node as HTMLCanvasElement).toDataURL())).not.toBe(before);
 await page.getByRole('button',{ name: 'Tap · toggle pane', exact: true }).click();
 await expect(page.locator('#layout-button')).toHaveText('Open artifact');
 await page.getByRole('button',{ name: '07 Calendar', exact: true }).click();
 await expect(page.locator('#template-name')).toHaveText('calendar');
 await page.getByLabel('Template payload').fill('{ broken');
 await page.getByRole('button',{ name: 'Show artifact', exact: true }).click();
 await expect(page.locator('#message')).toContainText('valid JSON');
 await page.getByRole('button',{ name: 'Clear display', exact: true }).click();
 await expect(page.locator('#artifact-label')).toHaveText('Display cleared');
 await expect.poll(() => page.locator('#display').evaluate(node => {
  const pixels = (node as HTMLCanvasElement).getContext('2d')!.getImageData(0,0,576,288).data;
  return pixels.some((value, index) => index % 4 !== 3 && value !== 0);
 })).toBe(false);
});

test('authenticated relay connects and removes the token from the URL', async ({ page, request }) => {
 await page.goto(`/#token=${testToken}`);
 await expect(page.locator('#mode-label')).toHaveText('Connected relay');
 expect(page.url()).not.toContain(testToken);
 await page.getByRole('button',{ name: '06 Card', exact: true }).click();
 const state = await request.get('/api/state', { headers: { authorization: `Bearer ${testToken}` } });
 expect((await state.json() as { activeId: string }).activeId).toBe('build-card');
 await expect.poll(async () => {
  const response = await request.get('/api/state', { headers: { authorization: `Bearer ${testToken}` } });
  return (await response.json() as { deliveries: { status: string }[] }).deliveries.map(value => value.status);
 }).toContain('browser-rendered');
});

test('phone layout has no horizontal page overflow', async ({ page }) => {
 await page.setViewportSize({width:390,height:844}); await page.goto('/?template=calendar');
 await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await expect(page.getByRole('button',{name:'Show artifact',exact:true})).toBeVisible();
});

test('ordinary browser never reports device delivery', async ({ page }) => {
 await page.goto('/'); await page.getByRole('button',{name:'Connect Even Hub',exact:true}).click();
 await expect(page.locator('#message')).toContainText(/Even Hub bridge not found|Page creation rejected/, {timeout:10000});
 await expect(page.locator('#adapter-status')).toHaveText(/Browser preview|Failed · reopen Even Hub/);
 await expect(page.locator('#delivery-label')).not.toContainText('Bridge accepted');
});

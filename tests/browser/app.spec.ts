import { test, expect, type Page } from '@playwright/test';

async function nativeMock(page: Page, options: { savedRelay?: string; blockRead?: boolean; blockErase?: boolean } = {}) {
 await page.addInitScript(options => {
  const calls: {method: string; data: unknown}[] = [];
  const settings: Record<string, string> = JSON.parse(localStorage.getItem('mockPhoneStorage') ?? JSON.stringify(options.savedRelay ? {'g2-artifact-relay-v1':options.savedRelay} : {})) as Record<string, string>;
  const releaseNative: Record<string, () => void> = {};
  Object.assign(window, { nativeCalls: calls, releaseNative, flutter_inappwebview: { async callHandler(_handler: string, raw: string) {
   const message = JSON.parse(raw) as { method: string; data?: { key?: string; value?: string } };
   calls.push({ method: message.method, data: message.method === 'updateImageRawData' ? '[PNG bytes]' : message.data });
   if (message.method === 'createStartUpPageContainer') return 0;
   if (message.method === 'updateImageRawData') return 'success';
   if (message.method === 'getLocalStorage') {
    const value = settings[message.data?.key ?? ''] ?? '';
    if (options.blockRead) await new Promise<void>(resolve => {releaseNative.read = resolve;});
    return value;
   }
   if (message.method === 'setLocalStorage') {
    if (options.blockErase && message.data?.value === '') await new Promise<void>(resolve => {releaseNative.erase = resolve;});
    settings[message.data?.key ?? ''] = message.data?.value ?? '';
    localStorage.setItem('mockPhoneStorage', JSON.stringify(settings));
   }
   return true;
  } } });
 }, options);
}

async function recordTextChanges(page: Page, selector: string) {
 await page.evaluate(selector => {
  const target = document.querySelector(selector)!;
  const recordedTexts: string[] = []; Object.assign(window, {recordedTexts});
  new MutationObserver(() => recordedTexts.push(target.textContent ?? '')).observe(target, {childList:true,characterData:true,subtree:true});
 }, selector);
}

test('QR app mode starts through the real SDK and requests its system exit dialog', async ({page}) => {
 await nativeMock(page);
 await page.goto('/?evenhub=1&template=image_grid');
 await expect(page.locator('#adapter-status')).toHaveText('Even Hub · accepted');
 await expect(page.locator('#answer')).toHaveValue(/Bundled demo\. Connect your relay/);
 await page.getByRole('button', {name:'Double tap · system exit',exact:true}).click();
 await expect.poll(() => page.evaluate(() => (window as unknown as {nativeCalls: {method:string;data:unknown}[]}).nativeCalls.filter(call => call.method === 'shutDownPageContainer'))).toEqual([{method:'shutDownPageContainer',data:{exitMode:1}}]);
});

test('remembered setup restores after reload and forgetting removes the saved token', async ({page, request}) => {
 await nativeMock(page);
 const token = 'browser-test-only-token-00000000000000';
 const response = await request.get('/api/state', {headers:{authorization:`Bearer ${token}`}});
 const state: unknown = await response.json();
 await page.route('**/harness-config.json', route => route.fulfill({json:{relayOrigin:'https://relay.example.com',autoConnectEven:true}}));
 await page.route('https://relay.example.com/**', route => route.fulfill({json:state}));
 await page.goto('/');
 await expect(page.locator('#adapter-status')).toHaveText('Even Hub · accepted');
 await page.getByRole('button',{name:'Connect relay',exact:true}).click();
 await page.getByLabel('Access token').fill(token);
 await page.getByLabel('Remember this connection on my phone').check();
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await expect(page.locator('#mode-label')).toHaveText('Connected relay');
 await expect(page.locator('#saved-status')).toHaveText('Connection remembered on this phone.');
 await page.reload();
 await expect(page.locator('#mode-label')).toHaveText('Connected relay');
 await page.getByRole('button',{name:'Connect relay',exact:true}).click();
 await page.getByRole('button',{name:'Forget saved connection',exact:true}).click();
 await expect(page.locator('#saved-status')).toContainText('Saved connection removed');
 await expect(page.locator('#mode-label')).toHaveText('Connected relay');
 await page.reload();
 await expect(page.locator('#adapter-status')).toHaveText('Even Hub · accepted');
 await expect(page.locator('#mode-label')).toHaveText('Local demo');
});

test('HTTP WebViews without randomUUID still render and accept input', async ({page}) => {
 await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
 await page.goto('/');
 await expect(page.locator('body')).toHaveAttribute('data-ready','true');
 await page.getByRole('button',{name:'↓ Scroll down',exact:true}).click();
 await expect(page.locator('#activity-log')).toContainText('Input · next');
});

test('packaged apps restrict relay setup and expose explicit remember/forget controls', async ({page}) => {
 await nativeMock(page);
 await page.route('**/harness-config.json', route => route.fulfill({json:{relayOrigin:'https://relay.example.com',autoConnectEven:true}}));
 let unexpectedRequest = false;
 await page.route('https://different.example.com/**', route => { unexpectedRequest = true; return route.abort(); });
 await page.goto('/');
 await expect(page.locator('#adapter-status')).toHaveText('Even Hub · accepted');
 await page.getByRole('button',{name:'Connect relay',exact:true}).click();
 await expect(page.getByLabel('Remember this connection on my phone')).not.toBeChecked();
 await page.getByLabel('Relay origin').fill('https://different.example.com');
 await page.getByLabel('Access token').fill('browser-test-only-token-00000000000000');
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await expect(page.locator('#message')).toContainText('configured for this package');
 expect(unexpectedRequest).toBe(false);
 await page.getByRole('button',{name:'Forget saved connection',exact:true}).click();
 await expect(page.locator('#saved-status')).toContainText('Saved connection removed');
});

test('Demo supersedes a pending automatic relay connection', async ({page, request}) => {
 const token = 'browser-test-only-token-00000000000000';
 const state: unknown = await (await request.get('/api/state', {headers:{authorization:`Bearer ${token}`}})).json();
 await nativeMock(page, {savedRelay:JSON.stringify({version:1,origin:'https://relay.example.com',token})});
 await page.route('**/harness-config.json', route => route.fulfill({json:{relayOrigin:'https://relay.example.com',autoConnectEven:true}}));
 let release!: () => void; const blocked = new Promise<void>(resolve => {release = resolve;});
 let requested!: () => void; const pending = new Promise<void>(resolve => {requested = resolve;});
 let finished!: () => void; const responded = new Promise<void>(resolve => {finished = resolve;});
 await page.route('https://relay.example.com/**', async route => {
  requested(); await blocked; await route.fulfill({json:state}); finished();
 });
 await page.goto('/'); await pending;
 await page.getByRole('button',{name:'Connect relay',exact:true}).click();
 await page.locator('#demo-button').click();
 await recordTextChanges(page, '#mode-label');
 release(); await responded;
 await expect(page.locator('#mode-label')).toHaveText('Local demo');
 expect(await page.evaluate(() => (window as unknown as {recordedTexts:string[]}).recordedTexts)).not.toContain('Connected relay');
 await page.getByRole('button',{name:'↓ Scroll down',exact:true}).click();
 await expect(page.locator('#activity-log')).toContainText('Input · next');
 await expect(page.locator('#mode-label')).toHaveText('Local demo');
});

for (const staleStatus of [200, 401]) test(`a newer connection survives an older ${staleStatus} response`, async ({page, request}) => {
 const token = 'browser-test-only-token-00000000000000';
 const state = await (await request.get('/api/state', {headers:{authorization:`Bearer ${token}`}})).json() as {revision:number;frame:{revision:number}};
 const older = {...state,revision:11,frame:{...state.frame,revision:11}};
 const newer = {...state,revision:22,frame:{...state.frame,revision:22}};
 const oldToken = 'older-browser-test-token-000000000000';
 let release!: () => void; const blocked = new Promise<void>(resolve => {release = resolve;});
 let requested!: () => void; const pending = new Promise<void>(resolve => {requested = resolve;});
 let finished!: () => void; const responded = new Promise<void>(resolve => {finished = resolve;});
 let currentReads = 0;
 await page.route('https://relay.example.com/**', async route => {
  if (route.request().headers().authorization === `Bearer ${oldToken}`) {
   requested(); await blocked;
   await route.fulfill({status:staleStatus,json:staleStatus === 200 ? older : {error:'Old credentials rejected'}}); finished();
  } else {
   if (route.request().method() === 'GET') currentReads++;
   await route.fulfill({json:newer});
  }
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Connect relay',exact:true}).click();
 await page.getByLabel('Relay origin').fill('https://relay.example.com');
 await page.getByLabel('Access token').fill(oldToken);
 await page.getByRole('button',{name:'Connect',exact:true}).click(); await pending;
 await page.getByLabel('Access token').fill(token);
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await expect(page.locator('#revision-label')).toHaveText('Revision 22');
 await recordTextChanges(page, '#revision-label');
 const before = currentReads; release(); await responded;
 await expect.poll(() => currentReads).toBeGreaterThan(before);
 await expect(page.locator('#mode-label')).toHaveText('Connected relay');
 await expect(page.locator('#revision-label')).toHaveText('Revision 22');
 expect(await page.evaluate(() => (window as unknown as {recordedTexts:string[]}).recordedTexts)).not.toContain('Revision 11');
 await expect(page.locator('#message')).not.toContainText('Old credentials rejected');
});

test('adopting a new relay invalidates mutations started against the previous relay', async ({page, request}) => {
 const token = 'browser-test-only-token-00000000000000';
 const state = await (await request.get('/api/state', {headers:{authorization:`Bearer ${token}`}})).json() as {revision:number;frame:{revision:number}};
 const older = {...state,revision:11,frame:{...state.frame,revision:11}};
 const newer = {...state,revision:22,frame:{...state.frame,revision:22}};
 let releaseConnection!: () => void; const connecting = new Promise<void>(resolve => {releaseConnection = resolve;});
 let connectionRequested!: () => void; const connectionPending = new Promise<void>(resolve => {connectionRequested = resolve;});
 let releaseMutation!: () => void; const mutating = new Promise<void>(resolve => {releaseMutation = resolve;});
 let mutationRequested!: () => void; const mutationPending = new Promise<void>(resolve => {mutationRequested = resolve;});
 let mutationFinished!: () => void; const mutationResponded = new Promise<void>(resolve => {mutationFinished = resolve;});
 let currentReads = 0;
 await page.route('https://previous.example.com/**', async route => {
  if (route.request().url().endsWith('/api/clear')) {mutationRequested();await mutating;}
  await route.fulfill({json:older});
  if (route.request().url().endsWith('/api/clear')) mutationFinished();
 });
 await page.route('https://next.example.com/**', async route => {
  connectionRequested(); await connecting;
  if (route.request().method() === 'GET') currentReads++;
  await route.fulfill({json:newer});
 });
 await page.goto('/'); await page.getByRole('button',{name:'Connect relay',exact:true}).click();
 await page.getByLabel('Relay origin').fill('https://previous.example.com'); await page.getByLabel('Access token').fill(token);
 await page.getByRole('button',{name:'Connect',exact:true}).click(); await expect(page.locator('#mode-label')).toHaveText('Connected relay');
 await page.getByRole('button',{name:'Connect relay',exact:true}).click();
 await page.getByLabel('Relay origin').fill('https://next.example.com'); await page.getByLabel('Access token').fill(token);
 await page.getByRole('button',{name:'Connect',exact:true}).click(); await connectionPending;
 await page.getByRole('button',{name:'Clear display',exact:true}).click(); await mutationPending;
 releaseConnection(); await expect(page.locator('#revision-label')).toHaveText('Revision 22');
 await recordTextChanges(page, '#revision-label');
 const before = currentReads; releaseMutation(); await mutationResponded;
 await expect.poll(() => currentReads).toBeGreaterThan(before);
 await expect(page.locator('#revision-label')).toHaveText('Revision 22');
 expect(await page.evaluate(() => (window as unknown as {recordedTexts:string[]}).recordedTexts)).not.toContain('Revision 11');
});

test('Forget cancels a pending saved-settings read', async ({page}) => {
 const token = 'browser-test-only-token-00000000000000';
 await nativeMock(page, {savedRelay:JSON.stringify({version:1,origin:'https://relay.example.com',token}),blockRead:true});
 await page.route('**/harness-config.json', route => route.fulfill({json:{relayOrigin:'https://relay.example.com',autoConnectEven:true}}));
 let relayRequests = 0;
 await page.route('https://relay.example.com/**', route => {relayRequests++;return route.abort();});
 await page.goto('/');
 await expect.poll(() => page.evaluate(() => typeof (window as unknown as {releaseNative:Record<string,()=>void>}).releaseNative.read)).toBe('function');
 await page.getByRole('button',{name:'Connect relay',exact:true}).click();
 await page.getByRole('button',{name:'Forget saved connection',exact:true}).click();
 await page.evaluate(() => (window as unknown as {releaseNative:Record<string,()=>void>}).releaseNative.read!());
 await expect(page.locator('#saved-status')).toContainText('Saved connection removed');
 await expect(page.locator('#mode-label')).toHaveText('Local demo');
 expect(relayRequests).toBe(0);
});

test('Forget stays erased when an automatic connection responds during the erase', async ({page, request}) => {
 const token = 'browser-test-only-token-00000000000000';
 const state: unknown = await (await request.get('/api/state', {headers:{authorization:`Bearer ${token}`}})).json();
 await nativeMock(page, {savedRelay:JSON.stringify({version:1,origin:'https://relay.example.com',token}),blockErase:true});
 await page.route('**/harness-config.json', route => route.fulfill({json:{relayOrigin:'https://relay.example.com',autoConnectEven:true}}));
 let release!: () => void; const blocked = new Promise<void>(resolve => {release = resolve;});
 let requested!: () => void; const pending = new Promise<void>(resolve => {requested = resolve;});
 let finished!: () => void; const responded = new Promise<void>(resolve => {finished = resolve;});
 await page.route('https://relay.example.com/**', async route => {requested();await blocked;await route.fulfill({json:state});finished();});
 await page.goto('/'); await pending;
 await page.getByRole('button',{name:'Connect relay',exact:true}).click();
 await page.getByRole('button',{name:'Forget saved connection',exact:true}).click();
 await expect.poll(() => page.evaluate(() => typeof (window as unknown as {releaseNative:Record<string,()=>void>}).releaseNative.erase)).toBe('function');
 release(); await responded;
 await page.evaluate(() => (window as unknown as {releaseNative:Record<string,()=>void>}).releaseNative.erase!());
 await expect(page.locator('#saved-status')).toContainText('Saved connection removed');
 await expect(page.locator('#mode-label')).toHaveText('Local demo');
 await expect(page.getByLabel('Remember this connection on my phone')).not.toBeChecked();
 await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('mockPhoneStorage') ?? '{}') as Record<string,string>)).toEqual({'g2-artifact-relay-v1':''});
 const saves = await page.evaluate(() => (window as unknown as {nativeCalls:{method:string;data:unknown}[]}).nativeCalls.filter(call => call.method === 'setLocalStorage'));
 expect(saves).toEqual([{method:'setLocalStorage',data:{key:'g2-artifact-relay-v1',value:''}}]);
});

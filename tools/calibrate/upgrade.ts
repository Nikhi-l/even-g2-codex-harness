import { waitForEvenAppBridge, CreateStartUpPageContainer, RebuildPageContainer, TextContainerProperty, TextContainerUpgrade, OsEventTypeList } from '@evenrealities/even_hub_sdk';
const C = { containerID: 1, containerName: 'calib' };
const long = Array.from({ length: 9 }, (_, i) => `Row ${i + 1} of the long answer text`).join('\n');
const page = (content: string) => ({ containerTotalNum: 1, textObject: [new TextContainerProperty({ ...C, xPosition: 0, yPosition: 0, width: 288, height: 288, borderWidth: 0, paddingLength: 6, isEventCapture: 1, content })], imageObject: [] });
const steps: Array<[string, () => Promise<unknown>]> = [
  ['range-replace offset0 len4', () => bridge.textContainerUpgrade(new TextContainerUpgrade({ ...C, contentOffset: 0, contentLength: 4, content: 'ABCD' }))],
  ['content-only short', () => bridge.textContainerUpgrade(new TextContainerUpgrade({ ...C, content: 'Only content' }))],
  ['rebuild long', () => bridge.rebuildPageContainer(new RebuildPageContainer(page(long)))],
  ['padded shrink (harness style)', () => bridge.textContainerUpgrade(new TextContainerUpgrade({ ...C, contentOffset: 0, contentLength: long.length, content: 'Tiny'.padEnd(long.length, ' ') }))],
  ['rebuild long again', () => bridge.rebuildPageContainer(new RebuildPageContainer(page(long)))],
  ['offset0 len=old, short content', () => bridge.textContainerUpgrade(new TextContainerUpgrade({ ...C, contentOffset: 0, contentLength: long.length, content: 'Tiny' }))],
  ['rebuild long 3', () => bridge.rebuildPageContainer(new RebuildPageContainer(page(long)))],
  ['tiny + 900 spaces upgrade', () => bridge.textContainerUpgrade(new TextContainerUpgrade({ ...C, contentOffset: 0, contentLength: 904, content: 'Tiny'.padEnd(904, ' ') }))],
  ['tiny + 300 spaces rebuild', () => bridge.rebuildPageContainer(new RebuildPageContainer(page('Tiny'.padEnd(304, ' '))))],
  ['10 lines + 300 spaces rebuild', () => bridge.rebuildPageContainer(new RebuildPageContainer(page(Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`).join('\n').padEnd(400, ' '))))],
  ['append at end', () => bridge.textContainerUpgrade(new TextContainerUpgrade({ ...C, contentOffset: 4, contentLength: 6, content: ' added' }))],
];
const bridge = await waitForEvenAppBridge();
console.log(`UPG create=${await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(page('LINE ONE\nLINE TWO\nLINE THREE')))}`);
let i = 0;
bridge.onEvenHubEvent(async event => {
  const type = (event.textEvent ?? event.sysEvent)?.eventType ?? OsEventTypeList.CLICK_EVENT;
  if (type !== OsEventTypeList.CLICK_EVENT || !(event.sysEvent || event.textEvent) || i >= steps.length) return;
  const [name, run] = steps[i++]!;
  console.log(`UPG ${name} => ${JSON.stringify(await run())}`);
});

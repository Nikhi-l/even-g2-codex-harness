import { waitForEvenAppBridge, CreateStartUpPageContainer, RebuildPageContainer, TextContainerProperty, OsEventTypeList } from '@evenrealities/even_hub_sdk';
const printable = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).filter(c => c !== ' ');
const glyphCases = [] as Array<{ name: string; width: number; content: string }>;
for (let i = 0; i < printable.length; i += 5) {
  const chunk = printable.slice(i, i + 5);
  glyphCases.push({ name: `glyph-${i}`, width: 576, content: chunk.flatMap(c => [c.repeat(10), c.repeat(20)]).join('\n') });
}
const numbered = (n: number) => Array.from({ length: n }, (_, i) => `L${String(i + 1).padStart(2, '0')}`).join('\n');
const cases = [
  { name: 'lines-288', width: 288, content: numbered(16) },
  { name: 'lines-576', width: 576, content: numbered(16) },
  { name: 'space', width: 576, content: 'x' + ' '.repeat(10) + 'x\n' + 'x' + ' '.repeat(30) + 'x' },
  { name: 'wrap-288', width: 288, content: 'W'.repeat(40) + '\n' + 'The quick brown fox jumps over the lazy dog again and again.' },
  { name: 'unicode', width: 576, content: 'ASCII ok\n漢字 cjk\nEmoji \u{1F642} x\nArrows → ← ↑ ↓\nSym × · … — – • ✓ °\nAcc é ü ñ ç å\nBox ▶ ■ □ ●' },
  ...glyphCases,
];
let index = 0;
const out = document.getElementById('out')!;
function structure(c: typeof cases[number]) {
  return { containerTotalNum: 1, textObject: [new TextContainerProperty({ containerID: 1, containerName: 'calib', xPosition: 0, yPosition: 0, width: c.width, height: 288, borderWidth: 0, paddingLength: 6, isEventCapture: 1, content: c.content })], imageObject: [] };
}
const bridge = await waitForEvenAppBridge();
const first = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(structure(cases[0]!)));
console.log(`CASE ${cases[0]!.name} create=${first}`); out.textContent = cases[0]!.name;
bridge.onEvenHubEvent(async event => {
  const type = (event.textEvent ?? event.sysEvent)?.eventType ?? OsEventTypeList.CLICK_EVENT;
  if (type !== OsEventTypeList.CLICK_EVENT || !(event.sysEvent || event.textEvent)) return;
  index = (index + 1) % cases.length;
  const ok = await bridge.rebuildPageContainer(new RebuildPageContainer(structure(cases[index]!)));
  console.log(`CASE ${cases[index]!.name} rebuild=${ok}`); out.textContent = cases[index]!.name;
});
console.log(`CASES ${cases.map(c => c.name).join(',')}`);

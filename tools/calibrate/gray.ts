import { waitForEvenAppBridge, CreateStartUpPageContainer, TextContainerProperty, ImageContainerProperty, ImageRawDataUpdate } from '@evenrealities/even_hub_sdk';
const bridge = await waitForEvenAppBridge();
const structure = { containerTotalNum: 2,
  textObject: [new TextContainerProperty({ containerID: 1, containerName: 'calib', xPosition: 0, yPosition: 0, width: 288, height: 288, borderWidth: 0, paddingLength: 6, isEventCapture: 1, content: 'gray' })],
  imageObject: [new ImageContainerProperty({ containerID: 2, containerName: 'tile', xPosition: 288, yPosition: 0, width: 288, height: 144 })] };
console.log(`GRAY create=${await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(structure))}`);
const canvas = document.createElement('canvas'); canvas.width = 288; canvas.height = 144;
const ctx = canvas.getContext('2d')!;
for (let level = 0; level < 16; level++) { const v = level * 17; ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(level * 18, 0, 18, 144); }
const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
const result = await bridge.updateImageRawData(new ImageRawDataUpdate({ containerID: 2, containerName: 'tile', imageData: new Uint8Array(await blob.arrayBuffer()) }));
console.log(`GRAY update=${JSON.stringify(result)}`);

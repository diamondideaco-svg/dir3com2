import sharp from 'sharp';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = resolve(projectRoot, 'plugins', 'dabra', 'assets');

async function padSquare(inputName, outputName, background) {
  const input = resolve(assetRoot, inputName);
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Unable to read ${inputName}.`);
  const size = Math.max(metadata.width, metadata.height);
  const left = Math.floor((size - metadata.width) / 2);
  const right = size - metadata.width - left;
  const top = Math.floor((size - metadata.height) / 2);
  const bottom = size - metadata.height - top;
  await sharp(input)
    .extend({ top, bottom, left, right, background })
    .png()
    .toFile(resolve(assetRoot, outputName));
}

await padSquare('dabra-icon.png', 'dabra-icon-square.png', { r: 0, g: 0, b: 0, alpha: 1 });
await padSquare('dir3com-logo.png', 'dir3com-logo-square.png', { r: 255, g: 255, b: 255, alpha: 1 });
console.log('Created square DABRA assets without cropping or redrawing the approved originals.');

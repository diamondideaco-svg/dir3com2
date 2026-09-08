import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// The approved raster's flat-white background has encoding noise of 253–255.
// Only four-connected exterior near-white pixels are removed. Enclosed whites,
// antialiasing, all RGB samples and the complete canvas are retained verbatim.
export function exteriorWhiteAlpha(rgb, width, height) {
  const mask = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0, tail = 0;
  const visit = i => {
    if (mask[i]) return;
    const p = i * 3;
    if (rgb[p] < 253 || rgb[p + 1] < 253 || rgb[p + 2] < 253) return;
    mask[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % width;
    if (x > 0) visit(i - 1);
    if (x + 1 < width) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i + width < mask.length) visit(i + width);
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < mask.length; i++) {
    rgb.copy(rgba, i * 4, i * 3, i * 3 + 3);
    rgba[i * 4 + 3] = mask[i] ? 0 : 255;
  }
  return { rgba, removed: tail };
}

async function prepare() {
  const source = new URL('../public/brand/runtime/dir3com-logo-approved.png', import.meta.url);
  const output = new URL('../public/brand/runtime/dir3com-logo-transparent.png', import.meta.url);
  const bytes = await readFile(source);
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { rgba, removed } = exteriorWhiteAlpha(data, info.width, info.height);
  const png = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  const { writeFile } = await import('node:fs/promises');
  await writeFile(output, png);
  console.log(JSON.stringify({ source: source.pathname, sourceHash: createHash('sha256').update(bytes).digest('hex'),
    output: output.pathname, outputHash: createHash('sha256').update(png).digest('hex'),
    width: info.width, height: info.height, removed, rgbChanges: 0, alphaRange: [0, 255] }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepare().catch(() => { console.error('LOGO_PREPARATION_FAILED'); process.exitCode = 1; });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { exteriorWhiteAlpha } from '../scripts/prepare-logo-transparency.mjs';

test('approved source and transparent derivative retain every RGB byte and the full canvas', async () => {
  const source = readFileSync(new URL('../public/brand/runtime/dir3com-logo-approved.png', import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'), 'd876c53af6ca01f48a408b6caddcc1416fc3f7245434492d68393cba20db450a');
  const a = await sharp(source).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(readFileSync(new URL('../public/brand/runtime/dir3com-logo-transparent.png', import.meta.url))).raw().toBuffer({ resolveWithObject: true });
  assert.equal(b.info.width, a.info.width); assert.equal(b.info.height, a.info.height); assert.equal(b.info.channels, 4);
  const expected = exteriorWhiteAlpha(a.data, a.info.width, a.info.height);
  assert.deepEqual(b.data, expected.rgba);
  let transparent = 0, opaque = 0;
  for (let i = 0; i < a.info.width * a.info.height; i++) {
    assert.equal(b.data[i * 4], a.data[i * 3]);
    assert.equal(b.data[i * 4 + 1], a.data[i * 3 + 1]);
    assert.equal(b.data[i * 4 + 2], a.data[i * 3 + 2]);
    if (b.data[i * 4 + 3] === 0) transparent++; else opaque++;
  }
  assert.ok(transparent > 1000000); assert.ok(opaque > 100000);
  for (const i of [0, a.info.width - 1, a.info.width * (a.info.height - 1), a.info.width * a.info.height - 1]) assert.equal(b.data[i * 4 + 3], 0);
});

test('boundary flood-fill preserves enclosed white and light artwork, without changing RGB', () => {
  const rgb = Buffer.alloc(7 * 7 * 3, 255);
  for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) if (x === 1 || x === 5 || y === 1 || y === 5) {
    rgb.set([13, 27, 42], (y * 7 + x) * 3);
  }
  rgb.set([252, 252, 252], 0); // Light artwork is not part of the 253–255 white range.
  const { rgba } = exteriorWhiteAlpha(rgb, 7, 7);
  assert.equal(rgba[3], 255);
  assert.equal(rgba[(3 * 7 + 3) * 4 + 3], 255);
  assert.equal(rgba[(6 * 7 + 6) * 4 + 3], 0);
  assert.deepEqual([...rgba.subarray(0, 3)], [252, 252, 252]);
});

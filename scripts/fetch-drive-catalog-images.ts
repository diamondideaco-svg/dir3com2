/** One-time asset import, never called by the app/build. Verifies recorded license before downloading. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DRIVE_IMAGE_RIGHTS } from '../lib/drive/image-rights';

async function main() {
  const folder = resolve('public/vehicles');
  await mkdir(folder, { recursive: true });
  for (const asset of DRIVE_IMAGE_RIGHTS) {
    const query = new URLSearchParams({ action: 'query', format: 'json', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '1280', titles: `File:${asset.file}` });
    const response = await fetch(`https://commons.wikimedia.org/w/api.php?${query}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Source unavailable: ${asset.id} ${response.status}`);
    const metadata = await response.json();
    const page = Object.values(metadata.query.pages)[0] as { imageinfo: { thumburl: string; extmetadata: { LicenseShortName: { value: string } } }[] };
    const info = page.imageinfo[0];
    if (info.extmetadata.LicenseShortName.value !== asset.license) throw new Error(`License changed: ${asset.id}`);
    const image = await fetch(info.thumburl, { signal: AbortSignal.timeout(30000) });
    if (!image.ok || !image.headers.get('content-type')?.startsWith('image/jpeg')) throw new Error(`Image unavailable: ${asset.id} ${image.status}`);
    const data = Buffer.from(await image.arrayBuffer());
    if (data.length > 10_000_000 || data[0] !== 255 || data[1] !== 216) throw new Error('Invalid image');
    await writeFile(resolve(folder, `${asset.id}.jpg`), data);
    console.log(`${asset.id}: imported licensed image (${data.length} bytes)`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

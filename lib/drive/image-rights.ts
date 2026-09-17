// Verified Wikimedia Commons imageinfo/extmetadata, 2026-09-17.
// Local copies, no customer-image hotlinks. Photo generations do not guarantee the physical unit.
export const DRIVE_IMAGE_RIGHTS = [
  { id: 'mercedes-e200-amg', file: 'Mercedes Benz E 200 AMG Line 2019 (48613838303).jpg', author: 'RL GNZLZ', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/' },
  { id: 'jetour-t2', file: 'Jetour T2.jpg', author: 'Milhouse35', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'jetour-t1', file: 'Front view of Jetour T1 during GIIAS 2026 in Bandung 20260911 184050.jpg', author: 'M Raisfath', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' },
  { id: 'jetour-x90', file: 'Jetour X90 001.jpg', author: 'Jengtingchen', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'nissan-sunny', file: 'Nissan Sunny N17 China 2015-04-06.jpg', author: 'Navigator84', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'mercedes-e200', file: 'Mercedes-Benz E 200 AVANTGARDE Sports (W213) front.jpg', author: 'Tokumeigakarinoaoshima', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'range-rover', file: 'Land Rover RANGE ROVER Autobiography P530 Standard-wheelbase (L460) front.jpg', author: 'Tokumeigakarinoaoshima', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { id: 'mercedes-gclass', file: 'Mercedes-Benz G 550 (W463) front.JPG', author: 'Tokumeigakarinoaoshima', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
].map(item => ({ ...item, source: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(item.file.replaceAll(' ', '_'))}`, retrieved: '2026-09-17', usage: 'DIR3COM vehicle model catalogue; commercial redistribution under stated license', changes: 'Wikimedia 1280px thumbnail; no content editing; CSS contain' }));

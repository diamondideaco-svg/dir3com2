import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { normalizeStayRooms } from '../lib/services/search-state';

const read = (p: string) => fs.readFileSync(p, 'utf8');
const search = read('components/shared/ServiceSearchTable.tsx');
const content = read('components/services/ServicePageContent.tsx');
const contracts = {
  stay: ['country', 'city', 'checkIn', 'checkOut', 'rooms', 'guests'],
  fly: ['originCountry', 'originCity', 'destinationCountry', 'destinationCity', 'departureDate', 'returnDate', 'passengers'],
  concierge: ['country', 'city', 'serviceDate', 'guests'],
  vip: ['country', 'city', 'tripDate', 'guests'],
};

for (const [family, fields] of Object.entries(contracts)) {
  test(`${family} keeps its own real fields, original imagery and explicit master opt-in`, () => {
    const definition = search.slice(search.indexOf(`key: '${family}'`)).split('    ],')[0];
    assert.deepEqual([...definition.matchAll(/name: '([^']+)'/g)].map(m => m[1]), fields);
    const route = read(`app/services/${family}/page.tsx`);
    assert.match(route, new RegExp(`<ServicePageContent service="${family}" stories=\\{\\[\\]\\} familyMarketplace`));
    assert.doesNotMatch(route, /getTravelStoriesFeed|supabase|fetch\(/);
    assert.match(read('components/layout/SiteShell.tsx'), new RegExp(`'/services/${family}'`));
  });
}

test('family master reuses locked Drive styling and suppresses generic sections without deleting shared components', () => {
  assert.match(content, /import driveStyles from '.\/drive-family.module.css'/);
  assert.match(content, /familyMaster \? ` \$\{driveStyles.page\}`/);
  assert.match(content, /dir=\{familyMaster \? direction : undefined\}/);
  const generic = content.slice(content.indexOf('{!familyMaster && <>'));
  for (const section of ['<HomeUtilities', 'drive-master-products', '<StoriesCarousel', '<PartnersTicker']) assert.ok(generic.includes(section));
  for (const asset of ['1000467134.png','1000467131.png','1000467128 (1).png','1000467129 (1).png']) assert.ok(content.includes(asset));
  assert.match(content, /getCanonicalService\(service\)/);
  for (const file of ['components/home/HomeUtilities.tsx','components/shared/StoriesCarousel.tsx','components/shared/PartnersTicker.tsx']) assert.ok(fs.existsSync(file));
});

test('all opted-in family searches preserve input context and use the canonical Marketplace filter without a Services detour', () => {
  assert.match(search, /familyMarketplace = false/);
  assert.match(search, /for \(const field of selected.fields\) params.set\(field.name, submissionValues\[field.name\]\)/);
  assert.match(search, /if \(familyMarketplace\) \{\s*params.set\('family', `dir3-\$\{selected.key\}`\);[\s\S]*?router.push\(`\/marketplace\?\$\{params.toString\(\)\}`\);\s*return;/);
  assert.match(content, /href={`\/marketplace\?family=dir3-\$\{service\}`}/);
  assert.match(search, /router.push\(`\/services\/\$\{selected.key\}\?\$\{params.toString\(\)\}`\)/);
  assert.doesNotMatch(search, /confirmed|guaranteed|payment|setInventory/);
});

test('Stay normalizes rooms before submission without bypassing validation of other fields', () => {
  for (const value of ['', '0', '-1', '1.5', 'NaN']) assert.equal(normalizeStayRooms(value), 1);
  for (const value of ['1','2','12','13']) assert.equal(normalizeStayRooms(value), Number(value));
  assert.match(search, /submissionValues.rooms = String\(normalizeStayRooms\(values.rooms\)\)/);
  assert.match(search, /noValidate=\{directMarketplace && selected.key === 'stay' \? true : undefined\}/);
  assert.match(search, /input:not\(\[data-normalized-rooms\]\), select/);
  assert.match(search, /for \(const control of controls\) if \(!control.reportValidity\(\)\) return/);
  assert.match(search, /data-normalized-rooms=\{selected.key === 'stay' && field.name === 'rooms' \? true : undefined\}/);
  assert.match(search, /notBefore: 'checkIn'/);
  assert.match(search, /notBefore: 'departureDate'/);
});

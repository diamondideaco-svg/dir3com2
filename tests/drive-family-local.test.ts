import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) => fs.readFileSync(path, 'utf8');
const content = read('components/services/ServicePageContent.tsx');
const search = read('components/shared/ServiceSearchTable.tsx');

test('Drive simplifies the actual family component without deleting shared marketing components', () => {
  assert.match(content, /const directDrive = service === 'drive'/);
  assert.match(content, /directDrive \? <ServiceSearchTable initialService="drive" driveMarketplace \/> : <ServiceSearchTable initialService=\{service\} familyMarketplace=\{familyMarketplace\} \/>/);
  assert.match(content, /const familyMaster = directDrive \|\| familyMarketplace/);
  const excluded = content.slice(content.indexOf('{!familyMaster && <>'), content.indexOf('</>}'));
  for (const marker of ['<HomeUtilities', 'drive-master-products', '<StoriesCarousel', '<PartnersTicker']) assert.ok(excluded.includes(marker));
  assert.match(read('app/services/drive/page.tsx'), /<ServicePageContent service="drive" stories=\{\[\]\} \/>/);
  assert.doesNotMatch(read('app/services/drive/page.tsx'), /getTravelStoriesFeed/);
  for (const file of ['HomeUtilities', '../shared/StoriesCarousel', '../shared/PartnersTicker']) {
    const path = file === 'HomeUtilities' ? 'components/home/HomeUtilities.tsx' : `components/home/${file}.tsx`;
    assert.ok(fs.existsSync(path));
  }
});

test('existing Drive imagery, copy and direct browse CTA remain the source of truth', () => {
  assert.match(content, /heroImage: '\/brand\/runtime\/1000467135.png'/);
  assert.match(content, /src=\{page.heroImage\}/);
  assert.match(content, /getCanonicalService\(service\)/);
  assert.match(content, /href={`\/marketplace\?family=dir3-\$\{service\}`}/);
  assert.match(content, /href="#service-search"/);
  assert.doesNotMatch(content, /price:|booked|booking confirmed|guaranteed|setInventory/);
});

test('Drive preserves all six existing field definitions and their validation boundaries', () => {
  const fields = search.slice(search.indexOf("key: 'drive'"), search.indexOf("key: 'stay'"));
  assert.deepEqual([...fields.matchAll(/name: '([^']+)'/g)].map(match => match[1]), ['country', 'pickupCity', 'dropoffCity', 'pickupDate', 'returnDate', 'passengers']);
  assert.equal((fields.match(/countryField: 'country'/g) ?? []).length, 2);
  assert.match(fields, /name: 'returnDate'.*notBefore: 'pickupDate'/);
  assert.match(search, /selected.fields.some\(\(field\) => !submissionValues\[field.name\]\?\.trim\(\)\)/);
  assert.match(search, /cityValues\[0\] === cityValues\[1\]/);
  assert.match(search, /submissionValues\[field.name\] < today/);
  assert.match(search, /submissionValues\[field.name\] < submissionValues\[field.notBefore\]/);
  assert.match(search, /min=\{1\}[\s\S]*max=\{12\}/);
  assert.match(search, /next\[dependent.name\] = ''/);
});

test('approved Drive real form retains Enter/native bounds and original direct Marketplace context', () => {
  assert.match(search, /driveMarketplace = false/);
  assert.match(search, /driveMarketplace && initialService === 'drive'/);
  assert.match(search, /const directMarketplace = directDrive \|\| familyMarketplace/);
  assert.match(search, /const FieldsContainer = directMarketplace \? 'form' : 'div'/);
  assert.match(search, /onSubmit=\{directMarketplace \? \(event\) => \{\s*event.preventDefault\(\)/);
  assert.match(search, /noValidate=\{directMarketplace && selected.key === 'stay' \? true : undefined\}/);
  assert.match(search, /type=\{directMarketplace \? 'submit' : 'button'\}/);
  assert.equal((search.match(/required=\{directMarketplace \|\| undefined\}/g) ?? []).length, 4);
  assert.match(search, /for \(const field of selected.fields\) params.set\(field.name, submissionValues\[field.name\]\)/);
  assert.match(search, /if \(directDrive\) \{[\s\S]*params.set\('family', 'dir3-drive'\)[\s\S]*router.push\(`\/marketplace\?\$\{params.toString\(\)\}`\);\s*return;/);
  assert.match(search, /router.push\(`\/services\/\$\{selected.key\}\?\$\{params.toString\(\)\}`\)/);
  assert.match(search, /directMarketplace \? <h2[\s\S]*: <div className="service-search-table__tabs"/);
});

test('Drive retains its exact public chrome and approved responsive CSS as other families opt in', () => {
  const shell = read('components/layout/SiteShell.tsx');
  assert.match(shell, /if \(pathname === '\/services\/drive'\) return <ServicesChrome>/);
  const css = read('components/services/drive-family.module.css');
  assert.match(css, /repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /@media\(max-width:640px\)[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /row-reverse|100vh|position:fixed/);
  assert.match(content, /data-dabra-avoid=\{familyMaster \|\| undefined\}/);
  assert.match(search, /data-dabra-avoid=\{directMarketplace \|\| undefined\}/);
});

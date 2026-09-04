import test from 'node:test';
import assert from 'node:assert/strict';
import { DABRA_TTS_BRAND_CONTRACT, normalizeDabraTtsText } from '@/lib/dabra/speech-pronunciation';

test('TTS pronounces the exact standalone dir3com token as درعكم across casing and languages', () => {
  assert.equal(normalizeDabraTtsText('dir3com DIR3COM Dir3Com'), 'درعكم درعكم درعكم');
  assert.equal(normalizeDabraTtsText('Welcome to dir3com.'), 'Welcome to درعكم.');
  assert.equal(normalizeDabraTtsText('أهلًا بك في dir3com'), 'أهلًا بك في درعكم');
  assert.deepEqual(DABRA_TTS_BRAND_CONTRACT, { visible: 'dir3com', spoken: 'درعكم' });
});

test('TTS leaves URLs, emails, paths, handles, code and identifier near-matches untouched', () => {
  const protectedValues = [
    'dir3com.com', 'https://dir3com.com', 'name@dir3com.com', '/dir3com/item', '@dir3com', '#dir3com',
    'dir3com2', 'dir3commerce', 'dir3com_id', 'REQ-dir3com', 'mydir3com', 'قبلdir3comبعد',
    'URN:dir3com', 'REQ:dir3com', 'dir3com:443',
    '`dir3com`', '``dir3com``', '```ts\nconst brand = "dir3com"\n```',
    '~~~text\ndir3com\n~~~',
  ];
  for (const value of protectedValues) assert.equal(normalizeDabraTtsText(value), value);
});

test('TTS still normalizes standalone brand before ordinary colon punctuation', () => {
  assert.equal(normalizeDabraTtsText('Welcome to dir3com: your trip starts here.'), 'Welcome to درعكم: your trip starts here.');
  assert.equal(normalizeDabraTtsText('dir3com:'), 'درعكم:');
});

test('unrelated text remains unchanged', () => {
  const input = 'رحلتك جاهزة غدًا. Your trip is ready tomorrow.';
  assert.equal(normalizeDabraTtsText(input), input);
});

test('normalization is idempotent', () => {
  const normalized = normalizeDabraTtsText('زور dir3com. Visit DIR3COM.');
  assert.equal(normalizeDabraTtsText(normalized), normalized);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDabraSpeechText } from '@/lib/dabra/speech-pronunciation';

test('Arabic speech pronounces dir3com as درعكم across casing', () => {
  assert.equal(normalizeDabraSpeechText('dir3com DIR3COM Dir3com', 'ar-SA'), 'درعكم درعكم درعكم');
});

test('English speech pronounces dir3com as Dirakom across casing', () => {
  assert.equal(normalizeDabraSpeechText('dir3com DIR3COM Dir3com', 'en-US'), 'Dirakom Dirakom Dirakom');
});

test('forbidden spoken variants normalize to the approved Arabic form', () => {
  const input = 'dir three com | three com | دير ثري كوم | D-I-R-3-C-O-M';
  const output = normalizeDabraSpeechText(input, 'ar');
  assert.equal(output, 'درعكم | درعكم | درعكم | درعكم');
  for (const forbidden of ['dir three com', 'three com', 'دير ثري كوم', 'D-I-R-3-C-O-M']) {
    assert(!output.includes(forbidden));
  }
});

test('forbidden spoken variants normalize to the approved English form', () => {
  assert.equal(
    normalizeDabraSpeechText('dir three com | three com | دير ثري كوم | D-I-R-3-C-O-M', 'en'),
    'Dirakom | Dirakom | Dirakom | Dirakom',
  );
});

test('unrelated text remains unchanged', () => {
  const input = 'رحلتك جاهزة غدًا. Your trip is ready tomorrow.';
  assert.equal(normalizeDabraSpeechText(input, 'ar-SA'), input);
  assert.equal(normalizeDabraSpeechText(input, 'en-GB'), input);
});

test('normalization is idempotent', () => {
  const arabic = normalizeDabraSpeechText('زور dir3com', 'ar-SA');
  const english = normalizeDabraSpeechText('Visit DIR3COM', 'en-US');
  assert.equal(normalizeDabraSpeechText(arabic, 'ar-SA'), arabic);
  assert.equal(normalizeDabraSpeechText(english, 'en-US'), english);
});

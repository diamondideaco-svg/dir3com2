import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DABRA_VOICE_MAX_PLANNED_UNITS,
  DABRA_VOICE_MAX_SEGMENTS,
  planDabraVoicePlayback,
  runDabraVoicePlayback,
} from '@/lib/dabra/voice-segmentation';
import { DABRA_VOICE_TEXT_MAX_LENGTH } from '@/lib/dabra/voice-provider';

function spacedText(length: number) {
  let value = '';
  while (value.length + 5 <= length) value += value ? ' word' : 'word';
  if (value.length < length) value += `${value ? ' ' : ''}${'x'.repeat(length - value.length - (value ? 1 : 0))}`;
  return value;
}

test('799 and 800 UTF-16 units remain one request while 801 and 861 segment safely', () => {
  for (const length of [799, 800]) {
    const plan = planDabraVoicePlayback('x'.repeat(length));
    assert.equal(plan.segments.length, 1);
    assert.equal(plan.segments[0].length, length);
    assert.equal(plan.hasRemainder, false);
  }
  for (const length of [801, 861]) {
    const text = spacedText(length);
    assert.equal(text.length, length);
    const plan = planDabraVoicePlayback(text);
    assert(plan.segments.length > 1);
    assert.equal(plan.hasRemainder, false);
    assert(plan.segments.every((segment) => segment.length <= DABRA_VOICE_TEXT_MAX_LENGTH));
    assert.equal(plan.segments.join(' '), text);
  }
});

test('Arabic and English sentence endings win before whitespace fallback', () => {
  const english = planDabraVoicePlayback(`${'word '.repeat(130)}Done. ${'next '.repeat(70)}`);
  assert.match(english.segments[0], /Done\.$/u);
  const arabic = planDabraVoicePlayback(`${'كلمة '.repeat(130)}تم؟ ${'التالي '.repeat(70)}`);
  assert.match(arabic.segments[0], /تم؟$/u);
});

test('planning never splits a word, URL, identifier, or surrogate pair', () => {
  const oversizedIdentifier = `REQ-${'x'.repeat(820)}`;
  const blocked = planDabraVoicePlayback(oversizedIdentifier);
  assert.deepEqual(blocked.segments, []);
  assert.equal(blocked.hasRemainder, true);

  const url = `https://example.com/${'a'.repeat(500)}`;
  const text = `${'intro '.repeat(120)}${url} closing`;
  const plan = planDabraVoicePlayback(text);
  assert(plan.segments.every((segment) => !/[\uD800-\uDBFF]$/u.test(segment)));
  assert(plan.segments.every((segment) => !/^[\uDC00-\uDFFF]/u.test(segment)));
  assert(plan.segments.some((segment) => segment.includes(url)));
});

test('playback is capped to four segments and a truthful bounded prefix', () => {
  const plan = planDabraVoicePlayback(spacedText(5_000));
  assert.equal(plan.segments.length, DABRA_VOICE_MAX_SEGMENTS);
  assert(plan.segments.reduce((sum, segment) => sum + segment.length, 0) <= DABRA_VOICE_MAX_PLANNED_UNITS);
  assert.equal(plan.hasRemainder, true);
});

test('sequential playback never overlaps synthesis or audio', async () => {
  const controller = new AbortController();
  let synthActive = 0;
  let audioActive = 0;
  let maximumSynth = 0;
  let maximumAudio = 0;
  const order: string[] = [];
  await runDabraVoicePlayback(['one', 'two', 'three'], controller.signal, async (segment) => {
    synthActive += 1;
    maximumSynth = Math.max(maximumSynth, synthActive);
    order.push(`synth:${segment}`);
    synthActive -= 1;
    return segment;
  }, async (segment) => {
    audioActive += 1;
    maximumAudio = Math.max(maximumAudio, audioActive);
    order.push(`play:${segment}`);
    await Promise.resolve();
    audioActive -= 1;
  });
  assert.equal(maximumSynth, 1);
  assert.equal(maximumAudio, 1);
  assert.deepEqual(order, ['synth:one', 'play:one', 'synth:two', 'play:two', 'synth:three', 'play:three']);
});

test('cancellation during a segment prevents all remaining synthesis', async () => {
  const controller = new AbortController();
  const synthesized: string[] = [];
  await assert.rejects(
    runDabraVoicePlayback(['one', 'two'], controller.signal, async (segment) => {
      synthesized.push(segment);
      return segment;
    }, async () => {
      controller.abort();
      controller.signal.throwIfAborted();
    }),
    { name: 'AbortError' },
  );
  assert.deepEqual(synthesized, ['one']);
});

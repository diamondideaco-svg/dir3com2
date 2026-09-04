import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DABRA_APPROVED_VOICE, getApprovedDabraVoiceCopy } from '@/lib/dabra/approved-voice';

const root = process.cwd();
const chat = fs.readFileSync(path.join(root, 'components', 'dabra', 'DabraChatCommerce.tsx'), 'utf8');

test('approved DABRA voice identity is pinned to the human-approved master fingerprint', () => {
  assert.equal(DABRA_APPROVED_VOICE.design, 'DABRA Voice Design V1');
  assert.equal(DABRA_APPROVED_VOICE.sourceFile, 'DABRA_VOICE_MASTER_V1.mp3');
  assert.equal(DABRA_APPROVED_VOICE.sha256, '4AA9AFA4EDDF369FE79E8F597946766C6FBDD8C789DE199DE9A5253EBFE044FB');
});

test('dynamic output fails closed while the approved engine is missing', () => {
  assert.equal(DABRA_APPROVED_VOICE.dynamicEngine, 'missing');
  assert.equal(DABRA_APPROVED_VOICE.browserSpeechAllowed, false);
  assert.doesNotMatch(chat, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.match(chat, /DABRA_APPROVED_VOICE\.dynamicEngine === 'missing'/);
});

test('Arabic and English state the truthful approved-voice boundary', () => {
  assert.match(getApprovedDabraVoiceCopy('ar').title, /غير متاح/);
  assert.match(getApprovedDabraVoiceCopy('en').title, /unavailable/i);
  assert.match(getApprovedDabraVoiceCopy('ar').detail, /لن نستبدل/);
  assert.match(getApprovedDabraVoiceCopy('en').detail, /not use a device voice/i);
});

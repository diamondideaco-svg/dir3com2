import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DABRA_APPROVED_VOICE, getApprovedDabraVoiceCopy } from '@/lib/dabra/approved-voice';
import { AI2_DABRA_CHARACTER_BIBLE, AI2_DABRA_GLOBAL_WEB_PROMPT, AI2_DABRA_INTERNAL_SYSTEM_PROMPT } from '@/lib/ai2/prompt/contract';

const root = process.cwd();
const chat = fs.readFileSync(path.join(root, 'components', 'dabra', 'DabraChatCommerce.tsx'), 'utf8');

test('canonical persona derives its voice identity from the approved source without claiming activation', () => {
  const voice = AI2_DABRA_CHARACTER_BIBLE.identity.voiceProfile;
  for (const value of [DABRA_APPROVED_VOICE.design, DABRA_APPROVED_VOICE.sourceFile, DABRA_APPROVED_VOICE.dynamicEngine]) {
    assert.ok(voice.includes(value));
  }
  assert.match(voice, /only when the approved server voice is available/);
  assert.match(voice, /must never claim playback or voice activation occurred/);
  assert.match(voice, /No device or substitute voice is permitted/);
  for (const prompt of [AI2_DABRA_INTERNAL_SYSTEM_PROMPT, AI2_DABRA_GLOBAL_WEB_PROMPT]) {
    assert.ok(prompt.includes(voice));
    assert.doesNotMatch(prompt, /الدَّبْرَة 4/);
    assert.ok(!prompt.includes(DABRA_APPROVED_VOICE.voiceId));
  }
});

test('approved DABRA voice identity is pinned to the human-approved master fingerprint', () => {
  assert.equal(DABRA_APPROVED_VOICE.design, 'DABRA Voice Design V1');
  assert.equal(DABRA_APPROVED_VOICE.sourceFile, 'R0_APPROVED_MASTER.mp3');
  assert.equal(DABRA_APPROVED_VOICE.sha256, '4AA9AFA4EDDF369FE79E8F597946766C6FBDD8C789DE199DE9A5253EBFE044FB');
  assert.equal(DABRA_APPROVED_VOICE.voiceId, 'ae29537c-c796-4fb5-9f5b-da1e02176a5d');
});

test('dynamic output uses only the server adapter and pins the approved voice identity in source', () => {
  assert.equal(DABRA_APPROVED_VOICE.dynamicEngine, 'mistral-voxtral-tts');
  assert.equal(DABRA_APPROVED_VOICE.productionStatus, 'server-credential-required-approved-voice-pinned');
  assert.equal(DABRA_APPROVED_VOICE.browserSpeechAllowed, false);
  assert.doesNotMatch(chat, /speechSynthesis|SpeechSynthesisUtterance/);
  assert.match(chat, /approvedVoiceAvailable === false/);
  assert.match(chat, /fetch\('\/api\/dabra\/voice'/);
});

test('Arabic and English state the truthful approved-voice boundary', () => {
  assert.match(getApprovedDabraVoiceCopy('ar').title, /غير متاح/);
  assert.match(getApprovedDabraVoiceCopy('en').title, /unavailable/i);
  assert.match(getApprovedDabraVoiceCopy('ar').detail, /لن نستبدل/);
  assert.match(getApprovedDabraVoiceCopy('en').detail, /not use a device voice/i);
});

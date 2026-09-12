import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateAndNormalizeVideoFile } from '../lib/security/video-validation';

function mp4(durationSeconds = 30) {
  const bytes = new Uint8Array(64);
  bytes.set([0, 0, 0, 24], 0);
  bytes.set(new TextEncoder().encode('ftyp'), 4);
  bytes.set(new TextEncoder().encode('isom'), 8);
  bytes.set(new TextEncoder().encode('mvhd'), 28);
  bytes[32] = 0;
  const view = new DataView(bytes.buffer);
  view.setUint32(44, 1000);
  view.setUint32(48, durationSeconds * 1000);
  return bytes;
}

test('accepts a bounded MP4 and records authoritative duration', async () => {
  const result = await validateAndNormalizeVideoFile(new File([mp4(45)], 'studio.mp4', { type: 'video/mp4' }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.durationSeconds, 45);
});

test('rejects oversized duration, spoofed MIME and invalid structure', async () => {
  const long = await validateAndNormalizeVideoFile(new File([mp4(121)], 'long.mp4', { type: 'video/mp4' }));
  assert.equal(long.ok, false);
  if (!long.ok) assert.equal(long.code, 'VIDEO_TOO_LONG');

  const spoofed = await validateAndNormalizeVideoFile(new File([mp4()], 'clip.mp4', { type: 'text/html' }));
  assert.equal(spoofed.ok, false);

  const invalid = await validateAndNormalizeVideoFile(new File([new Uint8Array(64)], 'clip.mp4', { type: 'video/mp4' }));
  assert.equal(invalid.ok, false);
});

test('video stays private, signed-previewed and review-gated', () => {
  const route = readFileSync('app/api/partner-portal/assets/media/route.ts', 'utf8');
  const review = readFileSync('app/api/partner-portal/review-queue/route.ts', 'utf8');
  const migration = readFileSync('supabase/migrations/20260912222748_partner_media_video_storage.sql', 'utf8');
  assert.match(route, /createSignedUrl\(media\.url, 300\)/);
  assert.match(route, /validateAndNormalizeVideoFile/);
  assert.match(route, /status: 'pending_review'/);
  assert.match(review, /allAssetMediaApproved/);
  assert.match(migration, /public = false/);
  assert.doesNotMatch(migration, /create policy[\s\S]*insert/i);
});

test('partner UI accepts and previews MP4 without claiming publication', () => {
  const panel = readFileSync('components/portal/OnboardingAssetsPanel.tsx', 'utf8');
  assert.match(panel, /video\/mp4/);
  assert.match(panel, /<video[\s\S]*controls[\s\S]*preload="metadata"/);
  assert.match(panel, /pending_review/);
});

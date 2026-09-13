import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateAndNormalizeVideoFile, videoValidationMessage } from '../lib/security/video-validation';

function mp4(durationSeconds = 30, presentedDurationSeconds?: number) {
  // Structural unit fixture, not a playable video or browser-QA evidence.
  const box = (kind: string, ...parts: Uint8Array[]) => {
    const body = Buffer.concat(parts);
    const header = Buffer.alloc(8);
    header.writeUInt32BE(body.length + 8);
    header.write(kind, 4);
    return Buffer.concat([header, body]);
  };
  const header = Buffer.alloc(100);
  header.writeUInt32BE(1000, 12);
  header.writeUInt32BE((presentedDurationSeconds ?? durationSeconds) * 1000, 16);
  const handler = Buffer.alloc(12);
  handler.write('vide', 8);
  const sizes = Buffer.alloc(12);
  sizes.writeUInt32BE(1, 4);
  sizes.writeUInt32BE(1, 8);
  const trackHeader = Buffer.alloc(84);
  trackHeader.writeUInt32BE((presentedDurationSeconds ?? durationSeconds) * 1000, 20);
  const mediaHeader = Buffer.alloc(24);
  mediaHeader.writeUInt32BE(1000, 12);
  mediaHeader.writeUInt32BE(durationSeconds * 1000, 16);
  const words = (...values: number[]) => { const b=Buffer.alloc(values.length*4); values.forEach((v,i)=>b.writeUInt32BE(v,i*4)); return b; };
  const description = Buffer.alloc(78);
  description.writeUInt16BE(1, 6);
  const edits = presentedDurationSeconds === undefined ? [] : [
    box('edts', box('elst', words(0, 1, presentedDurationSeconds * 1000, 0, 0x00010000))),
  ];
  const track = box('trak', box('tkhd', trackHeader), ...edits, box('mdia', box('mdhd', mediaHeader), box('hdlr', handler),
    box('minf', box('dinf', box('dref', words(0,1),box('url ',words(1)))), box('stbl',
      box('stsd',words(0,1),box('avc1',description)),box('stts',words(0,1,1,durationSeconds*1000)),
      box('stsc',words(0,1,1,1,1)),box('stco',words(0,1,24)),box('stsz',sizes)))));
  return Buffer.concat([box('ftyp', Buffer.from('isom0000')), box('mdat', Buffer.from([1])), box('moov', box('mvhd', header), track)]);
}

test('accepts consistent bounded MP4 container timing', async () => {
  const result = await validateAndNormalizeVideoFile(new File([mp4(45)], 'studio.mp4', { type: 'video/mp4' }));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.durationSeconds, 45);
});

test('reports edit-list playback duration instead of retained source duration', async () => {
  for (const [source, presentation] of [[2, 1], [121, 120]]) {
    const result = await validateAndNormalizeVideoFile(new File([mp4(source, presentation)], 'trim.mp4', { type: 'video/mp4' }));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.durationSeconds, presentation);
  }
  const long = await validateAndNormalizeVideoFile(new File([mp4(130, 121)], 'long-edit.mp4', { type: 'video/mp4' }));
  assert.equal(long.ok, false);
  if (!long.ok) assert.equal(long.code, 'VIDEO_TOO_LONG');
});

test('short movie metadata cannot override track/sample duration', async () => {
  const b = mp4(121);
  b.writeUInt32BE(1000,b.indexOf(Buffer.from('mvhd'))+20);
  b.writeUInt32BE(1000,b.indexOf(Buffer.from('tkhd'))+24);
  b.writeUInt32BE(1000,b.indexOf(Buffer.from('mdhd'))+20);
  const result=await validateAndNormalizeVideoFile(new File([b],'long.mp4',{type:'video/mp4'}));
  assert.equal(result.ok,false);
  if(!result.ok)assert.equal(result.code,'VIDEO_TOO_LONG');
});

test('rejects empty tables, missing sample data, external references and ambiguous boxes', async () => {
  for(const kind of ['stts','stsc','stco','stsd']) {
    const b=mp4();b.writeUInt32BE(0,b.indexOf(Buffer.from(kind))+8);
    assert.equal((await validateAndNormalizeVideoFile(new File([b],'bad.mp4',{type:'video/mp4'}))).ok,false,kind);
  }
  for(const [kind,offset,value] of [['stco',12,0],['stsz',8,2000],['url ',4,0],['stts',12,2]] as const) {
    const b=mp4();b.writeUInt32BE(value,b.indexOf(Buffer.from(kind))+offset);
    assert.equal((await validateAndNormalizeVideoFile(new File([b],'bad.mp4',{type:'video/mp4'}))).ok,false,kind);
  }
  const b=mp4();b.write('tkhd',b.indexOf(Buffer.from('mdia')));
  assert.equal((await validateAndNormalizeVideoFile(new File([b],'bad.mp4',{type:'video/mp4'}))).ok,false);
});

test('rejects forged markers, truncated boxes and oversized uploads', async () => {
  const forged = Buffer.alloc(64);
  forged.writeUInt32BE(24, 0);
  forged.write('ftypisom', 4);
  forged.write('mvhd', 28);
  forged.writeUInt32BE(1000, 44);
  forged.writeUInt32BE(30000, 48);
  for (const bytes of [forged, mp4().subarray(0, 60), Buffer.alloc(4 * 1024 * 1024 + 1)]) {
    assert.equal((await validateAndNormalizeVideoFile(new File([bytes], 'qa.mp4', { type: 'video/mp4' }))).ok, false);
  }
});

test('video rejection messages are localized for both languages', () => {
  for (const code of ['VIDEO_INVALID_FILE', 'VIDEO_TOO_LARGE', 'VIDEO_UNSUPPORTED_TYPE', 'VIDEO_INVALID_STRUCTURE', 'VIDEO_TOO_LONG']) {
    assert.match(videoValidationMessage(code, 'ar')!, /[\u0600-\u06ff]/);
    assert.doesNotMatch(videoValidationMessage(code, 'en')!, /[\u0600-\u06ff]/);
    assert.ok(videoValidationMessage(code, 'en'));
  }
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
  assert.match(review, /rpc\('review_partner_portal_media'/);
  assert.match(migration, /public = false/);
  assert.doesNotMatch(migration, /create policy[\s\S]*insert/i);
});

test('partner UI accepts and previews MP4 without claiming publication', () => {
  const panel = readFileSync('components/portal/OnboardingAssetsPanel.tsx', 'utf8');
  assert.match(panel, /video\/mp4/);
  assert.match(panel, /<video[\s\S]*controls[\s\S]*preload="metadata"/);
  assert.match(panel, /pending_review/);
  assert.match(panel, /<fieldset disabled=\{loading \|\| item.status !== 'pending_review'/);
  assert.doesNotMatch(panel, /entry.submittedAt > item.submittedAt/);
  assert.match(panel, /approve: 'اعتماد'/);
});

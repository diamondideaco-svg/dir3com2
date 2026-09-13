import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateAndNormalizeVideoFile, videoValidationMessage, VIDEO_PARSE_LIMITS as limits } from '../lib/security/video-validation';

function mp4(durationSeconds = 30, presentedDurationSeconds?: number, options: {
  samples?: number; variableSizes?: boolean; chunks?: number; wideOffsets?: boolean;
  tracks?: number; editEntries?: number; payloads?: number; paddingBoxes?: number;
} = {}) {
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
  const samples = options.samples ?? 1;
  const chunks = options.chunks ?? 1;
  const sizes = Buffer.alloc(12 + (options.variableSizes ? samples * 4 : 0));
  sizes.writeUInt32BE(options.variableSizes ? 0 : 1, 4);
  sizes.writeUInt32BE(samples, 8);
  if (options.variableSizes) for (let i = 0; i < samples; i++) sizes.writeUInt32BE(1, 12 + i * 4);
  const trackHeader = Buffer.alloc(84);
  trackHeader.writeUInt32BE((presentedDurationSeconds ?? durationSeconds) * 1000, 20);
  const mediaHeader = Buffer.alloc(24);
  mediaHeader.writeUInt32BE(1000, 12);
  mediaHeader.writeUInt32BE(durationSeconds * 1000, 16);
  const words = (...values: number[]) => { const b=Buffer.alloc(values.length*4); values.forEach((v,i)=>b.writeUInt32BE(v,i*4)); return b; };
  const description = Buffer.alloc(78);
  description.writeUInt16BE(1, 6);
  const editCount = options.editEntries ?? 1;
  const editRows = Array.from({ length: editCount }, () => words(
    options.editEntries ? 1 : (presentedDurationSeconds ?? durationSeconds) * 1000, 0, 0x00010000));
  const edits = presentedDurationSeconds === undefined && !options.editEntries ? [] : [
    box('edts', box('elst', words(0, editCount), ...editRows)),
  ];
  const offsets = Buffer.alloc(8 + chunks * (options.wideOffsets ? 8 : 4));
  offsets.writeUInt32BE(chunks, 4);
  for (let i = 0; i < chunks; i++) {
    const offset = 24 + i * samples / chunks;
    if (options.wideOffsets) offsets.writeBigUInt64BE(BigInt(offset), 8 + i * 8);
    else offsets.writeUInt32BE(offset, 8 + i * 4);
  }
  const padding = Array.from({ length: options.paddingBoxes ?? 0 }, () => box('free'));
  const track = box('trak', box('tkhd', trackHeader), ...edits, box('mdia', box('mdhd', mediaHeader), box('hdlr', handler),
    box('minf', box('dinf', box('dref', words(0,1),box('url ',words(1)))), box('stbl',
      box('stsd',words(0,1),box('avc1',description)),box('stts',words(0,1,samples,Math.max(1,Math.floor(durationSeconds*1000/samples)))),
      box('stsc',words(0,1,1,samples/chunks,1)),box(options.wideOffsets ? 'co64' : 'stco',offsets),box('stsz',sizes), ...padding))));
  const tracks = Array.from({ length: options.tracks ?? 1 }, () => track);
  const payloads = Array.from({ length: options.payloads ?? 1 }, () => box('mdat', Buffer.alloc(samples, 1)));
  return Buffer.concat([box('ftyp', Buffer.from('isom0000')), ...payloads, box('moov', box('mvhd', header), ...tracks)]);
}

test('fast-rejects fixed/variable sample amplification before table reads', async (t) => {
  // All fixtures are isolated structural bytes, below the 4MiB upload limit.
  const files = [
    mp4(120, undefined, { samples: 2_000_000 }),
    mp4(120, undefined, { samples: limits.samplesPerTrack + 1, variableSizes: true }),
  ].map(b => new File([b], 'budget.mp4', { type: 'video/mp4' }));
  const reads = t.mock.method(DataView.prototype, 'getUint32');
  for (const file of files) {
    reads.mock.resetCalls();
    const started = performance.now();
    const result = await validateAndNormalizeVideoFile(file);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'VIDEO_INVALID_STRUCTURE');
    assert.ok(reads.mock.callCount() < 100, 'reject before sample/table traversal');
    assert.ok(performance.now() - started < 1000, 'bounded fast rejection');
  }
});

test('rejects per-file aggregate and equivalent table/chunk/box amplification', async () => {
  const cases: [string, Parameters<typeof mp4>[2]][] = [
    ['tracks', { tracks: limits.tracks + 1 }],
    ['aggregate samples', { samples: limits.samplesPerTrack, tracks: 3 }],
    ['edit table', { editEntries: limits.entriesPerTable + 1 }],
    ['aggregate tables', { editEntries: limits.entriesPerTable, tracks: 4 }],
    ['stco chunks', { samples: limits.chunksPerTrack + 1, chunks: limits.chunksPerTrack + 1 }],
    ['co64 chunks', { samples: limits.chunksPerTrack + 1, chunks: limits.chunksPerTrack + 1, wideOffsets: true }],
    ['aggregate chunks', { samples: limits.chunksPerTrack, chunks: limits.chunksPerTrack, tracks: 3 }],
    ['mdat comparisons', { payloads: limits.payloads + 1 }],
    ['aggregate boxes', { paddingBoxes: 600, tracks: 8 }],
  ];
  for (const [name, options] of cases) {
    const bytes = mp4(120, undefined, options);
    assert.ok(bytes.length < 4 * 1024 * 1024, name);
    const result = await validateAndNormalizeVideoFile(new File([bytes], 'budget.mp4', { type: 'video/mp4' }));
    assert.equal(result.ok, false, name);
    if (!result.ok) assert.equal(result.code, 'VIDEO_INVALID_STRUCTURE', name);
  }
});

test('bounded multi-track, variable-size and co64 clips still validate', async () => {
  for (const variableSizes of [false, true]) {
    const bytes = mp4(120, undefined, { samples: 7200, chunks: 120, tracks: 2, variableSizes, wideOffsets: true });
    const result = await validateAndNormalizeVideoFile(new File([bytes], 'normal.mp4', { type: 'video/mp4' }));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.durationSeconds, 120);
  }
  const atLimit = mp4(120, undefined, { samples: limits.samplesPerTrack, tracks: 2 });
  assert.equal((await validateAndNormalizeVideoFile(new File([atLimit], 'limit.mp4', { type: 'video/mp4' }))).ok, true);
});

test('upload metadata never claims a malware scan on success, rejection or duplicate', () => {
  const route = readFileSync('app/api/partner-portal/assets/media/route.ts', 'utf8');
  const types = readFileSync('lib/partner-portal/onboarding-types.ts', 'utf8');
  assert.equal([...route.matchAll(/malwareSafeControls: 'not_available'/g)].length, 3);
  assert.doesNotMatch(route, /malwareSafeControls: true/);
  assert.match(types, /malwareSafeControls: boolean \| 'not_available'/);
  assert.match(route, /MP4 structural validation only; malware scanning is not available/);
  assert.match(route, /technicalSummary: technicalValidation\.messages/);
});

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

// Keep multipart uploads below the hosted function request-body ceiling.
const MAX_VIDEO_SIZE_BYTES = 4 * 1024 * 1024;
export const MAX_VIDEO_DURATION_SECONDS = 120;

type VideoValidationResult =
  | { ok: true; data: { bytes: Uint8Array; extension: 'mp4'; mimeType: 'video/mp4'; durationSeconds: number } }
  | { ok: false; code: string; message: string };

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

function mp4Duration(bytes: Uint8Array): number | null {
  type Box = { type: string; start: number; end: number };
  function boxes(start: number, end: number): Box[] {
    const result: Box[] = [];
    while (start < end) {
      if (end - start < 8 || result.length > 4096) throw new Error('INVALID_BOX');
      let size = uint32(bytes, start);
      const type = ascii(bytes, start + 4, 4);
      let header = 8;
      if (size === 1) {
        if (end - start < 16) throw new Error('INVALID_BOX');
        size = Number(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(start + 8));
        header = 16;
      } else if (size === 0) size = end - start;
      if (!Number.isSafeInteger(size) || size < header || size > end - start) throw new Error('INVALID_BOX');
      result.push({ type, start: start + header, end: start + size });
      start += size;
    }
    return result;
  }
  try {
  const top = boxes(0, bytes.length);
  const ftyp = top[0];
  if (ftyp?.type !== 'ftyp' || ftyp.end - ftyp.start < 8 || (ftyp.end - ftyp.start) % 4 !== 0) return null;
  const brands = ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'iso4', 'iso5', 'iso6'];
  if (!brands.includes(ascii(bytes, ftyp.start, 4))) return null;
  if (!top.some(b => b.type === 'mdat' && b.end > b.start)) return null;
  const movies = top.filter(b => b.type === 'moov');
  if (movies.length !== 1 || top.some(b => b.type === 'moof')) return null;
  const movie = boxes(movies[0].start, movies[0].end);
  const headers = movie.filter(b => b.type === 'mvhd');
  if (headers.length !== 1) return null;
  function one(items: Box[], kind: string): Box {
    const matches = items.filter(b => b.type === kind);
    if (matches.length !== 1) throw new Error('INVALID_STRUCTURE');
    return matches[0];
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  function wide(offset: number) {
    const n = Number(view.getBigUint64(offset));
    if (!Number.isSafeInteger(n)) throw new Error('INVALID_INTEGER');
    return n;
  }
  function clock(b: Box, minimum: number) {
    const version = bytes[b.start];
    if (version > 1 || b.end - b.start < minimum + (version ? 12 : 0)) throw new Error('INVALID_CLOCK');
    const offset = b.start + (version ? 20 : 12);
    const scale = uint32(bytes, offset);
    const duration = version ? wide(offset + 4) : uint32(bytes, offset + 4);
    if (!scale || !duration) throw new Error('INVALID_CLOCK');
    return { scale, duration, seconds: duration / scale };
  }
  function table(b: Box, width: number, prefix = 8) {
    if (b.end - b.start < prefix || bytes[b.start] > 1) throw new Error('INVALID_TABLE');
    const count = uint32(bytes, b.start + prefix - 4);
    if (!count || count > bytes.length || b.end - b.start !== prefix + count * width) throw new Error('INVALID_TABLE');
    return count;
  }
  const movieClock = clock(headers[0], 100);
  let durationSeconds = movieClock.seconds;
  let hasVideo = false;
  const payloads = top.filter(b => b.type === 'mdat');
  for (const track of movie.filter(b => b.type === 'trak')) {
    const trackBoxes = boxes(track.start, track.end);
    const mdia = one(trackBoxes, 'mdia');
    const tkhd = one(trackBoxes, 'tkhd');
    const trackVersion = bytes[tkhd.start];
    if (trackVersion > 1 || tkhd.end - tkhd.start < (trackVersion ? 96 : 84)) return null;
    const trackDuration = trackVersion ? wide(tkhd.start + 28) : uint32(bytes, tkhd.start + 20);
    if (!trackDuration) return null;
    durationSeconds = Math.max(durationSeconds, trackDuration / movieClock.scale);
    const media = boxes(mdia.start, mdia.end);
    const handler = one(media, 'hdlr');
    const minf = one(media, 'minf');
    if (handler.end - handler.start < 12) return null;
    const mediaClock = clock(one(media, 'mdhd'), 24);
    const stbl = one(boxes(minf.start, minf.end), 'stbl');
    const sample = boxes(stbl.start, stbl.end);
    const stsz = one(sample, 'stsz');
    if (stsz.end - stsz.start < 12) return null;
    const fixedSize = uint32(bytes, stsz.start + 4);
    const sampleCount = uint32(bytes, stsz.start + 8);
    if (!sampleCount || sampleCount > bytes.length || stsz.end - stsz.start !== 12 + (fixedSize ? 0 : sampleCount * 4)) return null;
    const sizes = Array.from({ length: sampleCount }, (_, i) => fixedSize || uint32(bytes, stsz.start + 12 + i * 4));
    if (sizes.some(size => !size || size > bytes.length)) return null;
    const stsd = one(sample, 'stsd');
    if (stsd.end - stsd.start < 8) return null;
    const descriptions = boxes(stsd.start + 8, stsd.end);
    if (!descriptions.length || descriptions.length !== uint32(bytes, stsd.start + 4) || descriptions.some(b => b.end - b.start < 8)) return null;
    // Only self-contained samples: external data references are never fetched.
    const dinf = one(boxes(minf.start, minf.end), 'dinf');
    const dref = one(boxes(dinf.start, dinf.end), 'dref');
    if (dref.end - dref.start < 8) return null;
    const refs = boxes(dref.start + 8, dref.end);
    if (!refs.length || refs.length !== uint32(bytes, dref.start + 4) || refs.some(b => b.type !== 'url ' || b.end - b.start !== 4 || uint32(bytes, b.start) !== 1)) return null;
    if (descriptions.some(b => { const ref = view.getUint16(b.start + 6); return ref < 1 || ref > refs.length; })) return null;
    const stts = one(sample, 'stts');
    const runs = table(stts, 8);
    let totalSamples = 0;
    let ticks = 0;
    for (let i = 0; i < runs; i++) {
      const count = uint32(bytes, stts.start + 8 + i * 8);
      const delta = uint32(bytes, stts.start + 12 + i * 8);
      totalSamples += count;
      ticks += count * delta;
      if (!count || !delta || totalSamples > sampleCount || !Number.isSafeInteger(ticks)) return null;
    }
    if (totalSamples !== sampleCount) return null;
    const ctts = sample.filter(b => b.type === 'ctts');
    if (ctts.length > 1) return null;
    let maxCompositionOffset = 0;
    if (ctts.length) {
      const b = ctts[0];
      const entries = table(b, 8);
      let count = 0;
      for (let i = 0; i < entries; i++) {
        const n = uint32(bytes, b.start + 8 + i * 8);
        const offset = bytes[b.start] ? view.getInt32(b.start + 12 + i * 8) : uint32(bytes, b.start + 12 + i * 8);
        if (!n) return null;
        count += n;
        maxCompositionOffset = Math.max(maxCompositionOffset, offset);
      }
      if (count !== sampleCount) return null;
    }
    const edits = trackBoxes.filter(b => b.type === 'edts');
    if (edits.length > 1) return null;
    if (edits.length) {
      const elst = one(boxes(edits[0].start, edits[0].end), 'elst');
      const width = bytes[elst.start] === 1 ? 20 : 12;
      const count = table(elst, width);
      let editDuration = 0;
      for (let i = 0; i < count; i++) {
        const p = elst.start + 8 + i * width;
        const duration = width === 20 ? wide(p) : uint32(bytes, p);
        const time = width === 20 ? Number(view.getBigInt64(p + 8)) : view.getInt32(p + 4);
        if (!duration || !Number.isSafeInteger(time) || time < -1 || time > ticks + maxCompositionOffset || view.getInt16(p + width - 4) !== 1 || view.getInt16(p + width - 2) !== 0) return null;
        editDuration += duration;
        if (!Number.isSafeInteger(editDuration)) return null;
      }
      // Edit lists define the presented track timeline; retained source samples
      // may be longer (for example, a non-destructively trimmed clip).
      // Keep validating all source sample tables, but do not report them as playback.
      durationSeconds = Math.max(durationSeconds, editDuration / movieClock.scale);
    } else {
      durationSeconds = Math.max(durationSeconds, mediaClock.seconds, (ticks + maxCompositionOffset) / mediaClock.scale);
    }
    const offsets = sample.filter(b => b.type === 'stco' || b.type === 'co64');
    if (offsets.length !== 1) return null;
    const offsetBox = offsets[0];
    const offsetWidth = offsetBox.type === 'co64' ? 8 : 4;
    const chunks = table(offsetBox, offsetWidth);
    const stsc = one(sample, 'stsc');
    const mappings = table(stsc, 12);
    let consumed = 0;
    for (let i = 0; i < mappings; i++) {
      const p = stsc.start + 8 + i * 12;
      const first = uint32(bytes, p);
      const perChunk = uint32(bytes, p + 4);
      const description = uint32(bytes, p + 8);
      const next = i + 1 < mappings ? uint32(bytes, p + 12) : chunks + 1;
      if ((i === 0 && first !== 1) || !first || next <= first || next > chunks + 1 || !perChunk || perChunk > sampleCount || description < 1 || description > descriptions.length) return null;
      for (let chunk = first; chunk < next; chunk++) {
        const offset = offsetBox.start + 8 + (chunk - 1) * offsetWidth;
        let cursor = offsetWidth === 8 ? wide(offset) : uint32(bytes, offset);
        const payload = payloads.find(b => cursor >= b.start && cursor < b.end);
        if (!payload || consumed + perChunk > sampleCount) return null;
        for (let j = 0; j < perChunk; j++) cursor += sizes[consumed++];
        if (cursor > payload.end) return null;
      }
    }
    if (consumed !== sampleCount) return null;
    if (ascii(bytes, handler.start + 8, 4) === 'vide') hasVideo = true;
  }
  if (!hasVideo) return null;
  const seconds = durationSeconds;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch { return null; }
}

export function videoValidationMessage(code: string, language: 'ar' | 'en') {
  const messages: Record<string, [string, string]> = {
    VIDEO_INVALID_FILE: ['اختر ملف فيديو صالحاً.', 'Choose a valid video file.'],
    VIDEO_TOO_LARGE: ['الفيديو يتجاوز الحد الأقصى المسموح (4MB).', 'Video exceeds the 4MB limit.'],
    VIDEO_UNSUPPORTED_TYPE: ['صيغة الفيديو المسموحة هي MP4 فقط.', 'Only MP4 video is supported.'],
    VIDEO_INVALID_STRUCTURE: ['تعذر التحقق من بنية الفيديو ومدته.', 'The video structure and duration could not be verified.'],
    VIDEO_TOO_LONG: ['مدة الفيديو تتجاوز دقيقتين.', 'Video duration exceeds two minutes.'],
  };
  return messages[code]?.[language === 'ar' ? 0 : 1];
}

export async function validateAndNormalizeVideoFile(file: unknown): Promise<VideoValidationResult> {
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, code: 'VIDEO_INVALID_FILE', message: 'اختر ملف فيديو صالحاً.' };
  }
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return { ok: false, code: 'VIDEO_TOO_LARGE', message: 'الفيديو يتجاوز الحد الأقصى المسموح (4MB).' };
  }
  const name = file.name.trim().toLowerCase();
  if (!name.endsWith('.mp4') || (file.type && file.type !== 'video/mp4')) {
    return { ok: false, code: 'VIDEO_UNSUPPORTED_TYPE', message: 'صيغة الفيديو المسموحة هي MP4 فقط.' };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const durationSeconds = mp4Duration(bytes);
  if (!durationSeconds) {
    return { ok: false, code: 'VIDEO_INVALID_STRUCTURE', message: 'تعذر التحقق من بنية الفيديو ومدته.' };
  }
  if (durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
    return { ok: false, code: 'VIDEO_TOO_LONG', message: 'مدة الفيديو تتجاوز دقيقتين.' };
  }
  return { ok: true, data: { bytes, extension: 'mp4', mimeType: 'video/mp4', durationSeconds } };
}

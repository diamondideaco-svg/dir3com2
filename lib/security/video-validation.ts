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
  let hasVideo = false;
  for (const track of movie.filter(b => b.type === 'trak')) {
    const trackBoxes = boxes(track.start, track.end);
    const mdia = trackBoxes.find(b => b.type === 'mdia');
    if (!trackBoxes.some(b => b.type === 'tkhd') || !mdia) return null;
    const media = boxes(mdia.start, mdia.end);
    const handler = media.find(b => b.type === 'hdlr');
    const minf = media.find(b => b.type === 'minf');
    if (!handler || handler.end - handler.start < 12 || !media.some(b => b.type === 'mdhd') || !minf) return null;
    const stbl = boxes(minf.start, minf.end).find(b => b.type === 'stbl');
    if (!stbl) return null;
    const sample = boxes(stbl.start, stbl.end);
    const stsz = sample.find(b => b.type === 'stsz');
    if (!sample.some(b => b.type === 'stsd') || !sample.some(b => b.type === 'stts') || !sample.some(b => b.type === 'stsc') || !sample.some(b => b.type === 'stco' || b.type === 'co64') || !stsz || stsz.end - stsz.start < 12 || uint32(bytes, stsz.start + 8) === 0) return null;
    if (ascii(bytes, handler.start + 8, 4) === 'vide') hasVideo = true;
  }
  if (!hasVideo) return null;
  const marker = headers[0].start - 4;
  const version = bytes[marker + 4];
  if (version !== 0 && version !== 1) return null;
  const timescaleOffset = marker + (version === 1 ? 24 : 16);
  const durationOffset = timescaleOffset + 4;
  if (headers[0].end - headers[0].start < (version === 1 ? 112 : 100) || durationOffset + (version === 1 ? 8 : 4) > headers[0].end) return null;
  const timescale = uint32(bytes, timescaleOffset);
  if (!timescale) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const duration = version === 1 ? Number(view.getBigUint64(durationOffset)) : view.getUint32(durationOffset);
  const seconds = duration / timescale;
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

const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
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
  if (bytes.length < 32 || ascii(bytes, 4, 4) !== 'ftyp') return null;
  const mvhd = new TextEncoder().encode('mvhd');
  let marker = -1;
  for (let i = 4; i <= bytes.length - mvhd.length; i += 1) {
    if (bytes[i] === mvhd[0] && bytes[i + 1] === mvhd[1] && bytes[i + 2] === mvhd[2] && bytes[i + 3] === mvhd[3]) {
      marker = i;
      break;
    }
  }
  if (marker < 0 || marker + 24 >= bytes.length) return null;
  const version = bytes[marker + 4];
  const timescaleOffset = marker + (version === 1 ? 24 : 16);
  const durationOffset = timescaleOffset + 4;
  if (durationOffset + (version === 1 ? 8 : 4) > bytes.length) return null;
  const timescale = uint32(bytes, timescaleOffset);
  if (!timescale) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const duration = version === 1 ? Number(view.getBigUint64(durationOffset)) : view.getUint32(durationOffset);
  const seconds = duration / timescale;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export async function validateAndNormalizeVideoFile(file: unknown): Promise<VideoValidationResult> {
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, code: 'VIDEO_INVALID_FILE', message: 'اختر ملف فيديو صالحاً.' };
  }
  if (file.size > MAX_VIDEO_SIZE_BYTES) {
    return { ok: false, code: 'VIDEO_TOO_LARGE', message: 'الفيديو يتجاوز الحد الأقصى المسموح (50MB).' };
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

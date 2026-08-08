const MAX_DOCUMENT_SIZE_BYTES = 8 * 1024 * 1024;
const APPROVED_DOCUMENT_EXTENSIONS = new Set(['pdf', 'jpg', 'png', 'webp']);
const DANGEROUS_DOUBLE_EXTENSION_HINTS = new Set([
  'exe',
  'js',
  'html',
  'htm',
  'php',
  'sh',
  'bat',
  'cmd',
  'ps1',
  'dll',
  'jar',
]);
const PDF_MIN_BYTES = 32;
const JPEG_MIN_BYTES = 20;
const PNG_MIN_BYTES = 45;
const WEBP_MIN_BYTES = 16;

export type VerifiedDocumentSignature = {
  extension: 'pdf' | 'jpg' | 'png' | 'webp';
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';
};

type ValidationResult =
  | {
      ok: true;
      data: {
        bytes: Uint8Array;
        signature: VerifiedDocumentSignature;
      };
    }
  | {
      ok: false;
      code: 'DOCUMENT_INVALID_FILE' | 'DOCUMENT_TOO_LARGE' | 'DOCUMENT_UNSUPPORTED_SIGNATURE' | 'DOCUMENT_MIME_MISMATCH' | 'DOCUMENT_FORBIDDEN_CONTENT';
      message: string;
    };

function startsWith(bytes: Uint8Array, sequence: number[]) {
  if (bytes.length < sequence.length) return false;
  for (let i = 0; i < sequence.length; i += 1) {
    if (bytes[i] !== sequence[i]) return false;
  }
  return true;
}

function endsWith(bytes: Uint8Array, sequence: number[]) {
  if (bytes.length < sequence.length) return false;
  const offset = bytes.length - sequence.length;
  for (let i = 0; i < sequence.length; i += 1) {
    if (bytes[offset + i] !== sequence[i]) return false;
  }
  return true;
}

function findAscii(bytes: Uint8Array, needle: string, start = 0) {
  if (!needle) return -1;
  const encoded = new TextEncoder().encode(needle);
  for (let i = start; i <= bytes.length - encoded.length; i += 1) {
    let found = true;
    for (let j = 0; j < encoded.length; j += 1) {
      if (bytes[i + j] !== encoded[j]) {
        found = false;
        break;
      }
    }
    if (found) return i;
  }
  return -1;
}

function hasExecutableSignature(bytes: Uint8Array) {
  if (startsWith(bytes, [0x4d, 0x5a])) return true; // MZ
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return true; // ELF
  if (startsWith(bytes, [0x23, 0x21])) return true; // shebang
  return false;
}

function hasPolyglotIndicator(bytes: Uint8Array) {
  const zipIndex = findAscii(bytes, 'PK\u0003\u0004');
  if (zipIndex > 0 && zipIndex < 1024) {
    return true;
  }

  const scriptTagIndex = findAscii(bytes, '<script');
  if (scriptTagIndex >= 0) {
    return true;
  }

  return false;
}

function parseLowercaseFileNameParts(fileName: string) {
  const normalized = String(fileName || '').trim().toLowerCase();
  if (!normalized) return [] as string[];

  return normalized
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
}

function validateFileNamePolicy(file: File) {
  const parts = parseLowercaseFileNameParts(file.name);
  if (parts.length < 2) {
    return {
      ok: false as const,
      code: 'DOCUMENT_FORBIDDEN_CONTENT' as const,
      message: 'امتداد الملف غير مسموح.',
    };
  }

  const extension = parts[parts.length - 1] || '';
  if (!APPROVED_DOCUMENT_EXTENSIONS.has(extension)) {
    if (DANGEROUS_DOUBLE_EXTENSION_HINTS.has(extension)) {
      return {
        ok: false as const,
        code: 'DOCUMENT_FORBIDDEN_CONTENT' as const,
        message: 'امتداد الملف غير مسموح.',
      };
    }

    // For non-approved but non-dangerous extensions, let signature
    // validation determine the canonical unsupported response.
    return { ok: true as const };
  }

  if (parts.length > 2) {
    const middleExtensions = parts.slice(1, -1);
    if (middleExtensions.some((part) => DANGEROUS_DOUBLE_EXTENSION_HINTS.has(part) || part.length <= 4)) {
      return {
        ok: false as const,
        code: 'DOCUMENT_FORBIDDEN_CONTENT' as const,
        message: 'امتداد مزدوج غير مسموح.',
      };
    }
  }

  return { ok: true as const };
}

function isStructurallyValidPdf(bytes: Uint8Array) {
  if (bytes.length < PDF_MIN_BYTES) return false;
  if (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return false;

  const eofSearchStart = Math.max(0, bytes.length - 2048);
  const eofOffset = findAscii(bytes.subarray(eofSearchStart), '%%EOF');
  return eofOffset >= 0;
}

function isStructurallyValidJpeg(bytes: Uint8Array) {
  if (bytes.length < JPEG_MIN_BYTES) return false;
  const hasSoi = startsWith(bytes, [0xff, 0xd8, 0xff]);
  const hasEoi = endsWith(bytes, [0xff, 0xd9]);
  return hasSoi && hasEoi;
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
}

function isStructurallyValidPng(bytes: Uint8Array) {
  if (bytes.length < PNG_MIN_BYTES) return false;
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return false;

  const ihdrLength = readUint32BE(bytes, 8);
  const ihdrType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (ihdrLength !== 13 || ihdrType !== 'IHDR') return false;

  if (bytes.length < 12) return false;
  const iendOffset = bytes.length - 12;
  const hasIend =
    bytes[iendOffset] === 0x00 &&
    bytes[iendOffset + 1] === 0x00 &&
    bytes[iendOffset + 2] === 0x00 &&
    bytes[iendOffset + 3] === 0x00 &&
    bytes[iendOffset + 4] === 0x49 &&
    bytes[iendOffset + 5] === 0x45 &&
    bytes[iendOffset + 6] === 0x4e &&
    bytes[iendOffset + 7] === 0x44;

  return hasIend;
}

function isStructurallyValidWebp(bytes: Uint8Array) {
  if (bytes.length < WEBP_MIN_BYTES) return false;
  const hasRiff = startsWith(bytes, [0x52, 0x49, 0x46, 0x46]);
  const hasWebp =
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  return hasRiff && hasWebp;
}

export function detectDocumentSignature(bytes: Uint8Array): VerifiedDocumentSignature | null {
  if (isStructurallyValidPdf(bytes)) {
    return { extension: 'pdf', mimeType: 'application/pdf' };
  }

  if (isStructurallyValidJpeg(bytes)) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }

  if (isStructurallyValidPng(bytes)) {
    return { extension: 'png', mimeType: 'image/png' };
  }

  if (isStructurallyValidWebp(bytes)) {
    return { extension: 'webp', mimeType: 'image/webp' };
  }

  return null;
}

export async function validateAndNormalizeDocumentFile(file: unknown): Promise<ValidationResult> {
  if (!(file instanceof File) || file.size <= 0) {
    return {
      ok: false,
      code: 'DOCUMENT_INVALID_FILE',
      message: 'اختر ملفاً صالحاً.',
    };
  }

  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return {
      ok: false,
      code: 'DOCUMENT_TOO_LARGE',
      message: 'الملف يتجاوز الحد الأقصى المسموح (8MB).',
    };
  }

  const fileNamePolicy = validateFileNamePolicy(file);
  if (!fileNamePolicy.ok) {
    return fileNamePolicy;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (hasExecutableSignature(bytes)) {
    return {
      ok: false,
      code: 'DOCUMENT_FORBIDDEN_CONTENT',
      message: 'نوع الملف غير مسموح.',
    };
  }

  if (hasPolyglotIndicator(bytes)) {
    return {
      ok: false,
      code: 'DOCUMENT_FORBIDDEN_CONTENT',
      message: 'نوع الملف غير مسموح.',
    };
  }

  const signature = detectDocumentSignature(bytes);
  if (!signature || !APPROVED_DOCUMENT_EXTENSIONS.has(signature.extension)) {
    return {
      ok: false,
      code: 'DOCUMENT_UNSUPPORTED_SIGNATURE',
      message: 'تنسيق الملف غير مدعوم.',
    };
  }

  const normalizedMime = String(file.type || '').trim().toLowerCase();
  if (normalizedMime && normalizedMime !== signature.mimeType) {
    return {
      ok: false,
      code: 'DOCUMENT_MIME_MISMATCH',
      message: 'صيغة الملف لا تطابق المحتوى الفعلي.',
    };
  }

  return {
    ok: true,
    data: {
      bytes,
      signature,
    },
  };
}

export function buildPrivateDocumentObjectPath(userId: string, extension: VerifiedDocumentSignature['extension']) {
  const safeUserId = String(userId || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const normalizedUserId = safeUserId || 'unknown';
  return `${normalizedUserId}/${crypto.randomUUID()}.${extension}`;
}

export function sanitizeDownloadFilename(baseName: string, extension: string) {
  const safeBase = String(baseName || 'document')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80) || 'document';
  const safeExt = String(extension || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  return `${safeBase}.${safeExt}`;
}

export function parsePrivateDocumentPath(path: unknown): { ownerPrefix: string; extension: string } | null {
  const normalized = String(path || '').trim();
  const match = normalized.match(/^([a-z0-9-]+)\/([a-z0-9-]+)\.([a-z0-9]+)$/i);
  if (!match?.[1] || !match[3]) return null;

  const extension = match[3].toLowerCase();
  if (!APPROVED_DOCUMENT_EXTENSIONS.has(extension)) return null;

  return {
    ownerPrefix: match[1].toLowerCase(),
    extension,
  };
}

export const DOCUMENT_UPLOAD_LIMIT_BYTES = MAX_DOCUMENT_SIZE_BYTES;

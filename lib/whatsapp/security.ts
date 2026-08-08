import crypto from 'node:crypto';

export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const match = /^sha256=(.+)$/i.exec(signatureHeader.trim());
  if (!match?.[1]) {
    return false;
  }

  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const actual = match[1].toLowerCase();

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

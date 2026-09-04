const DABRA_VISIBLE_BRAND = 'dir3com';
const DABRA_SPOKEN_BRAND = 'درعكم';

const BRAND_PATTERN = /dir3com/giu;
const IDENTIFIER_OR_LOCATION_CHARACTER = /[\p{L}\p{M}\p{N}_@#/\\=?&%+~-]/u;

function normalizeProseSegment(text: string) {
  return text.replace(BRAND_PATTERN, (match, offset: number, source: string) => {
    const before = offset > 0 ? source[offset - 1] : '';
    const afterOffset = offset + match.length;
    const after = afterOffset < source.length ? source[afterOffset] : '';
    const afterNext = afterOffset + 1 < source.length ? source[afterOffset + 1] : '';
    const identifierBeforeColon = before === ':'
      && /[\p{L}\p{M}\p{N}_-]+:$/u.test(source.slice(0, offset));
    const identifierAfterColon = after === ':'
      && !!afterNext
      && /[\p{L}\p{M}\p{N}_-]/u.test(afterNext);
    if (
      (before && IDENTIFIER_OR_LOCATION_CHARACTER.test(before))
      || (after && IDENTIFIER_OR_LOCATION_CHARACTER.test(after))
      || before === '.'
      || (after === '.' && !!afterNext && /[\p{L}\p{M}\p{N}_-]/u.test(afterNext))
      || identifierBeforeColon
      || identifierAfterColon
    ) {
      return match;
    }
    return DABRA_SPOKEN_BRAND;
  });
}

/**
 * Normalizes only the standalone visible brand token at the provider TTS sink.
 * Backtick-delimited code and URL/email/path/identifier-like tokens stay intact.
 */
export function normalizeDabraTtsText(text: string) {
  let result = '';
  let proseStart = 0;
  let index = 0;

  while (index < text.length) {
    const delimiterCharacter = text[index];
    if (delimiterCharacter !== '`' && delimiterCharacter !== '~') {
      index += 1;
      continue;
    }

    let delimiterLength = 1;
    while (text[index + delimiterLength] === delimiterCharacter) delimiterLength += 1;
    if (delimiterCharacter === '~' && delimiterLength < 3) {
      index += delimiterLength;
      continue;
    }

    result += normalizeProseSegment(text.slice(proseStart, index));
    const delimiter = delimiterCharacter.repeat(delimiterLength);
    const codeStart = index;
    const codeEnd = text.indexOf(delimiter, index + delimiterLength);
    if (codeEnd < 0) {
      result += text.slice(codeStart);
      return result;
    }
    index = codeEnd + delimiterLength;
    result += text.slice(codeStart, index);
    proseStart = index;
  }

  return result + normalizeProseSegment(text.slice(proseStart));
}

export const DABRA_TTS_BRAND_CONTRACT = Object.freeze({
  visible: DABRA_VISIBLE_BRAND,
  spoken: DABRA_SPOKEN_BRAND,
});

// Sanitized deployed-function excerpt supplied by coordinator, 2026-10-09.
// HTML entities in the supplied transcript are decoded to JavaScript syntax.
const DIR3COM_ORIGIN = 'https://www.dir3com.com';
const FAMILIES = new Set(['dir3-drive', 'dir3-stay']);
const CANONICAL_URLS = [
  `${DIR3COM_ORIGIN}/support`,
  ...[...FAMILIES].map(family => `${DIR3COM_ORIGIN}/marketplace?family=${family}`)
];

function approvedDestination(raw) {
  // Do not let a URL parser silently repair slashes, escapes or dot segments.
  // Exact syntax also rejects userinfo, ports, fragments and encoded queries.
  const path = raw.startsWith(DIR3COM_ORIGIN + '/')
    ? raw.slice(DIR3COM_ORIGIN.length)
    : raw;
  if (path === '/support') return `${DIR3COM_ORIGIN}/support`;
  if (!path.startsWith('/marketplace?')) return null;

  const entries = path.slice('/marketplace?'.length).split('&');
  if (entries.length < 1 || entries.length > 2) return null;
  const params = new Map();
  for (const entry of entries) {
    const match = /^(family|language)=([a-z0-9-]+)$/.exec(entry);
    if (!match || params.has(match[1])) return null;
    params.set(match[1], match[2]);
  }
  if (!FAMILIES.has(params.get('family'))) return null;
  if (params.has('language') && !['ar', 'en'].includes(params.get('language'))) return null;
  // Language variants have not been independently fetched. Drop only this
  // known presentation parameter and use the verified canonical destination.
  // /my-requests is deliberately absent until independently verified.
  return `${DIR3COM_ORIGIN}/marketplace?family=${params.get('family')}`;
}

function wellFormed(text) {
  let result = '';
  for (const cp of text) {
    const code = cp.charCodeAt(0);
    result += cp.length === 1 && code >= 0xd800 && code <= 0xdfff ? '\ufffd' : cp;
  }
  return result;
}

function plainText(text) {
  const source = wellFormed(text)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, ' ');
  // Scan through invisible characters, but retain the originals in ordinary
  // text. In particular, Arabic joining and emoji ZWJ sequences must survive.
  let scan = '';
  const positions = [];
  for (let index = 0; index < source.length; index++) {
    if (/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(source[index])) continue;
    // IDNA recognizes alternate dots; compatibility punctuation can otherwise
    // hide an authority or path. Normalize only the detection copy.
    scan += source[index]
      .replace(/[\u3002\uff0e\uff61\u2024\ufe52]/u, '.')
      .replace(/[\uff0f\u2215\u2044]/u, '/')
      .replace(/\uff3c/u, '\\')
      .replace(/\uff1a/u, ':')
      .replace(/\uff1f/u, '?')
      .replace(/\uff03/u, '#')
      .replace(/[\uff10-\uff19]/u, digit => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
    positions.push(index);
  }
  // URL schemes, protocol-relative URLs, bare domains and root-relative paths.
  // Requiring letters in a domain's final label preserves decimals and ratios.
  const rawUrl = /(?:(?<![a-z0-9+.-])[a-z][a-z0-9+.-]*:\/\/|(?:https?|ftps?|file|javascript|vbscript|data|mailto|tel|sms|intent|magnet|about|blob|wss?):)[^\s<>"'`]+|[/\\]{2}[^\s<>"'`]+|(?<![\p{L}\p{N}.-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+[\p{L}]{2,63}(?::\d+)?(?:[/\\?#][^\s<>"'`]*)?|\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/\\?#][^\s<>"'`]*)?|(?<![\p{L}\p{N}])(?:\.{1,2})?[/\\][^\s<>"'`]+/giu;
  let result = '';
  let cursor = 0;
  for (const match of scan.matchAll(rawUrl)) {
    result += source.slice(cursor, positions[match.index]) + ' ';
    cursor = positions[match.index + match[0].length - 1] + 1;
  }
  result += source.slice(cursor);
  return result
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n');
}

/** Read a balanced inline link. Consumed non-links are not rescanned. */
function inlineLink(text, start) {
  let depth = 1;
  let cursor = start + 1;
  for (; cursor < text.length; cursor++) {
    if (text[cursor] === '\\') { cursor++; continue; }
    if (text[cursor] === '[') depth++;
    if (text[cursor] === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (cursor >= text.length) return {end: text.length};
  const labelEnd = cursor;
  if (text[++cursor] !== '(') return {end: cursor};
  const destinationStart = ++cursor;
  depth = 1;
  for (; cursor < text.length; cursor++) {
    if (text[cursor] === '\\') { cursor++; continue; }
    if (text[cursor] === '(') depth++;
    if (text[cursor] === ')') {
      depth--;
      if (depth === 0) {
        return {
          end: cursor + 1,
          label: text.slice(start + 1, labelEnd),
          destination: text.slice(destinationStart, cursor)
        };
      }
    }
  }
  return {end: text.length};
}

function answerParts(answer) {
  const parts = [];
  const appendText = text => {
    const previous = parts.at(-1);
    if (previous && !previous.url) previous.text += text;
    else parts.push({text});
  };
  let cursor = 0;
  while (cursor < answer.length) {
    const start = answer.indexOf('[', cursor);
    if (start < 0) {
      appendText(answer.slice(cursor));
      break;
    }
    // Images become their alt labels, without retaining the Markdown bang.
    const image = start > cursor && answer[start - 1] === '!';
    appendText(answer.slice(cursor, image ? start - 1 : start));
    const link = inlineLink(answer, start);
    if (link.destination === undefined) {
      appendText(answer.slice(start, link.end));
    } else {
      appendText(link.label.trim());
      const url = image ? null : approvedDestination(link.destination);
      if (url) {
        appendText('\n');
        // Keep the trailing line break in the indivisible URL token. A
        // truncation marker or following punctuation cannot join the URL.
        parts.push({text: url + '\n', url: true});
      }
    }
    cursor = link.end;
  }
  // Sanitize merged text after removing Markdown syntax. Otherwise two text
  // fragments on either side of an unsafe link could assemble a new raw URL.
  return parts.map(part => part.url ? part : {text: plainText(part.text)});
}

/**
 * Return at most `limit` UTF-16 code units, with whole code points and URLs.
 * Unsafe/unapproved Markdown destinations become labels; raw URLs disappear.
 * No footer is added. Invalid API arguments fail instead of being coerced.
 */
function formatWhatsAppAnswer(answer, limit) {
  if (typeof answer !== 'string') throw new TypeError('answer_must_be_string');
  if (!Number.isSafeInteger(limit) || limit < 0) throw new RangeError('limit_must_be_nonnegative_safe_integer');
  if (limit === 0) return '';
  const parts = answerParts(answer.replace(/\r\n?/g, '\n'));
  const full = parts.map(part => part.text).join('').trim();
  if (full.length <= limit) return full;

  let prefix = '';
  const budget = limit - 1;
  let started = false;
  outer: for (const part of parts) {
    const text = started ? part.text : part.text.trimStart();
    if (!text) continue;
    started = true;
    if (part.url) {
      if (prefix.length + text.length > budget) break;
      prefix += text;
    } else {
      for (const cp of text) {
        if (prefix.length + cp.length > budget) break outer;
        prefix += cp;
      }
    }
  }
  prefix = prefix.trimEnd();
  const endsWithUrl = CANONICAL_URLS.some(url => prefix.endsWith(url));
  return prefix + (endsWithUrl ? '\n…' : '…');
}

// Local verification exports only; not part of the deployed excerpt.
module.exports = { approvedDestination, formatWhatsAppAnswer };

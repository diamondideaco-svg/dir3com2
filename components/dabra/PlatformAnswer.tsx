import { Fragment } from 'react';

/** Only explicit local service/account destinations become links. No arbitrary model HTML/URLs. */
export function platformLinkAllowed(href: string) {
  if (!href.startsWith('/') || href.startsWith('//') || /[\\\s\u0000-\u001f]/.test(href)) return false;
  const url = new URL(href, 'https://dir3com.com');
  if (url.pathname === '/' && url.hash === '#home-map' && !url.search) return true;
  return ['/marketplace', '/services', '/my-requests', '/my-account', '/support', '/admin/operations/drive'].includes(url.pathname)
    && [...url.searchParams.keys()].every(k => ['family','language','currency','destination','pickup','pickupAt','returnAt','pickupDate','returnDate','checkIn','checkOut','adults','travelers','passengers','mode','offer'].includes(k));
}
export default function PlatformAnswer({ text }: { text: string }) {
  const pieces = text.split(/(\[[^\]\n]{1,100}\]\(\/[^)\s]{1,1500}\))/g);
  return <span style={{ whiteSpace: 'pre-line' }}>{pieces.map((piece, i) => {
    const match = piece.match(/^\[([^\]\n]+)\]\((\/[^)\s]+)\)$/);
    return match && platformLinkAllowed(match[2])
      ? <a key={i} href={match[2]} className="font-semibold underline underline-offset-4" style={{ overflowWrap: 'anywhere' }}><bdi>{match[1]}</bdi></a>
      : <Fragment key={i}>{piece}</Fragment>;
  })}</span>;
}

import { readCustomerTripBudget } from '@/lib/drive/customer-budget';
import { Fragment } from 'react';

/** Only explicit local service/account destinations become links. No arbitrary model HTML/URLs. */
export function platformLinkAllowed(href: string) {
  if (!href.startsWith('/') || href.startsWith('//') || /[\\\s\u0000-\u001f]/.test(href)) return false;
  const url = new URL(href, 'https://dir3com.com');
  if (url.pathname === '/' && url.hash === '#home-map' && !url.search) return true;
  // These are editable Drive requirements, never execution or quote authority.
  const driveFields=['luggage','budgetAmount','budgetCurrency','budgetBasis','dropoff'];
  if (driveFields.some(key=>url.searchParams.has(key))) {
    if (url.pathname!=='/marketplace' || url.searchParams.getAll('family').length!==1 || url.searchParams.get('family')!=='dir3-drive') return false;
    const dropoff=url.searchParams.getAll('dropoff');
    if(dropoff.length>1 || dropoff.length===1 && (dropoff[0].trim().length<2 || dropoff[0].length>200 || /[\u0000-\u001f\u007f]/.test(dropoff[0])))return false;
    const luggage=url.searchParams.getAll('luggage');
    if (luggage.length>1 || luggage.length===1 && !/^(?:[0-9]|1[0-9]|20)$/.test(luggage[0])) return false;
    if (readCustomerTripBudget(url.searchParams).kind==='invalid') return false;
  }
  return ['/marketplace', '/services', '/my-requests', '/my-account', '/support', '/admin/operations/drive'].includes(url.pathname)
    && [...url.searchParams.keys()].every(k => ['family','language','currency','destination','pickup','pickupAt','returnAt','pickupDate','returnDate','checkIn','checkOut','adults','travelers','rooms','passengers','mode','offer',...driveFields].includes(k));
}
export default function PlatformAnswer({ text,onDriveReview }: { text: string;onDriveReview?:()=>void }) {
  const pieces = text.split(/(\[[^\]\n]{1,100}\]\(\/[^)\s]{1,1500}\))/g);
  return <span style={{ whiteSpace: 'pre-line' }}>{pieces.map((piece, i) => {
    const match = piece.match(/^\[([^\]\n]+)\]\((\/[^)\s]+)\)$/);
    return match && platformLinkAllowed(match[2])
      ? onDriveReview && ['مراجعة متطلبات السيارة','Review car requirements'].includes(match[1]) && new URL(match[2], "https://dir3com.com").pathname==='/marketplace' && new URL(match[2], "https://dir3com.com").searchParams.get("family")==="dir3-drive"
       ? <button key={i} type="button" data-drive-chat-open onClick={onDriveReview} className="font-semibold underline underline-offset-4"><bdi>{match[1]}</bdi></button>
       : <a key={i} href={match[2]} className="font-semibold underline underline-offset-4" style={{ overflowWrap: 'anywhere' }}><bdi>{match[1]}</bdi></a>
      : <Fragment key={i}>{piece}</Fragment>;
  })}</span>;
}

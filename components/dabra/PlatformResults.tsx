import { useDisplayCurrency, useCurrencyRates } from '@/components/currency/useDisplayCurrency';
import Image from 'next/image';
import { buildPlatformAssistantResponse, findPlatformDriveOffers, platformCurrencySelection, platformEntry, type PlatformFamily } from '@/lib/dabra/platform-assistant';
import { vehicleFor, vehicleTitle } from '@/lib/drive/catalog';
import PlatformAnswer from './PlatformAnswer';
import styles from './PlatformResults.module.css';
import type { SavedTrip } from '@/lib/dabra/continuity-contract';
import { useOptionalDabraConversationSession } from '@/components/dabra/DabraConversationProvider';
import { displayPrice, parseDisplayCurrency } from '@/lib/currency/display';

export default function PlatformResults({ query, language, family, trip }: { query: string; language: 'ar' | 'en'; family: PlatformFamily; trip?: SavedTrip | null }) {
  const { currency: displayedCurrency } = useDisplayCurrency();
  const session = useOptionalDabraConversationSession();
  const currency = session ? session.selectRequestCurrency() : displayedCurrency;
  const excludedCurrencies = session ? session.getExcludedRequestCurrencies() : platformCurrencySelection(query).excluded;
  const { snapshot, loading } = useCurrencyRates(currency ?? displayedCurrency);
  const pricing = { currency, snapshot, excludedCurrencies };
  const ar = language === 'ar';
  const drive = family === 'drive';
  const offers = drive ? findPlatformDriveOffers(query, pricing, trip) : [];
  const airport = /airport|المطار/i.test(query);
  return <div className={`dabra-other-results ${styles.results}`} data-platform-results>
    {drive && offers.length > 0 ? <>
      <p className={styles.notice}>{ar ? 'خيارات dir3com. التوفر والسعر النهائي تؤكدهما العمليات.' : 'dir3com options. Operations confirms availability and the final price.'}</p>
      {offers.slice(0, 12).map(offer => {
        const vehicle = vehicleFor(offer);
        const href = `${platformEntry('drive', query, language, currency ?? undefined, trip)}&offer=${encodeURIComponent(offer.id)}`;
        const price = displayPrice(airport ? offer.airport! : offer.chauffeur, offer.currency, currency ?? offer.currency, snapshot);
        const blocked = excludedCurrencies.includes(parseDisplayCurrency(price.currency)!);
        return <article key={offer.id} className="dabra-product-card" style={{ minWidth: 0 }}>
          <Image src={vehicle.image} alt={vehicleTitle(vehicle, language)} width={360} height={210} style={{ width: '100%', height: 150, objectFit: 'contain' }} />
          <h3>{vehicleTitle(vehicle, language)}</h3>
          <p className={styles.price}>{blocked ? (ar ? 'السعر بعملة مقبولة غير متاح حالياً؛ تؤكده العمليات.' : 'Price in an accepted currency is unavailable; Operations will confirm.') : <><bdi>{price.amount.toLocaleString(ar ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {price.currency}</bdi> / {airport ? (ar ? 'استقبال مطار' : 'airport transfer') : (ar ? 'يوم مع سائق' : 'chauffeur day')}{price.unavailable && <small>{ar ? ' تعذر التحويل؛ السعر بعملة المصدر.' : ' Conversion unavailable; source currency shown.'}</small>}</>}</p>
          <p>{ar ? 'سائق وبنزين و120 كم. إجمالي الرحلة يحدده العرض.' : 'Driver, fuel and 120 km included. The offer determines the trip total.'}</p>
          <a className={styles.action} href={href}>{ar ? 'اختيار السيارة وإكمال الطلب' : 'Choose car and complete request'}</a>
        </article>;
      })}
    </> : <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><PlatformAnswer text={loading && drive ? (ar ? 'جارٍ تحميل أسعار الصرف…' : 'Loading exchange rates…') : buildPlatformAssistantResponse(query, [], language, undefined, family, pricing, trip).answer} /></div>}
  </div>;
}

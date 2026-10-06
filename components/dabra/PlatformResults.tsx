import CurrencyPrice from '@/components/currency/CurrencyPrice';
import { useDisplayCurrency, useCurrencyRates } from '@/components/currency/useDisplayCurrency';
import Image from 'next/image';
import { buildPlatformAssistantResponse, findPlatformDriveOffers, platformEntry, type PlatformFamily } from '@/lib/dabra/platform-assistant';
import { vehicleFor, vehicleTitle } from '@/lib/drive/catalog';
import PlatformAnswer from './PlatformAnswer';
import styles from './PlatformResults.module.css';
import type { SavedTrip } from '@/lib/dabra/continuity-contract';

export default function PlatformResults({ query, language, family, trip }: { query: string; language: 'ar' | 'en'; family: PlatformFamily; trip?: SavedTrip | null }) {
  const { currency } = useDisplayCurrency();
  const { snapshot, loading } = useCurrencyRates(currency);
  const pricing = { currency, snapshot };
  const ar = language === 'ar';
  const drive = family === 'drive';
  const offers = drive ? findPlatformDriveOffers(query, pricing, trip) : [];
  const airport = /airport|المطار/i.test(query);
  return <div className={`dabra-other-results ${styles.results}`} data-platform-results>
    {drive && offers.length > 0 ? <>
      <p className={styles.notice}>{ar ? 'خيارات dir3com. التوفر والسعر النهائي تؤكدهما العمليات.' : 'dir3com options. Operations confirms availability and the final price.'}</p>
      {offers.slice(0, 12).map(offer => {
        const vehicle = vehicleFor(offer);
        const href = `${platformEntry('drive', query, language, currency, trip)}&offer=${encodeURIComponent(offer.id)}`;
        return <article key={offer.id} className="dabra-product-card" style={{ minWidth: 0 }}>
          <Image src={vehicle.image} alt={vehicleTitle(vehicle, language)} width={360} height={210} style={{ width: '100%', height: 150, objectFit: 'contain' }} />
          <h3>{vehicleTitle(vehicle, language)}</h3>
          <p className={styles.price}><CurrencyPrice amount={airport ? offer.airport! : offer.chauffeur} sourceCurrency={offer.currency} language={language} /> / {airport ? (ar ? 'استقبال مطار' : 'airport transfer') : (ar ? 'يوم مع سائق' : 'chauffeur day')}</p>
          <p>{ar ? 'سائق وبنزين و120 كم. إجمالي الرحلة يحدده العرض.' : 'Driver, fuel and 120 km included. The offer determines the trip total.'}</p>
          <a className={styles.action} href={href}>{ar ? 'اختيار السيارة وإكمال الطلب' : 'Choose car and complete request'}</a>
        </article>;
      })}
    </> : <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><PlatformAnswer text={loading && drive ? (ar ? 'جارٍ تحميل أسعار الصرف…' : 'Loading exchange rates…') : buildPlatformAssistantResponse(query, [], language, undefined, family, pricing, trip).answer} /></div>}
  </div>;
}

import Image from 'next/image';
import Link from 'next/link';
import styles from './v6.module.css';

// Presentation only. These artwork names never participate in authorization.
type CustomerArtwork = 'customer-service' | 'mall-center' | 'travel-agent';
const cells = { 'travel-agent': '-50%', 'customer-service': '-150%', 'mall-center': '-250%' } as const;

export function DabraCompact({ artwork = 'customer-service' }: { artwork?: CustomerArtwork }) {
  return <span className={styles.dabraCompact} data-dabra-artwork={artwork} aria-hidden="true">
    <Image src="/brand/v6/dabra/compact-atlas.png" alt="" width={1440} height={720} unoptimized style={{ left: cells[artwork] }} />
  </span>;
}

export function DabraIntroduction({ ar }: { ar: boolean }) {
  return <section className={styles.dabraIntroduction} aria-label={ar ? 'الدبرة، مساعد السفر الاختياري' : 'DABRA, your optional travel assistant'}>
    <Image src="/brand/v6/dabra/customer-service.png" alt={ar ? 'دبرة خدمة العملاء' : 'DABRA Customer Service'} width={1536} height={1536} unoptimized />
    <div><h2>{ar ? 'حياك الله، أنا الدبرة' : "Hi, I'm DABRA"}</h2><strong>{ar ? 'خدمة العملاء' : 'Customer Service'}</strong>
      <p>{ar ? 'الدبرة معك من فكرة السفر إلى سلامة الرجعة. استكشف الخدمات وخطّط لرحلتك، والقرار لك.' : 'DABRA is with you from the first travel idea to your safe return. Explore services and plan your journey — the decision is yours.'}</p>
      <Link href="/dabra" className={styles.secondary}>{ar ? 'اسأل الدبرة' : 'Ask DABRA'} →</Link>
    </div>
  </section>;
}

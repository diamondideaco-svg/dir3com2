'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { FiHeart, FiTrash2, FiGrid, FiHome, FiTruck, FiStar, FiBriefcase, FiSend } from 'react-icons/fi';
import { LuHeart, LuLayoutGrid, LuHotel, LuCarFront, LuConciergeBell, LuCrown, LuPlane } from 'react-icons/lu';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { storageKey, readPersisted, createPersisted, validatePersistedFavorites } from '@/lib/dabra/travel-commerce-state';
import type { MarketplaceService } from '@/lib/marketplace/data';
import { PageHeading, LoadError } from './Chrome';
import styles from './v6.module.css';
const families = [['all','الكل','All',FiGrid,LuLayoutGrid],['dir3-stay','الإقامة','Stay',FiHome,LuHotel],['dir3-drive','التنقّل','Drive',FiTruck,LuCarFront],['dir3-concierge','الكونسيرج','Concierge',FiBriefcase,LuConciergeBell],['dir3-vip','VIP','VIP',FiStar,LuCrown],['dir3-fly','الطيران','Fly',FiSend,LuPlane]] as const;
export default function Favorites({ userId }: { userId: string }) {
  const { language } = useLanguage(), ar = language === 'ar';
  const [ids,setIds] = useState<Array<string|number>>([]), [services,setServices] = useState<MarketplaceService[]>([]);
  const [loading,setLoading] = useState(true), [failed,setFailed] = useState(false);
  const [family,setFamily] = useState('all'), [sort,setSort] = useState('saved'), [manage,setManage] = useState(false);
  const owner = 'user:'+userId;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const saved = readPersisted(localStorage.getItem(storageKey(owner,'favorites')),owner,validatePersistedFavorites) || [];
        const chosen = new URLSearchParams(window.location.search).get('family');
        if (chosen && families.some(f => f[0] === 'dir3-'+chosen)) setFamily('dir3-'+chosen);
        setIds(saved);
        if (!saved.length) {setLoading(false);return;}
        const found: MarketplaceService[] = [];
        for(let page=1;page<=20;page++) {
          const response = await fetch('/api/services?pageSize=30&page='+page,{signal:controller.signal,cache:'no-store'});
          if(!response.ok)throw new Error('FAVORITES_READ_FAILED');
          const payload = await response.json();
          if(!Array.isArray(payload.services))throw new Error('FAVORITES_READ_FAILED');
          found.push(...payload.services.filter((s: MarketplaceService) => saved.some(id => String(id)===String(s.id))));
          if(page >= Number(payload.meta?.totalPages || 1))break;
          if(page===20)throw new Error('FAVORITES_READ_INCOMPLETE');
        }
        if(!controller.signal.aborted){setServices(found);setLoading(false);}
      } catch {if(!controller.signal.aborted){setFailed(true);setLoading(false);}}
    }
    void load();
    return () => controller.abort();
  },[owner]);
  function remove(id: string|number) {
    try {
      const next=ids.filter(value=>String(value)!==String(id));
      localStorage.setItem(storageKey(owner,'favorites'),JSON.stringify(createPersisted(next,owner)));
      setIds(next);setServices(current=>current.filter(s=>String(s.id)!==String(id)));
    } catch {setFailed(true);}
  }
  const visible=services.filter(s=>family==='all'||s.family===family).toSorted((a,b)=>sort==='name'?(ar?a.name_ar:a.name_en||a.name_ar).localeCompare(ar?b.name_ar:b.name_en||b.name_ar):ids.findIndex(id=>String(id)===String(b.id))-ids.findIndex(id=>String(id)===String(a.id)));
  return <>
    <div className={styles.documentsHeading} data-dabra-avoid><PageHeading title={ar?'المفضلة':'Favorites'} subtitle={ar?'الأماكن والخدمات التي حفظتها لسهولة العودة إليها':'Places and services you saved to return to easily'} icon={<><FiHeart className={styles.favoritesMobileIcon}/><LuHeart className={styles.favoritesDesktopIcon} strokeWidth={1.75} aria-hidden="true"/></>}/><div className={styles.securityBanner}><FiHeart className={styles.favoritesMobileIcon} aria-hidden="true"/><LuHeart className={styles.favoritesDesktopIcon} strokeWidth={1.75} aria-hidden="true"/><strong>{ar?'كل ما تحبه، في مكان واحد':'Everything you love, in one place'}</strong></div></div>
    <div className={styles.categoryGrid}>{families.map(([key,arabic,english,Icon,DesktopIcon])=><button key={key} type="button" aria-pressed={family===key} onClick={()=>setFamily(key)}><Icon className={styles.favoritesMobileIcon}/><DesktopIcon className={styles.favoritesDesktopIcon} strokeWidth={1.75} aria-hidden="true"/>{ar?arabic:english}</button>)}</div>
    <section className={styles.card}><div className={styles.toolbar}><h2>{ar?'قائمة المفضلة':'Saved favorites'} ({visible.length})</h2><label>{ar?'الترتيب':'Sort'}<select value={sort} onChange={e=>setSort(e.target.value)}><option value="saved">{ar?'الأحدث حفظًا':'Recently saved'}</option><option value="name">{ar?'الاسم':'Name'}</option></select></label><button type="button" className={styles.secondary} aria-pressed={manage} onClick={()=>setManage(!manage)}>{ar?'إدارة المفضلة':'Manage favorites'}</button></div>
      {loading?<p role="status">{ar?'جارٍ التحميل…':'Loading…'}</p>:failed?<LoadError/>:visible.length?<div className={styles.favoritesGrid}>{visible.map(service=><article className={styles.favorite} key={service.id}>
        {service.imageUrl && /^(https:\/\/|\/(?!\/))/.test(service.imageUrl)?<Image src={service.imageUrl} width={400} height={280} alt="" unoptimized/>:<div className={styles.favoriteImage}><FiHeart/></div>}
        <div><h3>{ar?service.name_ar:service.name_en||service.name_ar}</h3><p>{service.destination}</p><p>{Number.isFinite(service.basePrice)&&service.basePrice>0?service.basePrice+' '+service.currency:'—'}</p>
          {service.transactionMethod==='request_to_confirm'&&<p className={styles.badge}>{ar?'طلب تأكيد':'Request confirmation'}</p>}
          <Link className={styles.secondary} href={/^\/(?!\/)/.test(service.href)?service.href:'/marketplace'}>{ar?'عرض التفاصيل':'View details'}</Link>
          {manage&&<button type="button" className={styles.removeFavorite} aria-label={ar?'إزالة من المفضلة':'Remove favorite'} onClick={()=>remove(service.id)}><FiTrash2/></button>}
        </div>
      </article>)}</div>:<div className={styles.empty}><LuHeart className={styles.favoritesEmptyIcon} strokeWidth={1.75} aria-hidden="true"/><p>{ar?'لا توجد خدمات محفوظة في هذا العرض.':'No saved services in this view.'}</p><Link href="/marketplace" className={styles.primary}>{ar?'استكشف الخدمات':'Explore services'}</Link></div>}
    </section>
  </>;
}

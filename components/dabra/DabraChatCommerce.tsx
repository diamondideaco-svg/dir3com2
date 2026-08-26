'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowLeft, FiCheck, FiChevronDown, FiClock, FiHeart, FiMapPin, FiMic, FiMicOff, FiMoreHorizontal, FiSend, FiShoppingBag, FiSliders, FiVolume2, FiVolumeX, FiX } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import type { MarketplaceService } from '@/lib/marketplace/data';
import { supabase } from '@/lib/supabase/client';
import {
  DABRA_ANONYMOUS_SESSION_KEY,
  anonymousOwnerId,
  calculateCartTotals,
  createPersisted,
  persistenceContextForIdentity,
  readPersisted,
  recommendationEligible,
  selectDabraRecommendations,
  storageKey,
  validatePersistedCart,
  validatePersistedFavorites,
  validatePersistedMessages,
  type DabraCartItem,
  type DabraPersistenceContext,
} from '@/lib/dabra/travel-commerce-state';

type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'muted' | 'error';
type Message = { id: string; role: 'user' | 'assistant'; text: string };
type CartItem = DabraCartItem;
type PersistenceContext = DabraPersistenceContext;

const quickActions = ['قارن', 'أرخص', 'أريح', 'بدون توقف', 'أقرب', 'أفخم', 'غير التاريخ', 'شوف بدائل', 'اختصرها لي', 'اختاره لي'];
const tabs = [
  { label: 'الكل', value: undefined },
  { label: 'طيران', value: 'airport-transfers' },
  { label: 'فنادق', value: 'hotels' },
  { label: 'شقق', value: 'apartments' },
  { label: 'سيارات', value: 'cars' },
  { label: 'باكدجات', value: 'offers' },
] as const;

const statusCopy: Record<VoiceStatus, string> = {
  idle: 'جاهزة تسمعك',
  listening: 'أسمعك الآن',
  processing: 'أرتب طلبك...',
  speaking: 'الدبرة تتحدث',
  muted: 'الصوت مكتوم',
  error: 'تعذر تشغيل الصوت',
};

const welcomeMessage: Message = { id: 'welcome', role: 'assistant', text: 'هلا بك. أنا الدبرة، أساعدك ترتب الرحلة بهدوء ووضوح. وش أهم شيء عندك اليوم؟' };

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function DabraChatCommerce() {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [input, setInput] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [activeTab, setActiveTab] = useState<string | undefined>();
  const [services, setServices] = useState<MarketplaceService[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultState, setResultState] = useState<'idle' | 'empty' | 'error'>('idle');
  const [favorites, setFavorites] = useState<Array<string | number>>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [persistenceContext, setPersistenceContext] = useState<PersistenceContext | null>(null);
  const [identityResolved, setIdentityResolved] = useState(false);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const identityRequestRef = useRef(0);

  useEffect(() => {
    let active = true;
    function detachSensitiveState() {
      setStorageHydrated(false);
      setPersistenceContext(null);
      setIdentityResolved(false);
      setMessages([welcomeMessage]);
      setCart([]);
      setFavorites([]);
    }
    async function resolveValidatedIdentity() {
      const requestId = ++identityRequestRef.current;
      detachSensitiveState();
      try {
        const response = await fetch('/api/dabra/session-identity', { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) throw new Error('identity');
        const identity = await response.json() as { identityState?: string; authenticated?: boolean; userId?: string };
        let sessionId = '';
        if (identity.identityState === 'anonymous_confirmed' && identity.authenticated === false) {
          sessionId = window.sessionStorage.getItem(DABRA_ANONYMOUS_SESSION_KEY) ?? '';
          if (!anonymousOwnerId(sessionId)) {
            sessionId = window.crypto.randomUUID();
            window.sessionStorage.setItem(DABRA_ANONYMOUS_SESSION_KEY, sessionId);
          }
        }
        const next = persistenceContextForIdentity(identity, sessionId);
        if (!active || requestId !== identityRequestRef.current) return;
        setPersistenceContext(next);
        setIdentityResolved(true);
      } catch {
        if (!active || requestId !== identityRequestRef.current) return;
        setPersistenceContext(null);
        setIdentityResolved(true);
      }
    }
    void resolveValidatedIdentity();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      identityRequestRef.current += 1;
      detachSensitiveState();
      window.setTimeout(() => { if (active) void resolveValidatedIdentity(); }, 0);
    });
    return () => { active = false; identityRequestRef.current += 1; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!identityResolved) return;
    if (!persistenceContext) {
      const reset = window.setTimeout(() => {
        setMessages([welcomeMessage]);
        setCart([]);
        setFavorites([]);
        setStorageHydrated(false);
      }, 0);
      return () => window.clearTimeout(reset);
    }
    const hydrate = window.setTimeout(() => {
      const storage = persistenceContext.storage === 'local' ? window.localStorage : window.sessionStorage;
      const { ownerId } = persistenceContext;
      setMessages(readPersisted(storage.getItem(storageKey(ownerId, 'context')), ownerId, validatePersistedMessages) ?? [welcomeMessage]);
      setCart(readPersisted(storage.getItem(storageKey(ownerId, 'cart')), ownerId, validatePersistedCart) ?? []);
      setFavorites(readPersisted(storage.getItem(storageKey(ownerId, 'favorites')), ownerId, validatePersistedFavorites) ?? []);
      setStorageHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrate);
  }, [identityResolved, persistenceContext]);

  useEffect(() => {
    if (!persistenceContext || !storageHydrated) return;
    const storage = persistenceContext.storage === 'local' ? window.localStorage : window.sessionStorage;
    storage.setItem(storageKey(persistenceContext.ownerId, 'context'), JSON.stringify(createPersisted(messages.slice(-20), persistenceContext.ownerId)));
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' });
  }, [persistenceContext, storageHydrated, messages]);

  useEffect(() => {
    if (!persistenceContext || !storageHydrated) return;
    const storage = persistenceContext.storage === 'local' ? window.localStorage : window.sessionStorage;
    storage.setItem(storageKey(persistenceContext.ownerId, 'cart'), JSON.stringify(createPersisted(cart, persistenceContext.ownerId)));
  }, [persistenceContext, storageHydrated, cart]);

  useEffect(() => {
    if (!persistenceContext || !storageHydrated) return;
    const storage = persistenceContext.storage === 'local' ? window.localStorage : window.sessionStorage;
    storage.setItem(storageKey(persistenceContext.ownerId, 'favorites'), JSON.stringify(createPersisted(favorites, persistenceContext.ownerId)));
  }, [persistenceContext, storageHydrated, favorites]);

  const recommendations = useMemo(() => selectDabraRecommendations(services), [services]);
  const alternatives = useMemo(() => {
    const recommendedIds = new Set(recommendations.map((service) => service.id));
    return services.filter((service) => !recommendedIds.has(service.id));
  }, [recommendations, services]);
  const cartTotals = useMemo(() => calculateCartTotals(cart), [cart]);

  async function searchMarketplace(message: string) {
    setLoading(true);
    setResultState('idle');
    try {
      const params = new URLSearchParams({ query: message, pageSize: '12' });
      if (activeTab) params.set('category', activeTab);
      const response = await fetch(`/api/services?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('marketplace');
      const payload = (await response.json()) as { services?: MarketplaceService[] };
      const nextServices = payload.services ?? [];
      setServices(nextServices);
      setResultState(nextServices.length ? 'idle' : 'empty');
    } catch {
      setServices([]);
      setResultState('error');
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(text = input) {
    const message = text.trim();
    if (!message || loading) return;
    setInput('');
    const assistantId = makeId();
    setMessages((current) => [...current, { id: makeId(), role: 'user', text: message }, { id: assistantId, role: 'assistant', text: '' }]);
    setVoiceStatus('processing');
    try {
      const response = await fetch('/api/ai2/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history: messages.map(({ role, text: content }) => ({ role, content })), stream: true }),
      });
      if (!response.ok || !response.body) throw new Error('chat');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let answer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, text: answer } : item));
      }
      answer += decoder.decode();
      if (!answer.trim()) answer = 'خلني أرتبها لك بطريقة أوضح. وش تفضّل يكون الأولوية؟';
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, text: answer } : item));
      if (!voiceMuted && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(answer);
        utterance.lang = 'ar-SA';
        utterance.onstart = () => setVoiceStatus('speaking');
        utterance.onend = () => setVoiceStatus('idle');
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, text: 'ما قدرت أوصل للمساعد الآن، لكن نقدر نكمل اختياراتك من السوق مباشرة.' } : item));
    } finally {
      setVoiceStatus((current) => current === 'speaking' ? current : voiceMuted ? 'muted' : 'idle');
      void searchMarketplace(message);
    }
  }

  function toggleMute() {
    const nextMuted = !voiceMuted;
    setVoiceMuted(nextMuted);
    window.speechSynthesis?.cancel();
    setVoiceStatus(nextMuted ? 'muted' : 'idle');
  }

  function toggleVoice() {
    if (voiceStatus === 'listening') {
      recognitionRef.current?.stop();
      setVoiceStatus('idle');
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus('error');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'ar-SA';
    recognition.interimResults = false;
    recognition.onstart = () => setVoiceStatus('listening');
    recognition.onerror = () => setVoiceStatus('error');
    recognition.onend = () => setVoiceStatus((current) => current === 'listening' ? 'idle' : current);
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setInput(transcript);
      setVoiceStatus('processing');
      void sendMessage(transcript);
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function toggleCart(service: MarketplaceService) {
    setCart((current) => current.some((item) => item.id === service.id)
      ? current.filter((item) => item.id !== service.id)
      : [...current, { id: service.id, name_ar: service.name_ar, basePrice: service.basePrice, currency: service.currency, categoryLabel: service.categoryLabel, href: service.href }]);
  }

  function toggleFavorite(id: string | number) {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <main className="dabra-experience" dir="rtl">
      <header className="dabra-topbar">
        <div className="dabra-identity">
          <div className="dabra-avatar" aria-hidden="true">د</div>
          <div>
            <div className="dabra-name">الدبرة <span className="dabra-online" aria-label="متاحة الآن" /></div>
            <p>مساعد السفر الذكي والحارس السياحي</p>
          </div>
        </div>
        <div className="dabra-top-actions">
          <button type="button" className="dabra-icon-button" aria-label="الإعدادات" onClick={() => setShowSettings((value) => !value)}><FiSliders /></button>
          <button type="button" className="dabra-icon-button" aria-label="المزيد"><FiMoreHorizontal /></button>
        </div>
      </header>

      <div className="dabra-layout">
        <section className="dabra-conversation" aria-label="محادثة الدبرة">
          <div className="dabra-conversation-heading">
            <div><span className="dabra-kicker">رحلتك، على رواق</span><h1>خلنا نرتبها سوا.</h1></div>
            <span className="dabra-session"><FiClock /> جلسة جديدة</span>
          </div>
          <div className="dabra-stream" aria-live="polite" aria-busy={voiceStatus === 'processing'} ref={streamRef}>
            {messages.map((message) => (
              <div key={message.id} className={cn('dabra-message', message.role === 'user' ? 'dabra-message-user' : 'dabra-message-assistant')}>
                {message.role === 'assistant' && <span className="dabra-mini-avatar" aria-hidden="true">د</span>}
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          <div className={cn('dabra-voice-panel', `dabra-voice-${voiceStatus}`)}>
            <div className="dabra-waveform" aria-hidden="true">{Array.from({ length: 19 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 17) % 38)}%` }} />)}</div>
            <div className="dabra-voice-copy"><strong>{statusCopy[voiceStatus]}</strong><span>{voiceStatus === 'error' ? 'جرّب الكتابة بدلًا من الصوت' : 'تقدر توقفني أو تقاطعني بأي وقت'}</span></div>
            <div className="dabra-voice-actions"><button type="button" className="dabra-voice-mute" onClick={toggleMute} aria-pressed={voiceMuted} aria-label={voiceMuted ? 'تشغيل صوت الدبرة' : 'كتم صوت الدبرة'}>{voiceMuted ? <FiVolumeX /> : <FiVolume2 />}</button><button type="button" className="dabra-voice-toggle" onClick={toggleVoice} aria-label={voiceStatus === 'listening' ? 'إيقاف الاستماع' : 'تحدث مع الدبرة'}>{voiceStatus === 'listening' ? <FiMicOff /> : <FiMic />}<span>تحدث مع الدبرة</span></button></div>
          </div>

          <div className="dabra-composer">
            <button type="button" className="dabra-composer-icon" aria-label="تفعيل الصوت" onClick={toggleVoice}><FiVolume2 /></button>
            <input value={input} maxLength={500} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void sendMessage(); }} placeholder="قل للدبرة وش تحتاج..." aria-label="رسالة للدبرة" />
            <button type="button" className="dabra-send" aria-label="إرسال الرسالة" onClick={() => void sendMessage()} disabled={!input.trim() || loading}><FiSend /></button>
          </div>
          <div className="dabra-quick-actions" aria-label="إجراءات سريعة">{quickActions.map((action) => <button type="button" key={action} onClick={() => void sendMessage(action)}>{action}</button>)}</div>
        </section>

        <section className="dabra-results" aria-label="نتائج السفر">
          <div className="dabra-results-header"><div><span className="dabra-kicker">سوق الدبرة</span><h2>خيارات تناسبك</h2></div><button type="button" className="dabra-cart-button" onClick={() => setShowCart(true)} aria-label="فتح حقيبة الرحلة"><FiShoppingBag /><b>{cart.length}</b></button></div>
          <div className="dabra-tabs" role="tablist" aria-label="أقسام السوق">{tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.value} className={cn(activeTab === tab.value && 'active')} key={tab.label} onClick={() => setActiveTab(tab.value)}>{tab.label}</button>)}</div>
          <div className="dabra-filter-row"><button type="button"><FiSliders /> الفلاتر</button><button type="button">الأفضل لك <FiChevronDown /></button><button type="button" onClick={() => setCompareMode((value) => !value)}>{compareMode ? 'إنهاء المقارنة' : 'قارن'}</button></div>

          {loading && <div className="dabra-state"><span className="dabra-spinner" /><p>أبحث لك عن الخيارات المناسبة...</p></div>}
          {!loading && resultState === 'empty' && <div className="dabra-state"><FiMapPin /><p>ما لقيت خيارًا مطابقًا الآن. جرّب تغيير الوجهة أو التاريخ.</p></div>}
          {!loading && resultState === 'error' && <div className="dabra-state"><FiX /><p>السوق غير متاح مؤقتًا. نقدر نكمل المحادثة بدون ما نفقد طلبك.</p></div>}
          {!loading && resultState === 'idle' && services.length === 0 && <div className="dabra-state dabra-state-welcome"><FiArrowLeft /><p>اكتب وجهتك أو أولويتك، وأنا أجيب لك الخيارات الواضحة.</p></div>}

          {!loading && recommendations.length > 0 && <div className="dabra-recommendations"><div className="dabra-section-label">ترشيح الدبرة</div>{recommendations.map((service, index) => <ProductCard key={service.id} service={service} badge={index === 0 ? 'BEST MATCH' : index === 1 ? 'BEST VALUE' : 'PREMIUM'} why={index === 0 ? 'الأقرب لطلبك' : index === 1 ? 'أفضل توازن بين السعر والراحة' : 'لمن يفضّل تجربة أهدأ'} inCart={cart.some((item) => item.id === service.id)} favorite={favorites.includes(service.id)} onCart={() => toggleCart(service)} onFavorite={() => toggleFavorite(service.id)} compare={compareMode} />)}</div>}
          {compareMode && recommendations.length > 1 && <ComparisonTable services={recommendations} />}
          {alternatives.length > 0 && <div className="dabra-other-results"><div className="dabra-section-label">بدائل ومحتوى استكشافي</div>{alternatives.map((service) => <ProductCard key={service.id} service={service} catalogOnly={!recommendationEligible(service)} inCart={cart.some((item) => item.id === service.id)} favorite={favorites.includes(service.id)} onCart={() => toggleCart(service)} onFavorite={() => toggleFavorite(service.id)} compare={compareMode} />)}</div>}
        </section>
      </div>

      {showSettings && <div className="dabra-settings" role="dialog" aria-label="إعدادات الدبرة"><button type="button" onClick={() => setShowSettings(false)} aria-label="إغلاق"><FiX /></button><strong>إعدادات المحادثة</strong><label><input type="checkbox" defaultChecked /> اقتراحات مختصرة</label><label><input type="checkbox" defaultChecked /> تنبيه عند تغيّر الحالة</label></div>}
      {showCart && <div className="dabra-cart-drawer" role="dialog" aria-label="حقيبة الرحلة"><button type="button" className="dabra-drawer-close" onClick={() => setShowCart(false)} aria-label="إغلاق الحقيبة"><FiX /></button><span className="dabra-kicker">بناء الرحلة</span><h2>حقيبتك</h2>{cart.length === 0 ? <p className="dabra-muted">ما اخترت شيئًا بعد. نضيف الخيارات اللي تعجبك هنا.</p> : <>{cart.map((item) => <div className="dabra-cart-item" key={item.id}><div><strong>{item.name_ar}</strong><span>{item.categoryLabel}</span></div><b>{item.basePrice || 'حسب الطلب'} {item.currency}</b></div>)}<div className="dabra-cart-total"><span>{cartTotals.message}</span><strong>{cartTotals.unified ? `${cartTotals.amount} ${cartTotals.currency}` : 'غير موحّد'}</strong></div>{!cartTotals.unified && <div className="dabra-cart-groups">{cartTotals.groups.map((group) => <span key={group.currency}>{group.amount} {group.currency}</span>)}</div>}<p className="dabra-muted">الضرائب والرسوم تظهر عند توفرها. ما راح نخفي أي تكلفة.</p></>}</div>}
    </main>
  );
}

function ComparisonTable({ services }: { services: MarketplaceService[] }) {
  return <div className="dabra-comparison" role="region" aria-label="مقارنة الخيارات"><div className="dabra-section-label">مقارنة القرار</div><div className="dabra-comparison-scroll"><table><thead><tr><th scope="col">المعيار</th>{services.map((service) => <th scope="col" key={service.id}>{service.name_ar}</th>)}</tr></thead><tbody><tr><th scope="row">السعر</th>{services.map((service) => <td key={service.id}>{service.basePrice || 'حسب الطلب'} {service.currency}</td>)}</tr><tr><th scope="row">التوفر</th>{services.map((service) => <td key={service.id}>{service.availability === 'available' ? 'متاح' : service.availability === 'limited' ? 'محدود' : 'غير متاح'}</td>)}</tr><tr><th scope="row">سبب الترشيح</th>{services.map((service, index) => <td key={service.id}>{index === 0 ? 'الأقرب لطلبك' : index === 1 ? 'أفضل قيمة' : 'تجربة أرقى'}</td>)}</tr></tbody></table></div></div>;
}

function ProductCard({ service, badge, why, catalogOnly = false, inCart, favorite, onCart, onFavorite, compare }: { service: MarketplaceService; badge?: string; why?: string; catalogOnly?: boolean; inCart: boolean; favorite: boolean; onCart: () => void; onFavorite: () => void; compare: boolean }) {
  return <article className={cn('dabra-product-card', compare && 'dabra-product-card-compare', catalogOnly && 'dabra-product-card-catalog')}>
    <div className="dabra-product-top"><span className="dabra-product-family">{service.categoryLabel}</span><button type="button" className={cn('dabra-favorite', favorite && 'selected')} onClick={onFavorite} aria-label={favorite ? 'إزالة من المحفوظات' : 'حفظ الخيار'}><FiHeart /></button></div>
    {catalogOnly && <span className="dabra-catalog-notice">محتوى استكشافي — التوفر غير موثّق</span>}
    {badge && <span className="dabra-recommendation-badge"><FiCheck /> {badge}</span>}
    <h3>{service.name_ar}</h3><p className="dabra-product-description">{service.description_ar}</p>
    {why && <p className="dabra-why"><span>رأي الدبرة</span>{why}</p>}
    <div className="dabra-product-facts"><span><FiMapPin /> {service.destination}</span><span><FiClock /> {service.productCount === 0 ? '0 خيار — التوفر غير مؤكد' : `${service.productCount} خيار`}</span></div>
    <div className="dabra-product-bottom"><div><small>الإجمالي المعروف من</small><strong>{service.basePrice || 'حسب الطلب'} {service.currency}</strong></div><div className="dabra-product-actions">{!catalogOnly && <button type="button" onClick={onCart} className={cn('dabra-add-button', inCart && 'added')} aria-label={inCart ? 'إزالة من حقيبة الرحلة' : 'إضافة إلى حقيبة الرحلة'}>{inCart ? <FiCheck /> : <FiShoppingBag />}</button>}<a href={service.href}>التفاصيل <FiArrowLeft /></a></div></div>
  </article>;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
    lang: string;
    interimResults: boolean;
    onstart: (() => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    start(): void;
    stop(): void;
  }
}

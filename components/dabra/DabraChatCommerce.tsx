'use client';

import { successfulTaskAllowanceText } from '@/lib/dabra/successful-task-contract';
import PlatformAnswer from '@/components/dabra/PlatformAnswer';
import DabraContinuity from '@/components/dabra/DabraContinuity';
import type { ContinuityPreferences, SavedTrip } from '@/lib/dabra/continuity-contract';
import { useDabraConversation } from '@/components/dabra/DabraConversationProvider';
import type { ConversationJob } from '@/lib/dabra/conversation-session';
import { newTripRequested } from '@/lib/dabra/trip-routing';
import {parseContinuitySnapshot,type ContinuitySnapshot} from '@/lib/dabra/continuity-service';
import PlatformResults from '@/components/dabra/PlatformResults';
import { createPlatformMarketSession, preparePlatformMarketInput, platformConversationScope, platformFamilies, platformCurrencySelection, platformUnanchoredScopeAnswer, platformUserRequestFacts, type PlatformFamily, type PlatformUserRequest, type PlatformLocalCurrencyPolicy } from '@/lib/dabra/platform-assistant';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowLeft, FiCheck, FiChevronDown, FiClock, FiHeart, FiMapPin, FiMessageCircle, FiMic, FiMicOff, FiPaperclip, FiSearch, FiSend, FiShoppingBag, FiSliders, FiStopCircle, FiVolume2, FiX } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import type { MarketplaceService } from '@/lib/marketplace/data';
import { consumeDabraChatResponse } from '@/lib/dabra/chat-response-contract';
import { useDisplayCurrency, useCurrencyRates } from '@/components/currency/useDisplayCurrency';
import { parseDisplayCurrency, type DisplayCurrency } from '@/lib/currency/display';
import { presentDabraPrice, sortDabraMarketPrices, summarizeDabraPrices, type DabraDisplayPrice, type DabraPricePolicy } from '@/lib/dabra/marketplace-pricing';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { DABRA_LOCALE_ERROR, explicitDabraReplyLocale } from '@/lib/dabra/locale-contract';
import { conversationForLocale } from '@/lib/dabra/conversation-locale';
import { DABRA_APPROVED_VOICE, getApprovedDabraPlaybackCopy, getApprovedDabraVoiceCopy } from '@/lib/dabra/approved-voice';
import { buildDabraWhatsAppHandoff, openDabraWhatsAppHandoff } from '@/lib/dabra/whatsapp-handoff';
import { planDabraVoicePlayback, runDabraVoicePlayback } from '@/lib/dabra/voice-segmentation';
import DabraFamilySafetyPanel from '@/components/dabra/DabraFamilySafetyPanel';
import CollaborativeTripCapabilities from '@/components/v6/CollaborativeTripCapabilities';
import { normalizeDabraAvailability, normalizeDabraMarketplaceFamily, parseDabraMarketplaceQuery, toMarketplaceSearchParams } from '@/lib/dabra/marketplace-query';
import {
  applyScopedHotelChange,
  buildDabraRecommendations,
  createPersisted,
  missingTripComponents,
  readPersisted,
  recommendationEligible,
  storageKey,
  validatePersistedCart,
  validatePersistedFavorites,
  validatePersistedMessages,
  type DabraCartItem,
  type DabraResultSort,
} from '@/lib/dabra/travel-commerce-state';

type VoiceStatus = 'idle' | 'listening' | 'processing' | 'error';
type VoicePlaybackStatus = 'idle' | 'loading' | 'playing' | 'error';
type Message = { id: string; role: 'user' | 'assistant'; text: string };
type DabraAttachment = { id: string; file: File; safeName: string; status: 'selected' | 'uploading' | 'error'; error?: string };
type CartItem = DabraCartItem;

const quickActionIds = ['compare', 'cheapest', 'comfort', 'nonstop', 'closest', 'highest', 'date', 'alternatives', 'shortlist', 'choose'] as const;
const tabValues = [undefined, 'dir3-fly', 'dir3-stay', 'dir3-drive', 'dir3-concierge', 'dir3-vip'] as const;

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function safeAttachmentName(name: string) {
  return name.replace(/[\\/\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'attachment';
}

const dabraCopy = {
  ar: {
    name: 'الدبرة', subtitle: 'مساعد السفر الذكي والحارس السياحي', online: 'متاحة الآن', settings: 'الإعدادات', conversation: 'محادثة الدبرة', kicker: 'رحلتك، على رواق', heading: 'خلنا نرتبها سوا.', session: 'جلسة جديدة',
    welcome: 'هلا بك. أنا الدبرة، أساعدك ترتب الرحلة بهدوء ووضوح. وش أهم شيء عندك اليوم؟', attachmentPrompt: 'راجع المرفقات المضافة وساعدني في تخطيط الرحلة.', attachmentSendError: 'تعذر الإرسال. حاول مرة أخرى.', attachmentLimit: `يمكن إضافة ${MAX_ATTACHMENTS} مرفقات كحد أقصى.`, attachmentUnsupported: 'المرفق غير مدعوم. استخدم PDF أو JPEG أو PNG أو WebP بحجم لا يتجاوز 8 MB.',
    status: { idle: 'جاهز لاستقبال صوتك', listening: 'أسمعك الآن', processing: 'أرتب طلبك...', error: 'تعذر استخدام الميكروفون' },
    voiceHint: { idle: 'الميكروفون يعمل فقط عندما تبدأ الإدخال الصوتي', error: 'جرّب الكتابة بدلًا من الميكروفون', active: 'تقدر توقف الإدخال بأي وقت' }, stopListening: 'إيقاف الاستماع', talk: 'استخدم الميكروفون', attach: 'إرفاق صورة أو ملف PDF', enableVoice: 'استخدام الميكروفون', placeholder: 'قل للدبرة وش تحتاج...', securePlaceholder: 'نجهز جلستك الآمنة...', messageLabel: 'رسالة للدبرة', send: 'إرسال الرسالة', selectedAttachments: 'المرفقات المحددة', uploading: 'جارٍ الإرسال', ready: 'جاهز', remove: 'إزالة', quick: 'إجراءات سريعة',
    quickActions: ['قارن', 'أرخص', 'أريح', 'بدون توقف', 'أقرب', 'الأعلى سعرًا', 'غير التاريخ', 'شوف بدائل', 'اختصرها لي', 'اختاره لي'], tabs: ['الكل', 'طيران', 'فنادق وشقق', 'سيارات', 'كونسيرج وباكدجات', 'VIP'], market: 'سوق الدبرة', options: 'خيارات تناسبك', results: 'نتائج السفر', openBag: 'فتح حقيبة الرحلة', marketSections: 'عائلات السوق', searchMarket: 'ابحث في السوق', searchPlaceholder: 'ابحث في سوق الدبرة', search: 'بحث', availableOnly: 'المتاح فقط', saved: 'المحفوظات', sort: 'ترتيب النتائج', sortOptions: ['الأفضل لك', 'السعر: الأقل', 'السعر: الأعلى', 'الأريح', 'الأقرب'], endCompare: 'إنهاء المقارنة', compare: 'قارن', loading: 'أبحث لك عن الخيارات المناسبة...', empty: 'ما لقيت خيارًا مطابقًا الآن. جرّب تغيير الوجهة أو التاريخ.', marketError: 'السوق غير متاح مؤقتًا. نقدر نكمل المحادثة بدون ما نفقد طلبك.', marketWelcome: 'اختر عائلة أو اكتب وجهتك أو أولويتك، وأنا أجيب لك الخيارات المنشورة.', recommendation: 'ترشيح الدبرة', alternatives: 'بدائل ومحتوى استكشافي', requestDate: 'تاريخ الخدمة', travellers: 'عدد المسافرين', continueRequest: 'إرسال طلب واحد لهذا الخيار', requestSending: 'جارٍ إرسال الطلب...', requestSuccess: 'تم إرسال الطلب للمراجعة. هذا طلب وليس حجزًا.', requestError: 'تعذر إرسال الطلب. راجع البيانات أو سجل الدخول ثم حاول مرة أخرى.',
  },
  en: {
    name: 'DABRA', subtitle: 'Your intelligent travel assistant and trip guardian', online: 'Available now', settings: 'Settings', conversation: 'DABRA conversation', kicker: 'Your trip, at your pace', heading: 'Let’s arrange it together.', session: 'New session',
    welcome: 'Welcome. I’m DABRA, here to arrange your trip calmly and clearly. What matters most to you today?', attachmentPrompt: 'Review the attached files and help me plan my trip.', attachmentSendError: 'Unable to send. Please try again.', attachmentLimit: `You can add up to ${MAX_ATTACHMENTS} attachments.`, attachmentUnsupported: 'Unsupported attachment. Use PDF, JPEG, PNG, or WebP up to 8 MB.',
    status: { idle: 'Ready for voice input', listening: 'Listening now', processing: 'Arranging your request...', error: 'Microphone unavailable' },
    voiceHint: { idle: 'The microphone activates only when you start voice input', error: 'Try typing instead of the microphone', active: 'You can stop voice input at any time' }, stopListening: 'Stop listening', talk: 'Use microphone', attach: 'Attach an image or PDF', enableVoice: 'Use microphone', placeholder: 'Tell DABRA what you need...', securePlaceholder: 'Preparing your secure session...', messageLabel: 'Message DABRA', send: 'Send message', selectedAttachments: 'Selected attachments', uploading: 'Sending', ready: 'Ready', remove: 'Remove', quick: 'Quick actions',
    quickActions: ['Compare', 'Cheapest', 'Most comfortable', 'Nonstop', 'Closest', 'Highest price', 'Change date', 'Show alternatives', 'Shortlist', 'Choose for me'], tabs: ['All', 'Fly', 'Stay', 'Drive', 'Concierge', 'VIP'], market: 'DABRA marketplace', options: 'Options for you', results: 'Travel results', openBag: 'Open trip bag', marketSections: 'Marketplace families', searchMarket: 'Search marketplace', searchPlaceholder: 'Search DABRA marketplace', search: 'Search', availableOnly: 'Available only', saved: 'Saved', sort: 'Sort results', sortOptions: ['Recommended', 'Price: low to high', 'Price: high to low', 'Most comfortable', 'Closest'], endCompare: 'End comparison', compare: 'Compare', loading: 'Finding suitable options...', empty: 'No matching option is available right now. Try another destination or date.', marketError: 'The marketplace is temporarily unavailable. We can continue without losing your request.', marketWelcome: 'Choose a family or enter your destination or priority to see published options.', recommendation: 'DABRA recommendation', alternatives: 'Alternatives and discovery content', requestDate: 'Service date', travellers: 'Travellers', continueRequest: 'Submit one request for this option', requestSending: 'Submitting request...', requestSuccess: 'Request submitted for review. This is not a booking.', requestError: 'Unable to submit the request. Check the details or sign in, then try again.',
  },
} as const;

function welcomeMessage(language: 'ar' | 'en'): Message { return { id: 'welcome', role: 'assistant', text: dabraCopy[language].welcome }; }

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function publicItemsToServices(items: Array<Record<string, unknown>>, requestedCurrency: DisplayCurrency | null): MarketplaceService[] {
  return items.map((item) => {
    const family = normalizeDabraMarketplaceFamily(item.marketplace_family);
    const availability = normalizeDabraAvailability(item.availability_status);
    const supplierVerified = item.supplier_verified === true;
    const productVerified = item.verified === true;
    const inventoryCount = availability === 'available' ? 1 : 0;
    const fulfilmentState = (item.fulfilment_state as MarketplaceService['fulfilmentState']) ?? 'availability_unknown';
    const transactionMethod = (item.transaction_method as MarketplaceService['transactionMethod']) ?? 'none';
    const marketplaceEnvironment = item.marketplace_environment as MarketplaceService['marketplaceEnvironment'];
    const trustedTransaction = (fulfilmentState === 'verified_requestable' && transactionMethod === 'request_to_confirm') ||
      (fulfilmentState === 'verified_quote' && transactionMethod === 'request_quote') ||
      (fulfilmentState === 'live_bookable' && transactionMethod === 'instant_booking');
    const partnerVerified = productVerified && supplierVerified && marketplaceEnvironment === 'production' && trustedTransaction;
    const sourceCurrency = parseDisplayCurrency(item.currency);
    const quote = item.display_price && typeof item.display_price === 'object' && !Array.isArray(item.display_price) ? item.display_price as Record<string, unknown> : null;
    const quoteCurrency = parseDisplayCurrency(quote?.currency);
    const validQuote = sourceCurrency && requestedCurrency && quoteCurrency === requestedCurrency && quoteCurrency !== sourceCurrency && quote?.live === true
      && quote.base_amount === item.starting_price && parseDisplayCurrency(quote.base_currency) === sourceCurrency
      && typeof quote.amount === 'number' && Number.isFinite(quote.amount) && quote.amount >= 0;
    return { id: String(item.id), slug: String(item.slug), name_ar: String(item.name_ar), name_en: String(item.name_en), description_ar: String(item.description ?? ''), description_en: String(item.description ?? ''), badge: family, family, familyLabel: family, category: family === 'dir3-drive' ? 'cars' : family === 'dir3-stay' ? 'hotels' : 'experiences', categoryLabel: String(item.category_name_en ?? item.category_slug ?? ''), icon: String(item.image_url ?? ''), href: `/services/${String(item.slug)}`, metric: availability, tags: [], basePrice: typeof item.starting_price === 'number' ? item.starting_price : 0, currency: sourceCurrency ?? 'UNKNOWN', displayPriceAmount: validQuote ? quote!.amount as number : null, displayCurrency: validQuote ? quoteCurrency : null, pricingStatus: validQuote ? 'converted' : 'on_request', productCount: 1, inventoryCount, availability, destination: typeof item.city === 'string' ? item.city : '', featured: false, popular: false, recommended: partnerVerified && availability === 'available', source: 'api', provenance: partnerVerified ? 'PARTNER_VERIFIED' : 'FALLBACK', fulfilmentState, transactionMethod, marketplaceEnvironment: marketplaceEnvironment ?? 'production', supplyType: partnerVerified ? 'verified_local_partner' : 'unknown', supplierVerified, verified: productVerified, createdAt: null, updatedAt: null, imageUrl: typeof item.image_url === 'string' ? item.image_url : null };
  });
}

export default function DabraChatCommerce() {
  const { state } = useDabraConversation();
  return <DabraChatCommerceSession key={state.generation} />;
}

function DabraChatCommerceSession() {
  const { session: conversation, state: conversationState } = useDabraConversation();
  const viewMountedRef = useRef(true);
  const marketSessionRef = useRef<ReturnType<typeof createPlatformMarketSession> | null>(null);
  if (!marketSessionRef.current) marketSessionRef.current = createPlatformMarketSession();
  const marketSession = marketSessionRef.current;
  const marketTurnsRef = useRef<Array<{role:'user';content:string;currencyRevision:number}>>([]);
  const marketHistoryUncertainRef = useRef(false);
  const marketCurrencyMutationRef = useRef(false);
  const { language, direction } = useLanguage();
  const { currency, setCurrency } = useDisplayCurrency();
  const requestCurrency = conversation.selectRequestCurrency();
  const excludedCurrencies = conversation.getExcludedRequestCurrencies();
  const { snapshot: currencySnapshot } = useCurrencyRates(requestCurrency ?? currency);
  const pricePolicy: DabraPricePolicy = { currency: requestCurrency, excludedCurrencies, snapshot: currencySnapshot };
  const t = dabraCopy[language];
  const approvedVoiceCopy = getApprovedDabraVoiceCopy(language);
  const approvedPlaybackCopy = getApprovedDabraPlaybackCopy(language);
  const messages = useMemo(() => conversationState.messages.length ? conversationState.messages : [welcomeMessage(language)], [conversationState.messages, language]);
  const viewGeneration = conversationState.generation;
  const setMessages = useCallback((update: Parameters<typeof conversation.setMessages>[0]) => conversation.setMessagesFor(viewGeneration, update), [conversation, viewGeneration]);
  const input = conversationState.draft;
  const setInput = useCallback((update: Parameters<typeof conversation.setDraft>[0]) => conversation.setDraftFor(viewGeneration, update), [conversation, viewGeneration]);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [voicePlaybackStatus, setVoicePlaybackStatus] = useState<VoicePlaybackStatus>('idle');
  const [voicePlaybackPartial, setVoicePlaybackPartial] = useState(false);
  const [approvedVoiceAvailable, setApprovedVoiceAvailable] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<string | undefined>();
  const [platformQuery, setPlatformQuery] = useState<{ request: PlatformUserRequest; family: PlatformFamily; currencyPolicy:PlatformLocalCurrencyPolicy } | null>(null);
  const [marketNotice, setMarketNotice] = useState('');
  const [services, setServices] = useState<MarketplaceService[]>([]);
  const [marketplaceQuery, setMarketplaceQuery] = useState('');
  const [lastMarketplaceQuery, setLastMarketplaceQuery] = useState('');
  const [resultSort, setResultSort] = useState<DabraResultSort>('recommended');
  const [availabilityOnly, setAvailabilityOnly] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [nonstopOnly, setNonstopOnly] = useState(false);
  const [resultLimit, setResultLimit] = useState(12);
  const [attachments, setAttachments] = useState<DabraAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [loading, setLoading] = useState(false);
  const chatInFlight = conversationState.pending;
  const [resultState, setResultState] = useState<'idle' | 'empty' | 'error'>('idle');
  const [favorites, setFavorites] = useState<Array<string | number>>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    if (!showCart && !showSettings) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = document.querySelector<HTMLElement>(showCart ? '.dabra-cart-drawer' : '.dabra-settings');
    if (!dialog) return;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
    controls()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (showCart) setShowCart(false); else setShowSettings(false);
      } else if (showCart && event.key === 'Tab') {
        const elements = controls();
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); if (trigger?.isConnected) trigger.focus(); };
  }, [showCart, showSettings]);

  const setContinuityPreferences = conversation.setPreferences;
  const continuityDraft = conversationState.continuityDraft;
  const setContinuityDraft = conversation.setContinuityDraft;
  const continuityContextRef = useRef(conversation.context);
  const [compareMode, setCompareMode] = useState(false);
  const [requestedFor, setRequestedFor] = useState('');
  const [travellerCount, setTravellerCount] = useState(1);
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'submitted' | 'error'>('idle');
  const [requestReference, setRequestReference] = useState('');
  const persistenceContext = conversationState.persistence;
  const identityResolved = conversationState.ready;
  const [storageHydrated, setStorageHydrated] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const playbackRef = useRef<HTMLAudioElement | null>(null);
  const playbackAbortRef = useRef<AbortController | null>(null);
  const playbackUrlRef = useRef<string | null>(null);
  const playbackGenerationRef = useRef(0);
  const attachmentRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const lifecycleRef = useRef(0);
  const marketplaceRequestRef = useRef(0);
  const marketplaceAbortRef = useRef<AbortController | null>(null);
  const requestInFlightRef = useRef(false);
  const idempotencyKeysRef = useRef(new Map<string, string>());
  const voiceGenerationRef = useRef(0);
  const languageRef = useRef(language);
  const previousLanguageRef = useRef(language);
  useEffect(()=>{languageRef.current=language;},[language]);

  function stopVoiceResources() {
    voiceGenerationRef.current += 1;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onstart = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onresult = null;
      try { recognition.abort?.(); } catch { try { recognition.stop(); } catch { /* already stopped */ } }
    }
    stopVoicePlayback();
  }

  function releaseVoiceAudio() {
    const audio = playbackRef.current;
    playbackRef.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    playbackUrlRef.current = null;
  }

  function stopVoicePlayback() {
    playbackGenerationRef.current += 1;
    playbackAbortRef.current?.abort();
    playbackAbortRef.current = null;
    releaseVoiceAudio();
    setVoicePlaybackStatus('idle');
  }

  function invalidateActiveRequests() {
    marketSession.noteUserInput();
    marketSession.invalidate();
    if (marketTurnsRef.current.length) marketHistoryUncertainRef.current = true;
    lifecycleRef.current += 1;
    marketplaceRequestRef.current += 1;
    marketplaceAbortRef.current?.abort();
    marketplaceAbortRef.current = null;
    setLoading(false);
    stopVoiceResources();
  }

  // The shared local session owns the view lifecycle. A separate server-side
  // source/consent check is still required across requests and other views.
  useEffect(() => {
    let previous = conversation.getSnapshot();
    marketSession.trackLease(JSON.stringify(conversation.context?.lease ?? null));
    let observedCurrency=conversation.selectRequestCurrency(), observedExclusions=conversation.getExcludedRequestCurrencies();
    let currencyKey = `${observedCurrency ?? ''}:${observedExclusions.join(',')}`;
    return conversation.subscribe(() => {
      const next = conversation.getSnapshot();
      const nextCurrency=conversation.selectRequestCurrency(), nextExclusions=conversation.getExcludedRequestCurrencies();
      const nextCurrencyKey = `${nextCurrency ?? ''}:${nextExclusions.join(',')}`;
      // Compare user content as well as IDs: an edit or removal changes the
      // input behind an already-rendered result. Ignore tagged presentation
      // messages from the continuity context and our own in-flight chat turn.
      const independent = (items: typeof next.messages) => conversation.context?.independent ? conversation.context.independent(items) : items;
      const previousUsers = new Map(independent(previous.messages).filter(item=>item.role==='user').map(item=>[item.id,item.text]));
      const nextUsers = independent(next.messages).filter(item=>item.role==='user');
      const nextUserIds = new Set(nextUsers.map(item=>item.id));
      const foreignInput = nextUsers.some(item=>(!previousUsers.has(item.id) || previousUsers.get(item.id)!==item.text) && !marketSession.ownsChatMessage(item.id))
        || [...previousUsers.keys()].some(id=>!nextUserIds.has(id) && !marketSession.ownsChatMessage(id));
      const currencyChanged = nextCurrencyKey !== currencyKey;
      const newForeignJob = next.pending && !previous.pending && !marketSession.hasChat();
      const nextLease=JSON.stringify(conversation.context?.lease ?? null);
      const leaseChanged=!marketSession.leaseMatches(nextLease);
      marketSession.trackLease(nextLease);
      const authorityChanged = next.generation !== previous.generation || next.preferences !== previous.preferences || leaseChanged;
      const invalidate = authorityChanged || foreignInput || newForeignJob || currencyChanged && !marketCurrencyMutationRef.current;
      // A fallback caused by rejecting the previous currency is not an
      // affirmative selection of the fallback. Only a selector event can
      // re-allow its own currency; unrelated exclusions remain intact.
      const fallback=Boolean(observedCurrency && nextExclusions.includes(observedCurrency) && !observedExclusions.includes(observedCurrency));
      const explicitlySelected=!marketCurrencyMutationRef.current && nextCurrency && (
        observedExclusions.includes(nextCurrency) && !nextExclusions.includes(nextCurrency)
        || nextCurrency!==observedCurrency && !fallback);
      if (currencyChanged) marketSession.noteCurrencyChange(explicitlySelected ? nextCurrency : null);
      if (invalidate) {
        marketSession.noteUserInput();
        marketSession.invalidate();
        if (next.generation !== previous.generation) { marketTurnsRef.current = []; marketHistoryUncertainRef.current = false; }
        else if (foreignInput && marketTurnsRef.current.length) marketHistoryUncertainRef.current = true;
        marketplaceRequestRef.current += 1;
        marketplaceAbortRef.current?.abort();
        marketplaceAbortRef.current = null;
        setPlatformQuery(null); setServices([]); setResultState('idle'); setLoading(false);
      }
      previous = next; observedCurrency=nextCurrency; observedExclusions=nextExclusions; currencyKey = nextCurrencyKey;
    });
  }, [conversation, marketSession]);

  useEffect(() => {
    viewMountedRef.current = true;
    return () => { viewMountedRef.current = false; invalidateActiveRequests(); };
  // The root owns chat cancellation. View cleanup only stops local market/voice resources.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/dabra/voice', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ available?: boolean }> : { available: false })
      .then((status) => { if (!controller.signal.aborted) setApprovedVoiceAvailable(status.available === true); })
      .catch(() => { if (!controller.signal.aborted) setApprovedVoiceAvailable(false); });
    const cancelForNavigation = () => stopVoicePlayback();
    window.addEventListener('pagehide', cancelForNavigation);
    return () => {
      controller.abort();
      window.removeEventListener('pagehide', cancelForNavigation);
      stopVoicePlayback();
    };
  }, []);

  useEffect(() => {
    if (!identityResolved || viewGeneration !== conversation.getSnapshot().generation) return;
    if (!persistenceContext) {
      const reset = window.setTimeout(() => {
        if (!viewMountedRef.current || viewGeneration !== conversation.getSnapshot().generation) return;
        setMessages([welcomeMessage(languageRef.current)]);
        setCart([]);
        setFavorites([]);
        setStorageHydrated(false);
      }, 0);
      return () => window.clearTimeout(reset);
    }
    const hydrate = window.setTimeout(() => {
      if (!viewMountedRef.current || viewGeneration !== conversation.getSnapshot().generation) return;
      const storage = persistenceContext.storage === 'local' ? window.localStorage : window.sessionStorage;
      const { ownerId } = persistenceContext;
      conversation.hydrateMessages(readPersisted(storage.getItem(storageKey(ownerId, 'context')), ownerId, validatePersistedMessages) ?? []);
      setCart(readPersisted(storage.getItem(storageKey(ownerId, 'cart')), ownerId, validatePersistedCart) ?? []);
      setFavorites(readPersisted(storage.getItem(storageKey(ownerId, 'favorites')), ownerId, validatePersistedFavorites) ?? []);
      setStorageHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrate);
  }, [identityResolved, persistenceContext, conversation, setMessages, viewGeneration]);

  useEffect(() => {
    if (!persistenceContext || !storageHydrated || !conversation.getSnapshot().ready || viewGeneration !== conversation.getSnapshot().generation) return;
    const storage = persistenceContext.storage === 'local' ? window.localStorage : window.sessionStorage;
    if (conversation.privateConversation) {
      storage.removeItem(storageKey(persistenceContext.ownerId, 'context'));
      return;
    }
    storage.setItem(storageKey(persistenceContext.ownerId, 'context'), JSON.stringify(createPersisted(conversation.cachedMessages(messages), persistenceContext.ownerId)));
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' });
  }, [persistenceContext, storageHydrated, messages, conversation, conversationState.pending, viewGeneration]);

  useEffect(() => {
    if (!persistenceContext || !storageHydrated || !conversation.getSnapshot().ready || viewGeneration !== conversation.getSnapshot().generation) return;
    const storage = persistenceContext.storage === 'local' ? window.localStorage : window.sessionStorage;
    if(continuityContextRef.current.lease){storage.removeItem(storageKey(persistenceContext.ownerId,'cart'));return;}
    storage.setItem(storageKey(persistenceContext.ownerId, 'cart'), JSON.stringify(createPersisted(cart, persistenceContext.ownerId)));
  }, [persistenceContext, storageHydrated, cart, conversation, viewGeneration]);

  useEffect(() => {
    if (!persistenceContext || !storageHydrated || !conversation.getSnapshot().ready || viewGeneration !== conversation.getSnapshot().generation) return;
    const storage = persistenceContext.storage === 'local' ? window.localStorage : window.sessionStorage;
    storage.setItem(storageKey(persistenceContext.ownerId, 'favorites'), JSON.stringify(createPersisted(favorites, persistenceContext.ownerId)));
  }, [persistenceContext, storageHydrated, favorites, conversation, viewGeneration]);

  const visibleServices = sortDabraMarketPrices(services
    .filter((service) => !availabilityOnly || service.availability === 'available')
    .filter((service) => !favoritesOnly || favorites.includes(service.id))
    .filter((service) => !nonstopOnly || service.tags.some((tag) => /(?:بدون توقف|مباشر|nonstop|direct)/iu.test(tag))), resultSort, pricePolicy).slice(0, resultLimit);
  const visiblePriceCurrencies = new Set(visibleServices.flatMap(service => {
    const price = presentDabraPrice(service, pricePolicy);
    return price.kind === 'available' ? [price.currency] : [];
  }));
  // Ranking uses only visible comparable prices, but keeps source rows for the cart.
  const sourceById = new Map(visibleServices.map(service => [service.id, service]));
  const recommendationDecisions = buildDabraRecommendations(visibleServices.map(service => {
    const price = presentDabraPrice(service, pricePolicy);
    return { ...service, basePrice: price.kind === 'available' ? price.amount : 0, currency: price.kind === 'available' ? price.currency : '' };
  })).map(decision => ({ ...decision, service: sourceById.get(decision.service.id)! }));
  const recommendations = useMemo(() => recommendationDecisions.map(({ service }) => service), [recommendationDecisions]);
  const alternatives = useMemo(() => {
    const recommendedIds = new Set(recommendations.map((service) => service.id));
    return visibleServices.filter((service) => !recommendedIds.has(service.id));
  }, [recommendations, visibleServices]);
  const cartPrices = cart.map(item => {
    const current = services.find(service => service.id === item.id && service.basePrice === item.basePrice && service.currency === item.currency);
    return presentDabraPrice(current ?? item, pricePolicy);
  });
  const cartTotals = summarizeDabraPrices(cartPrices);

  const missingComponents = useMemo(() => missingTripComponents(cart), [cart]);
  const latestAssistantText = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant' && message.text.trim())?.text ?? '', [messages]);
  const comparisonServices = useMemo(() => {
    const selected = new Set(cart.map((item) => String(item.id)));
    return visibleServices.filter((service) => selected.has(String(service.id)) && recommendationEligible(service));
  }, [cart, visibleServices]);

  async function searchMarketplace(message: string, familyOverride = activeTab, applyCurrencyChoice = true, fromTab = false, chatRefresh = false) {
    if (!chatRefresh) marketSession.noteUserInput();
    // begin() invalidates the previous result before reading or composing input.
    let boundaryUnclear = false;
    const preparation = preparePlatformMarketInput(marketSession, () => ({ role:'user', content:message.trim() }), async (event, isCurrent) => {
      if (!event.content && !familyOverride) return { history: [], trip: null };
      if (!await ensureContinuityFresh(false, undefined, isCurrent) || !isCurrent()) throw new Error('continuity-unavailable');
      const context = continuityContextRef.current;
      const sourceMessages = context.scoped(conversation.getSnapshot().messages);
      const decision = newTripRequested.decision(event.content);
      const standalone=platformConversationScope(event.content,[],context.trip);
      const freshService=Boolean(context.trip && !standalone.trip && !standalone.tripStatus && !standalone.scopeReason && !marketTurnsRef.current.length && !decision.mentioned && !newTripRequested.deferred(event.content));
      const explicitBoundary = freshService || decision.mentioned && decision.kind === 'new' && !decision.refused && !decision.contested
        || platformUnanchoredScopeAnswer(event.content) === 'separate';
      if (explicitBoundary) {
        marketSession.setHistoryBoundary(sourceMessages.map(item=>item.id));
        marketTurnsRef.current = []; marketHistoryUncertainRef.current = false;
      } else if (marketHistoryUncertainRef.current && marketTurnsRef.current.length) {
        boundaryUnclear = true; throw new Error('market-history-order-uncertain');
      }
      const history = [...sourceMessages.filter(item=>marketSession.includeHistoryMessage(item.id)).map(({ role, text: content }) => ({ role, content })), ...marketTurnsRef.current.map(({role,content})=>({role,content}))];
      if (history.length > 64) throw new Error('history-limit');
      const preview = platformConversationScope(event.content, history, context.trip);
      // Only a clear final decision may detach the local anchor. Contested
      // requests keep it protected while the issued projection is withheld.
      if (context.trip && (explicitBoundary || preview.scopeReason === 'trip-refused' || decision.mentioned && (decision.kind === 'new' || decision.refused) && !decision.contested)) context.scope(event.content, history);
      else if (preview.trip && preview.tripStatus !== 'contested' && preview.tripStatus !== 'revalidation') context.refine(event.content);
      marketSession.trackLease(JSON.stringify(context.lease ?? null));
      return { history, trip: context.trip };
    });
    const requestId = ++marketplaceRequestRef.current;
    marketplaceAbortRef.current?.abort();
    const controller = new AbortController();
    marketplaceAbortRef.current = controller;
    setPlatformQuery(null); setServices([]); setMarketNotice(''); setLoading(true); setResultState('idle');
    try {
      const prepared = await preparation;
      if (requestId !== marketplaceRequestRef.current || prepared.status === 'stale') return;
      if (prepared.status !== 'ready') {
        if (boundaryUnclear) { setMarketNotice(language === 'ar' ? 'تغيرت المحادثة بعد بحث السوق. ابدأ طلباً جديداً واذكر تفاصيله حتى أتحقق منها بأمان.' : 'The conversation changed after the market search. Start a new request and restate its details so I can check them safely.'); return; }
        throw new Error('market-input');
      }
      if (!marketSession.isCurrent(prepared.ticket)) return;
      const normalizedQuery = prepared.event.content;
      if (!normalizedQuery && !familyOverride) return;
      const facts = platformUserRequestFacts(prepared.request);
      if (!facts) return;
      if (applyCurrencyChoice) {
        marketCurrencyMutationRef.current = true;
        try { conversation.selectRequestCurrency(facts.requestedCurrency, facts.currentExcludedCurrencies); }
        finally { marketCurrencyMutationRef.current = false; }
        if (!marketSession.isCurrent(prepared.ticket) || !platformUserRequestFacts(prepared.request)) return;
      }
      setLastMarketplaceQuery(normalizedQuery);
      const replayed=fromTab ? marketTurnsRef.current.findLast(turn=>turn.content===normalizedQuery) : undefined;
      const supersedeEarlierCurrency=Boolean(replayed && marketSession.explicitCurrencyAfter(replayed.currencyRevision,conversation.selectRequestCurrency()));
      if (!replayed && !chatRefresh) marketTurnsRef.current.push({...prepared.event,currencyRevision:marketSession.currencyVersion()});
      // If the only named service was refused, render its guarded explanation
      // instead of treating that mention as a marketplace search.
      const selected = familyOverride ? familyOverride.replace('dir3-', '') : facts.families[0] ?? facts.deniedFamilies[0] ?? facts.contestedFamilies[0] ?? (facts.blocked ? 'drive' : undefined);
      if (selected && ['drive', 'stay', 'fly', 'concierge', 'vip'].includes(selected)) {
        if (!marketSession.isCurrent(prepared.ticket) || !platformUserRequestFacts(prepared.request)) return;
        const currencyPolicy=marketSession.issueCurrencyPolicy(prepared.ticket,prepared.request,conversation.selectRequestCurrency(),conversation.getExcludedRequestCurrencies(),supersedeEarlierCurrency);
        if (!currencyPolicy) return;
        setPlatformQuery({ request: prepared.request, family: selected as PlatformFamily, currencyPolicy });
        return;
      }
      const parsed = parseDabraMarketplaceQuery(normalizedQuery, familyOverride as Parameters<typeof parseDabraMarketplaceQuery>[1]);
      const params = toMarketplaceSearchParams(parsed, 12);
      const requestCurrency = conversation.selectRequestCurrency();
      if (requestCurrency) params.set('currency', requestCurrency);
      const response = await fetch(`/api/public/marketplace/items?${params.toString().replace('query=', 'q=')}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('marketplace');
      const payload = (await response.json()) as { items?: Array<Record<string, unknown>> };
      // This check follows the last await. The capability is local, not an
      // authentication, source, or consent proof for any server response.
      if (requestId !== marketplaceRequestRef.current || !marketSession.isCurrent(prepared.ticket) || !platformUserRequestFacts(prepared.request)) return;
      const nextServices = publicItemsToServices(payload.items ?? [], requestCurrency);
      setServices(nextServices);
      setResultState(nextServices.length ? 'idle' : 'empty');
    } catch {
      if (controller.signal.aborted || requestId !== marketplaceRequestRef.current) return;
      setServices([]); setResultState('error');
    } finally {
      if (requestId === marketplaceRequestRef.current) {
        marketplaceAbortRef.current = null;
        setLoading(false);
      }
    }
  }

  async function submitMarketplaceRequest(item: CartItem) {
    if (requestInFlightRef.current || requestState === 'submitted') return;
    const productId = String(item.id);
    let idempotencyKey = idempotencyKeysRef.current.get(productId);
    if (!idempotencyKey) {
      idempotencyKey = `dabra:${crypto.randomUUID()}`;
      idempotencyKeysRef.current.set(productId, idempotencyKey);
    }
    requestInFlightRef.current = true;
    setRequestState('sending');
    try {
      const response = await fetch('/api/marketplace/requests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
        body: JSON.stringify({
          product_id: productId,
          requested_for: requestedFor,
          traveller_count: travellerCount,
          customer_brief: { notes: language === 'ar' ? 'طلب من مسار DABRA' : 'Request from DABRA flow' },
        }),
      });
      const payload = await response.json().catch(() => ({})) as { request?: { request_reference?: string; status?: string } };
      if (!response.ok || payload.request?.status !== 'request_submitted' || !payload.request.request_reference) throw new Error('request');
      setRequestReference(payload.request.request_reference);
      setRequestState('submitted');
    } catch {
      setRequestState('error');
    } finally {
      requestInFlightRef.current = false;
    }
  }

  async function sendMessage(text = input) {
    marketSession.noteUserInput();
    marketSession.invalidate();
    if (marketTurnsRef.current.length) marketHistoryUncertainRef.current = true;
    setPlatformQuery(null); setServices([]); setResultState('idle'); setLoading(false);
    marketplaceRequestRef.current += 1; marketplaceAbortRef.current?.abort();
    const generation = conversation.getSnapshot().generation;
    if(!viewMountedRef.current || generation !== viewGeneration || conversation.getSnapshot().pending || !identityResolved)return;
    if (!text.trim() && !conversation.context.draft && !attachments.length) return;
    const job = conversation.begin();
    if (!job) return;
    marketSession.beginChat(job.id);
    const inputVersion = marketSession.userVersion();
    // A message's currency intent takes effect at submission, before any async gate.
    const explicitText = text.trim();
    const currencyChoice = platformCurrencySelection(explicitText);
    marketCurrencyMutationRef.current = true;
    let requestedCurrency:DisplayCurrency|null;
    try { requestedCurrency = conversation.selectRequestCurrency(currencyChoice.requested, currencyChoice.excluded); }
    finally { marketCurrencyMutationRef.current = false; }
    const excludedCurrencies = conversation.getExcludedRequestCurrencies();
    if (currencyChoice.requested && currencyChoice.requested !== currency) setCurrency(currencyChoice.requested);
    if(!await ensureContinuityFresh(false, job) || !conversation.isCurrent(job)) { conversation.finish(job); marketSession.endChat(job.id); return; }
    if(newTripRequested(text))forgetContinuityContext(job);
    const context=continuityContextRef.current;
    const draft=context.draft;
    const message = explicitText || draft || (attachments.length ? t.attachmentPrompt : '');
    if (!message || !identityResolved) { conversation.finish(job); marketSession.endChat(job.id); return; }
    const requestHistory=context.scoped(messages).map(({role,text:content})=>({role,content}));
    const trip=context.scope(explicitText,requestHistory);
    // Never send a saved-trip presentation string as an ordinary user turn
    // after the typed trip has left scope.
    if(draft&&!explicitText&&!trip){
      setContinuityDraft(null);
      conversation.setError(language==='ar'?'تعذر استئناف الرحلة المحفوظة. افتحها مجدداً وحاول مرة أخرى.':'Could not resume the saved trip. Open it again and retry.');
      conversation.finish(job);marketSession.endChat(job.id);return;
    }
    const requestMessage=explicitText || trip?.families.join(' ') || message;
    const derivedResponse=Boolean(context.lease);
    const setJobMessages = (update: Parameters<typeof conversation.setMessages>[0]) => conversation.update(job, update);
    stopVoicePlayback();
    setVoicePlaybackPartial(false);
    const lifecycle = lifecycleRef.current;
    const signal = job.signal;
    const pendingAttachments = attachments;
    // A fresh continuity read can outlive a new edit in the composer.
    setInput(current=>current===text?'':current);
    setAttachments((current) => current.map((item) => ({ ...item, status: 'uploading', error: undefined })));
    setAttachmentError('');
    setCart((current) => applyScopedHotelChange(current, message));
    const assistantId = `assistant-${job.id}`;
    const userId=`user-${job.id}`;const seed:Message|null=draft&&trip&&explicitText?{id:makeId(),role:'user',text:draft}:null;
    // The staged summary is presentation only. Explicit refinements update
    // the ephemeral typed trip, never the saved record or account authority.
    const requestLocale = explicitDabraReplyLocale(requestMessage) ?? language;
    context.beginAnswer(assistantId);
    if(context.lease){context.tag(assistantId);if(seed)context.tag(seed.id);else if(draft&&!explicitText)context.tag(userId);}
    context.draft=null;setContinuityDraft(null);
    setJobMessages((current) => [...current,...(seed?[seed]:[]), { id:userId, role: 'user', text: message }, { id: assistantId, role: 'assistant', text: '' }]);
    setVoiceStatus('processing');
    let answerFinished=false;
    try {
      const form = new FormData();
      form.set('message', requestMessage);
      form.set('history', JSON.stringify(requestHistory));
      if(trip&&context.lease)form.set('continuityTrip',JSON.stringify({revision:context.lease.revision,generation:context.lease.generation,trip}));
      form.set('stream', 'true');
      form.set('locale', requestLocale);
      if (requestedCurrency) form.set('currency', requestedCurrency);
      form.set('excludedCurrencies', JSON.stringify(excludedCurrencies));
      for (const item of pendingAttachments) form.append('attachment', item.file, item.safeName);
      const transport = conversation.transport(job, JSON.stringify(['form', requestMessage, requestedCurrency, excludedCurrencies,
        form.get('locale'), form.get('continuityTrip'), pendingAttachments.map(item => item.id)]), form);
      const response = await fetch('/api/ai2/chat', {
        method: 'POST',
        headers: { Accept: 'text/plain', 'X-DABRA-Request-Id': transport.id },
        body: transport.body,
        signal,
      });
      if (!conversation.isCurrent(job)) return;
      if(derivedResponse&&!response.ok&&!await ensureContinuityFresh(false,job))return;
      conversation.acceptAllowance(job, response.headers);
      if (response.headers.get('X-DABRA-Private-Context') === '1' || response.headers.get('Content-Type')?.includes('application/json')) conversation.markPrivate();
      const finalAnswer=await consumeDabraChatResponse(response, (visibleAnswer) => {
        if (derivedResponse || !conversation.isCurrent(job)) return;
        setJobMessages((current) => current.map((item) => item.id === assistantId ? { ...item, text: visibleAnswer } : item));
      }, DABRA_LOCALE_ERROR[requestLocale], () => { throw new Error('DABRA_RESPONSE_UNCERTAIN'); });
      if(derivedResponse&&!await ensureContinuityFresh(false,job))return;
      if (!conversation.isCurrent(job)) return;
      context.finishAnswer(assistantId);answerFinished=true;
      // Trigger persistence only after completion, even if React already
      // rendered the final streaming callback while it was still pending.
      setJobMessages(current=>current.map(item=>item.id===assistantId?{...item,text:finalAnswer}:item));
      if (viewMountedRef.current) { setAttachments([]); if (attachmentRef.current) attachmentRef.current.value = ''; }
    } catch {
      if (!conversation.isCurrent(job)) return;
      context.finishAnswer(assistantId);answerFinished=true;
      conversation.fail(job, DABRA_LOCALE_ERROR[requestLocale]);
      if (viewMountedRef.current) setAttachments((current) => current.map((item) => ({ ...item, status: 'error', error: t.attachmentSendError })));
      setJobMessages((current) => current.map((item) => item.id === assistantId ? { ...item, text: DABRA_LOCALE_ERROR[requestLocale] } : item));
    } finally {
      if(!answerFinished)setJobMessages(current=>current.filter(item=>item.id!==assistantId));
      context.finishAnswer(assistantId);
      const current = conversation.isCurrent(job);
      conversation.finish(job);
      marketSession.endChat(job.id);
      if (current && viewMountedRef.current && lifecycle === lifecycleRef.current) {
        setVoiceStatus('idle');
        if (marketSession.userVersion() === inputVersion && explicitText) void searchMarketplace(explicitText, activeTab, false, false, true);
      }
    }
  }

  async function playApprovedVoice() {
    if (voicePlaybackStatus === 'loading' || voicePlaybackStatus === 'playing') {
      stopVoicePlayback();
      return;
    }
    if (!approvedVoiceAvailable || !latestAssistantText) return;
    stopVoicePlayback();
    const generation = playbackGenerationRef.current;
    const controller = new AbortController();
    playbackAbortRef.current = controller;
    const plan = planDabraVoicePlayback(latestAssistantText);
    setVoicePlaybackPartial(plan.hasRemainder);
    if (!plan.segments.length) {
      playbackAbortRef.current = null;
      setVoicePlaybackStatus('error');
      return;
    }
    try {
      await runDabraVoicePlayback(
        plan.segments,
        controller.signal,
        async (segment, signal) => {
          if (generation !== playbackGenerationRef.current || language !== languageRef.current) controller.abort();
          signal.throwIfAborted();
          setVoicePlaybackStatus('loading');
          const response = await fetch('/api/dabra/voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg, audio/wav' },
            credentials: 'same-origin',
            body: JSON.stringify({ text: segment, locale: language }),
            signal,
          });
          if (!response.ok) {
            if (response.status === 503) setApprovedVoiceAvailable(false);
            throw new Error('voice');
          }
          const contentType = response.headers.get('content-type')?.split(';', 1)[0] ?? '';
          if (!['audio/mpeg', 'audio/wav', 'audio/x-wav'].includes(contentType)) throw new Error('voice');
          const audioBlob = await response.blob();
          if (generation !== playbackGenerationRef.current || language !== languageRef.current) controller.abort();
          signal.throwIfAborted();
          return audioBlob;
        },
        async (audioBlob, signal) => {
          signal.throwIfAborted();
          const audioUrl = URL.createObjectURL(audioBlob);
          playbackUrlRef.current = audioUrl;
          const audio = new Audio(audioUrl);
          playbackRef.current = audio;
          setVoicePlaybackStatus('playing');
          try {
            await new Promise<void>((resolve, reject) => {
              let settled = false;
              const settle = (callback: () => void) => {
                if (settled) return;
                settled = true;
                signal.removeEventListener('abort', onAbort);
                callback();
              };
              const onAbort = () => settle(() => reject(new DOMException('Voice playback cancelled', 'AbortError')));
              signal.addEventListener('abort', onAbort, { once: true });
              audio.onended = () => settle(resolve);
              audio.onerror = () => settle(() => reject(new Error('voice')));
              void audio.play().catch((error) => settle(() => reject(error)));
              if (signal.aborted) onAbort();
            });
          } finally {
            releaseVoiceAudio();
          }
        },
      );
      if (generation === playbackGenerationRef.current) stopVoicePlayback();
    } catch {
      if (!controller.signal.aborted && generation === playbackGenerationRef.current) { stopVoicePlayback(); setVoicePlaybackStatus('error'); }
    } finally {
      if (generation === playbackGenerationRef.current) playbackAbortRef.current = null;
    }
  }

  function handleAttachments(files: FileList | null) {
    setAttachmentError('');
    if (!files?.length) return;
    const incoming = Array.from(files);
    if (attachments.length + incoming.length > MAX_ATTACHMENTS) {
      setAttachmentError(t.attachmentLimit);
      if (attachmentRef.current) attachmentRef.current.value = '';
      return;
    }
    const next: DabraAttachment[] = [];
    for (const file of incoming) {
      if (!ALLOWED_ATTACHMENT_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError(t.attachmentUnsupported);
        continue;
      }
      const duplicate = [...attachments, ...next].some((item) => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified);
      if (duplicate) continue;
      next.push({ id: makeId(), file, safeName: safeAttachmentName(file.name), status: 'selected' });
    }
    if (next.length) setAttachments((current) => [...current, ...next]);
    if (attachmentRef.current) attachmentRef.current.value = '';
  }

  function removeAttachment(id: string) {
    if (conversation.getSnapshot().pending) return;
    setAttachments((current) => current.filter((item) => item.id !== id));
    setAttachmentError('');
  }

  function applyQuickAction(action: typeof quickActionIds[number]) {
    if (action === 'compare') return setCompareMode(true);
    if (action === 'cheapest') return setResultSort('price-low');
    if (action === 'comfort') return setResultSort('comfort');
    if (action === 'nonstop') {
      setNonstopOnly((value) => !value);
      return;
    }
    if (action === 'closest') return setResultSort('closest');
    if (action === 'highest') return setResultSort('price-high');
    if (action === 'date') {
      setInput(language === 'ar' ? 'غير التاريخ إلى ' : 'Change the date to ');
      return;
    }
    if (action === 'alternatives') {
      setResultLimit(12);
      setResultSort('recommended');
      setNonstopOnly(false);
      return;
    }
    if (action === 'shortlist') return setResultLimit(3);
    if (action === 'choose') {
      const choice = recommendations[0];
      if (choice) setCart((current) => current.some((item) => item.id === choice.id) ? current : [...current, { id: choice.id, name_ar: language === 'en' ? choice.name_en ?? choice.name_ar : choice.name_ar, basePrice: choice.basePrice, currency: choice.currency, categoryLabel: choice.categoryLabel, href: choice.href }]);
    }
  }

  function toggleVoice() {
    if (voiceStatus === 'listening') {
      stopVoiceResources();
      setVoiceStatus('idle');
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus('error');
      return;
    }
    const recognition = new Recognition();
    const voiceGeneration = ++voiceGenerationRef.current;
    const lifecycle = lifecycleRef.current;
    recognition.lang = language === 'ar' ? 'ar-SA' : 'en-US';
    recognition.interimResults = false;
    recognition.onstart = () => { if (voiceGeneration === voiceGenerationRef.current && lifecycle === lifecycleRef.current) setVoiceStatus('listening'); };
    recognition.onerror = () => { if (voiceGeneration === voiceGenerationRef.current && lifecycle === lifecycleRef.current) { stopVoiceResources(); setVoiceStatus('error'); } };
    recognition.onend = () => { if (voiceGeneration === voiceGenerationRef.current && lifecycle === lifecycleRef.current) { recognitionRef.current = null; setVoiceStatus((current) => current === 'listening' ? 'idle' : current); } };
    recognition.onresult = (event) => {
      if (voiceGeneration !== voiceGenerationRef.current || lifecycle !== lifecycleRef.current || conversation.getSnapshot().pending) return;
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
      : [...current, { id: service.id, name_ar: language === 'en' ? service.name_en ?? service.name_ar : service.name_ar, basePrice: service.basePrice, currency: service.currency, categoryLabel: service.categoryLabel, href: service.href }]);
  }

  function toggleFavorite(id: string | number) {
    setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function forgetContinuityContext(keepJob?: ConversationJob) {
    if (viewGeneration !== conversation.getSnapshot().generation) return;
    const context=continuityContextRef.current;const hadContext=Boolean(context.lease);
    if(hadContext){if(!keepJob || !conversation.isCurrent(keepJob))conversation.cancel();invalidateActiveRequests();}
    conversation.discardRetryTransport();
    setContinuityPreferences(null);
    setContinuityDraft(null);
    conversation.restoreContinuityCurrency();
    // Keep independently typed text, messages, favorites and attachments.
    const independent=context.forget();setMessages(current=>independent(current));
    if(hadContext){setCart([]);setServices([]);setPlatformQuery(null);setLastMarketplaceQuery('');setCompareMode(false);setRequestState('idle');setRequestReference('');
      if(persistenceContext){const storage=persistenceContext.storage==='local'?window.localStorage:window.sessionStorage;storage.removeItem(storageKey(persistenceContext.ownerId,'context'));storage.removeItem(storageKey(persistenceContext.ownerId,'cart'));}}
  }

  useEffect(() => {
    if (previousLanguageRef.current === language) return;
    previousLanguageRef.current = language;
    conversation.cancel();
    invalidateActiveRequests();
    setMessages(current => conversationForLocale(current, welcomeMessage(language)));
    setAttachments([]);
    setAttachmentError('');
    setVoiceStatus('idle');
    setVoicePlaybackPartial(false);
  // Abort old-locale streams; preserve this identity's trip. Server response locale is explicit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  function observeContinuityState(state:ContinuitySnapshot|null){
    if (viewGeneration !== conversation.getSnapshot().generation) return;
    if(!continuityContextRef.current.isFresh(persistenceContext?.ownerId??'',state))forgetContinuityContext();
    conversation.setContinuitySnapshot(state);
  }

  async function ensureContinuityFresh(force=false, job?: ConversationJob, marketCurrent?:()=>boolean){
    if (viewGeneration !== conversation.getSnapshot().generation || marketCurrent && !marketCurrent()) return false;
    if(!force&&!continuityContextRef.current.lease)return true;
    const lifecycle=lifecycleRef.current;
    try{const response=await fetch('/api/dabra/continuity',{cache:'no-store',credentials:'same-origin',signal:job?AbortSignal.any([job.signal,AbortSignal.timeout(8_000)]):AbortSignal.timeout(8_000)});
      const body=await response.json();if((job?!conversation.isCurrent(job):lifecycle!==lifecycleRef.current) || viewGeneration !== conversation.getSnapshot().generation || marketCurrent && !marketCurrent())return false;
      const state=response.ok&&body.enabled===true&&body.ownerId===persistenceContext?.ownerId?parseContinuitySnapshot(body.state):null;
      if(!continuityContextRef.current.isFresh(persistenceContext?.ownerId??'',state)){forgetContinuityContext();conversation.setContinuitySnapshot(state);return false;}
      conversation.setContinuitySnapshot(state);return true;
    }catch{if((job?conversation.isCurrent(job):lifecycle===lifecycleRef.current) && viewGeneration === conversation.getSnapshot().generation && (!marketCurrent || marketCurrent()))forgetContinuityContext();return false;}
  }

  function setAppliedContinuityPreferences(preferences: ContinuityPreferences | null) {
    if (viewGeneration !== conversation.getSnapshot().generation) return;
    if(!preferences){forgetContinuityContext();return;}
    const state=conversation.continuitySnapshot;if(!state||!persistenceContext)return;
    continuityContextRef.current.capture(persistenceContext.ownerId,state,true,Boolean(continuityContextRef.current.lease?.trip));
    setContinuityPreferences(preferences);
    // Saved choices remain available in the account, but are not exported as
    // unbound request settings or copied into the shared display-currency store.
  }

  async function applyContinuityPreferences(preferences:ContinuityPreferences|null){
    if(!preferences){forgetContinuityContext();return;}
    if(!await ensureContinuityFresh(true))return;
    const state=conversation.continuitySnapshot;
    if(!state?.consentEnabled||Date.parse(state.preferencesExpiresAt??'')<=Date.now()||JSON.stringify(state.preferences)!==JSON.stringify(preferences))return;
    setAppliedContinuityPreferences(preferences);
  }

  async function resumeContinuityTrip(trip: SavedTrip, preferences: ContinuityPreferences | null) {
    // Stage intent for explicit user confirmation. No chat, search or provider call here.
    if(!await ensureContinuityFresh(true))return;
    const refreshed=conversation.continuitySnapshot;
    if(!refreshed?.consentEnabled||Date.parse(refreshed.tripExpiresAt??'')<=Date.now()||JSON.stringify(refreshed.trip)!==JSON.stringify(trip)
      ||(preferences&&JSON.stringify(refreshed.preferences)!==JSON.stringify(preferences)))return;
    forgetContinuityContext();
    const state=conversation.continuitySnapshot;if(!state||!persistenceContext)return;
    setAppliedContinuityPreferences(preferences);
    continuityContextRef.current.capture(persistenceContext.ownerId,state,Boolean(preferences),true);
    continuityContextRef.current.stageResume(conversation.getSnapshot().messages);
    setCart([]);setServices([]);setPlatformQuery(null);setLastMarketplaceQuery('');setCompareMode(false);setRequestState('idle');setRequestReference('');
    setTravellerCount(trip.adults + trip.children);
    setRequestedFor('');
    const summary = [trip.families.join(' '), trip.destination, trip.origin ? `from ${trip.origin}` : '',
      trip.startDate ?? '', trip.endDate ?? '', `${trip.adults} adults`, `${trip.children} children`, `${trip.rooms} rooms`,
      trip.budget ? `${trip.budget} ${trip.currency}` : trip.currency,
      preferences ? `${preferences.travelClass}; ${preferences.lodgingStyle}; ${preferences.itineraryPace}` : ''];
    const draft=summary.filter(Boolean).join(' ');continuityContextRef.current.draft=draft;setContinuityDraft(draft);
  }

  return (
    <main className="dabra-experience" dir={direction} lang={language}>
      {conversationState.allowance && <p role="status">{successfulTaskAllowanceText(conversationState.allowance, language)}</p>}
      {conversationState.error && <p role="status">{conversationState.error}</p>}
      <header className="dabra-topbar">
        <div className="dabra-identity">
          <div className="dabra-avatar" aria-hidden="true">{language === 'ar' ? 'د' : 'D'}</div>
          <div>
            <div className="dabra-name">{t.name} <span className="dabra-online" aria-label={t.online} /></div>
            <p>{t.subtitle}</p>
          </div>
        </div>
        <div className="dabra-top-actions">
          <button type="button" className="dabra-icon-button" aria-label={t.settings} onClick={() => setShowSettings((value) => !value)}><FiSliders /></button>
        </div>
      </header>

      <DabraFamilySafetyPanel />

      {identityResolved && persistenceContext?.ownerId.startsWith('user:') &&
        <DabraContinuity key={persistenceContext.ownerId} ownerId={persistenceContext.ownerId} language={language}
          onResume={resumeContinuityTrip} onApply={applyContinuityPreferences} onForget={forgetContinuityContext} onState={observeContinuityState} />}

      <CollaborativeTripCapabilities phase="planning" />

      <div className="dabra-layout">
        <section className="dabra-conversation" aria-label={t.conversation}>
          <div className="dabra-conversation-heading">
            <div><span className="dabra-kicker">{t.kicker}</span><h1>{t.heading}</h1></div>
            <span className="dabra-session"><FiClock /> {t.session}</span>
          </div>
          <div className="dabra-stream" aria-live="polite" aria-busy={chatInFlight} ref={streamRef}>
            {messages.map((message) => (
              <div key={message.id} className={cn('dabra-message', message.role === 'user' ? 'dabra-message-user' : 'dabra-message-assistant')}>
                {message.role === 'assistant' && <span className="dabra-mini-avatar" aria-hidden="true">{language === 'ar' ? 'د' : 'D'}</span>}
                <p>{message.role === 'assistant' ? <PlatformAnswer text={message.text} /> : message.text}</p>
              </div>
            ))}
          </div>

          <div className={cn('dabra-voice-panel', `dabra-voice-${voiceStatus}`)}>
            <div className="dabra-waveform" aria-hidden="true">{Array.from({ length: 19 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 17) % 38)}%` }} />)}</div>
            <div className="dabra-voice-copy"><strong>{t.status[voiceStatus]}</strong><span>{voiceStatus === 'idle' ? t.voiceHint.idle : voiceStatus === 'error' ? t.voiceHint.error : t.voiceHint.active}</span></div>
            <div className="dabra-voice-actions">
              <button type="button" className="dabra-voice-toggle" disabled={chatInFlight} onClick={toggleVoice} aria-label={voiceStatus === 'listening' ? t.stopListening : t.talk}>{voiceStatus === 'listening' ? <FiMicOff /> : <FiMic />}<span>{t.talk}</span></button>
              <button type="button" className="dabra-voice-toggle" disabled={chatInFlight || !approvedVoiceAvailable || !latestAssistantText} onClick={() => void playApprovedVoice()} aria-label={voicePlaybackStatus === 'loading' ? approvedPlaybackCopy.loading : voicePlaybackStatus === 'playing' ? approvedPlaybackCopy.stop : approvedPlaybackCopy.play}>{voicePlaybackStatus === 'playing' ? <FiStopCircle /> : <FiVolume2 />}<span>{voicePlaybackStatus === 'loading' ? approvedPlaybackCopy.loading : voicePlaybackStatus === 'playing' ? approvedPlaybackCopy.stop : approvedPlaybackCopy.play}</span></button>
            </div>
            {approvedVoiceAvailable === false && <div className="dabra-approved-voice-unavailable" role="status" data-approved-voice-sha={DABRA_APPROVED_VOICE.sha256}><strong>{approvedVoiceCopy.title}</strong><span>{approvedVoiceCopy.detail}</span></div>}
            {voicePlaybackStatus === 'error' && <div className="dabra-approved-voice-unavailable" role="alert"><span>{approvedPlaybackCopy.error}</span></div>}
            {voicePlaybackPartial && <div className="dabra-approved-voice-unavailable" role="status"><span>{approvedPlaybackCopy.partial}</span></div>}
          </div>

          <div className="dabra-composer">
            <input ref={attachmentRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => handleAttachments(event.target.files)} />
            <button type="button" className="dabra-composer-icon" aria-label={t.attach} disabled={!identityResolved} onClick={() => attachmentRef.current?.click()}><FiPaperclip /></button>
            <button type="button" className="dabra-composer-icon" aria-label={t.enableVoice} disabled={!identityResolved || chatInFlight} onClick={toggleVoice}><FiMic /></button>
            <input value={input} disabled={!identityResolved} maxLength={500} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void sendMessage(); }} placeholder={identityResolved ? t.placeholder : t.securePlaceholder} aria-label={t.messageLabel} />
            <button type="button" className="dabra-send" aria-label={t.send} onClick={() => void sendMessage()} disabled={!identityResolved || (!input.trim() && !continuityDraft && !attachments.length) || chatInFlight}><FiSend /></button>
          </div>
          {continuityDraft&&<p role="status">{language==='ar'?'نية الرحلة المحفوظة، بانتظار تأكيد الإرسال:':'Saved trip intent, awaiting your confirmation to send:'} {continuityDraft}</p>}
          {attachments.length > 0 && <div className="dabra-attachment-list" aria-label={t.selectedAttachments}>{attachments.map((item) => <div className={cn('dabra-attachment-status', item.status === 'error' && 'is-error')} key={item.id}><span>{item.safeName} · {(item.file.size / 1024 / 1024).toFixed(1)} MB · {item.status === 'uploading' ? t.uploading : item.status === 'error' ? item.error : t.ready}</span><button type="button" disabled={chatInFlight} onClick={() => removeAttachment(item.id)} aria-label={`${t.remove} ${item.safeName}`}><FiX /></button></div>)}</div>}
          {attachmentError && <div className="dabra-attachment-status is-error" role="alert">{attachmentError}</div>}
          <div className="dabra-quick-actions" aria-label={t.quick}>{quickActionIds.map((action, index) => <button type="button" key={action} disabled={!identityResolved || chatInFlight} onClick={() => applyQuickAction(action)}>{t.quickActions[index]}</button>)}</div>
        </section>

        <section className="dabra-results" aria-label={t.results}>
          <div className="dabra-results-header"><div><span className="dabra-kicker">{t.market}</span><h2>{t.options}</h2></div><button type="button" className="dabra-cart-button" onClick={() => setShowCart(true)} aria-label={t.openBag}><FiShoppingBag /><b>{cart.length}</b></button></div>
          <div className="dabra-tabs" role="tablist" aria-label={t.marketSections}>{tabValues.map((value, index) => <button type="button" role="tab" aria-selected={activeTab === value} className={cn(activeTab === value && 'active')} key={t.tabs[index]} onClick={() => { setActiveTab(value); void searchMarketplace(marketplaceQuery, value, false, true); }}>{t.tabs[index]}</button>)}</div>
          <form className="dabra-marketplace-search" onSubmit={(event) => { event.preventDefault(); void searchMarketplace(marketplaceQuery); }}><label className="sr-only" htmlFor="dabra-marketplace-query">{t.searchMarket}</label><input id="dabra-marketplace-query" value={marketplaceQuery} onChange={(event) => setMarketplaceQuery(event.target.value)} placeholder={t.searchPlaceholder} maxLength={200} /><button type="submit" disabled={!marketplaceQuery.trim() && !activeTab} aria-label={t.search}><FiSearch /></button></form>
          {marketNotice && <p className="dabra-muted" role="status">{marketNotice}</p>}
          {!platformQuery && <div className="dabra-filter-row"><button type="button" aria-pressed={availabilityOnly} onClick={() => setAvailabilityOnly((value) => !value)}><FiSliders /> {t.availableOnly}</button><button type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((value) => !value)}><FiHeart /> {t.saved}</button><label><span className="sr-only">{t.sort}</span><select value={resultSort} onChange={(event) => setResultSort(event.target.value as DabraResultSort)}><option value="recommended">{t.sortOptions[0]}</option><option value="price-low">{t.sortOptions[1]}</option><option value="price-high">{t.sortOptions[2]}</option><option value="comfort">{t.sortOptions[3]}</option><option value="closest">{t.sortOptions[4]}</option></select><FiChevronDown aria-hidden="true" /></label><button type="button" onClick={() => setCompareMode((value) => !value)}>{compareMode ? t.endCompare : t.compare}</button></div>}

          {(resultSort === 'price-low' || resultSort === 'price-high') && visiblePriceCurrencies.size > 1 && <p className="dabra-muted">{language === 'ar' ? 'الأسعار مرتبة داخل كل عملة، وليست مقارنة بين العملات.' : 'Prices are sorted within each currency, not compared across currencies.'}</p>}
          {loading && <div className="dabra-state"><span className="dabra-spinner" /><p>{t.loading}</p></div>}
          {!loading && resultState === 'empty' && <div className="dabra-state"><FiMapPin /><p>{t.empty}</p></div>}
          {!loading && resultState === 'error' && <div className="dabra-state"><FiX /><p>{t.marketError}</p></div>}
          {!loading && !platformQuery && resultState === 'idle' && services.length === 0 && <div className="dabra-state dabra-state-welcome"><FiArrowLeft /><p>{t.marketWelcome}</p></div>}

          {!loading && platformQuery && <PlatformResults request={platformQuery.request} family={platformQuery.family} language={language} currencyPolicy={platformQuery.currencyPolicy} />}
          {!loading && recommendationDecisions.length > 0 && <div className="dabra-recommendations"><div className="dabra-section-label">{t.recommendation}</div>{recommendationDecisions.map(({ service, badge, why }) => <ProductCard key={service.id} language={language} service={service} pricePolicy={pricePolicy} badge={badge} why={why} inCart={cart.some((item) => item.id === service.id)} favorite={favorites.includes(service.id)} onCart={() => toggleCart(service)} onFavorite={() => toggleFavorite(service.id)} compare={compareMode} />)}</div>}
          {compareMode && comparisonServices.length > 1 && <ComparisonTable language={language} services={comparisonServices} pricePolicy={pricePolicy} />}
          {alternatives.length > 0 && <div className="dabra-other-results"><div className="dabra-section-label">{t.alternatives}</div>{alternatives.map((service) => <ProductCard key={service.id} language={language} service={service} pricePolicy={pricePolicy} catalogOnly={!recommendationEligible(service)} inCart={cart.some((item) => item.id === service.id)} favorite={favorites.includes(service.id)} onCart={() => toggleCart(service)} onFavorite={() => toggleFavorite(service.id)} compare={compareMode} />)}</div>}
        </section>
      </div>

      {showSettings && <div className="dabra-settings" role="dialog" aria-label={t.settings}><button type="button" onClick={() => setShowSettings(false)} aria-label={language === 'ar' ? 'إغلاق' : 'Close'}><FiX /></button><strong>{language === 'ar' ? 'إعدادات المحادثة' : 'Conversation settings'}</strong><label><input type="checkbox" defaultChecked /> {language === 'ar' ? 'اقتراحات مختصرة' : 'Concise suggestions'}</label><label><input type="checkbox" defaultChecked /> {language === 'ar' ? 'تنبيه عند تغيّر الحالة' : 'Status change alerts'}</label></div>}
      {showCart && <div className="dabra-cart-drawer" role="dialog" aria-modal="true" aria-label={language === 'ar' ? 'حقيبة الرحلة' : 'Trip bag'}><button type="button" className="dabra-drawer-close" onClick={() => setShowCart(false)} aria-label={language === 'ar' ? 'إغلاق الحقيبة' : 'Close trip bag'}><FiX /></button><span className="dabra-kicker">{language === 'ar' ? 'بناء الرحلة' : 'Build your trip'}</span><h2>{language === 'ar' ? 'حقيبتك' : 'Your bag'}</h2>{cart.length === 0 ? <p className="dabra-muted">{language === 'ar' ? 'ما اخترت شيئًا بعد. نضيف الخيارات اللي تعجبك هنا.' : 'You have not selected anything yet. Your chosen options will appear here.'}</p> : <>{cart.map((item, index) => <div className="dabra-cart-item" key={item.id}><div><strong>{item.name_ar}</strong><span>{item.categoryLabel}</span></div><b><DabraPriceValue price={cartPrices[index]} language={language} /></b><button type="button" className="dabra-drawer-close" onClick={() => setCart((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`${t.remove} ${item.name_ar}`}><FiX /></button><div className="dabra-request-fields"><label>{t.requestDate}<input type="datetime-local" value={requestedFor} onChange={(event) => { setRequestedFor(event.target.value); setRequestState('idle'); }} /></label><label>{t.travellers}<input type="number" min="1" max="99" value={travellerCount} onChange={(event) => { setTravellerCount(Number(event.target.value)); setRequestState('idle'); }} /></label><button type="button" disabled={!requestedFor || requestState === 'sending' || requestState === 'submitted'} onClick={() => void submitMarketplaceRequest(item)}>{requestState === 'sending' ? t.requestSending : t.continueRequest}</button></div></div>)}<div className="dabra-cart-total"><span>{language === 'ar' ? 'الإجمالي المعروف' : 'Known total'}</span><strong>{cartTotals.kind === 'total' ? `${cartTotals.amount} ${cartTotals.currency}` : cartTotals.kind === 'mixed' ? (language === 'ar' ? 'المبالغ مجمعة حسب العملة' : 'Totals grouped by currency') : (language === 'ar' ? 'الإجمالي غير متاح حتى تتوفر الأسعار' : 'Total unavailable until prices are available')}</strong></div>{requestState === 'submitted' && <p className="dabra-request-result" role="status">{t.requestSuccess} <strong>{requestReference}</strong></p>}{requestState === 'error' && <p className="dabra-request-result is-error" role="alert">{t.requestError}</p>}{cartTotals.kind === 'mixed' && <div className="dabra-cart-groups">{cartTotals.groups.map((group) => <span key={group.currency}>{group.amount} {group.currency}</span>)}</div>}<p className="dabra-muted">{language === 'ar' ? 'الضرائب والرسوم تظهر عند توفرها. التوفير لا يظهر إلا إذا كان موثقًا من المزود. ما راح نخفي أي تكلفة.' : 'Taxes and fees appear when available. Savings are shown only when verified by the provider. No known cost is hidden.'}</p></>}<div className="dabra-missing-components"><strong>{language === 'ar' ? 'المكونات الناقصة' : 'Missing components'}</strong><span>{missingComponents.length ? (language === 'ar' ? missingComponents : missingComponents.map((item) => ({ الرحلة: 'flight', السكن: 'stay', السيارة: 'car' })[item] ?? item)).join(language === 'ar' ? '، ' : ', ') : language === 'ar' ? 'الرحلة الأساسية مكتملة' : 'Core trip is complete'}</span></div>{lastMarketplaceQuery && <p className="dabra-muted">{language === 'ar' ? 'آخر بحث محفوظ في الجلسة الحالية:' : 'Latest search saved in this session:'} {lastMarketplaceQuery}</p>}</div>}
    </main>
  );
}

function localizedWhy(why: string, language: 'ar' | 'en') {
  if (language === 'ar') return why;
  if (why.includes('أقل سعر')) return 'Lowest known price among the remaining eligible options';
  if (why.includes('مميزة أو فاخرة')) return 'Classified as a premium or luxury experience in marketplace data';
  return 'Matches verified marketplace recommendation signals';
}

function DabraPriceValue({ price, language }: { price: DabraDisplayPrice; language: 'ar' | 'en' }) {
  if (price.kind === 'on_request') return <span>{language === 'ar' ? 'حسب الطلب' : 'On request'}</span>;
  if (price.kind === 'unavailable') return <span>{language === 'ar' ? 'السعر بعملة مقبولة غير متاح حالياً' : 'Price in an accepted currency is unavailable'}</span>;
  return <span><bdi>{price.amount.toLocaleString(language === 'ar' ? 'ar-EG' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {price.currency}</bdi>{price.converted && <small>{price.asOf ? (language === 'ar' ? ` تحويل للعرض بتاريخ ${price.asOf}` : ` Display conversion as of ${price.asOf}`) : (language === 'ar' ? ' تحويل عند جلب النتائج' : ' Conversion at retrieval')}</small>}{price.sourceFallback && <small>{language === 'ar' ? ' تعذر التحويل؛ السعر بعملة المصدر' : ' Conversion unavailable; source currency shown'}</small>}</span>;
}

function ComparisonTable({ services, language, pricePolicy }: { services: MarketplaceService[]; language: 'ar' | 'en'; pricePolicy: DabraPricePolicy }) {
  return <div className="dabra-comparison" role="region" aria-label={language === 'ar' ? 'مقارنة الخيارات المحددة' : 'Compare selected options'}><div className="dabra-section-label">{language === 'ar' ? 'مقارنة الخيارات المحددة' : 'Selected options comparison'}</div><div className="dabra-comparison-scroll"><table><thead><tr><th scope="col">{language === 'ar' ? 'المعيار' : 'Criterion'}</th>{services.map((service) => <th scope="col" key={service.id}>{language === 'en' ? service.name_en ?? service.name_ar : service.name_ar}</th>)}</tr></thead><tbody><tr><th scope="row">{language === 'ar' ? 'السعر' : 'Price'}</th>{services.map((service) => <td key={service.id}><DabraPriceValue price={presentDabraPrice(service, pricePolicy)} language={language} /></td>)}</tr><tr><th scope="row">{language === 'ar' ? 'التوفر' : 'Availability'}</th>{services.map((service) => <td key={service.id}>{service.availability === 'available' ? (language === 'ar' ? 'متاح' : 'Available') : service.availability === 'limited' ? (language === 'ar' ? 'محدود' : 'Limited') : (language === 'ar' ? 'غير متاح' : 'Unavailable')}</td>)}</tr></tbody></table></div></div>;
}

function ProductCard({ service, badge, why, catalogOnly = false, inCart, favorite, onCart, onFavorite, compare, language, pricePolicy }: { service: MarketplaceService; badge?: string; why?: string; catalogOnly?: boolean; inCart: boolean; favorite: boolean; onCart: () => void; onFavorite: () => void; compare: boolean; language: 'ar' | 'en'; pricePolicy: DabraPricePolicy }) {
  const [whatsAppBlocked, setWhatsAppBlocked] = useState(false);
  const publicTitle = language === 'en' ? service.name_en ?? service.name_ar : service.name_ar;
  const whatsApp = buildDabraWhatsAppHandoff({
    language,
    family: service.family,
    publicTitle,
    city: service.destination,
    transactionState: service.transactionMethod === 'none'
      ? 'unavailable'
      : service.transactionMethod ?? (catalogOnly ? 'unavailable' : undefined),
  });

  function openWhatsApp() {
    if (!whatsApp.href) {
      setWhatsAppBlocked(true);
      return;
    }
    setWhatsAppBlocked(openDabraWhatsAppHandoff(whatsApp.href) === 'blocked');
  }

  return <article className={cn('dabra-product-card', compare && 'dabra-product-card-compare', catalogOnly && 'dabra-product-card-catalog')}>
    <div className="dabra-product-top"><span className="dabra-product-family">{service.categoryLabel}</span><button type="button" className={cn('dabra-favorite', favorite && 'selected')} onClick={onFavorite} aria-label={favorite ? (language === 'ar' ? 'إزالة من المحفوظات' : 'Remove from saved') : (language === 'ar' ? 'حفظ الخيار' : 'Save option')}><FiHeart /></button></div>
    {catalogOnly && <span className="dabra-catalog-notice">{language === 'ar' ? 'محتوى استكشافي — التوفر غير موثّق' : 'Discovery content — availability is not verified'}</span>}
    {badge && <span className="dabra-recommendation-badge"><FiCheck /> {badge}</span>}
    <h3>{language === 'en' ? service.name_en ?? service.name_ar : service.name_ar}</h3><p className="dabra-product-description">{language === 'en' ? service.description_en ?? service.description_ar : service.description_ar}</p>
    {why && <p className="dabra-why"><span>{language === 'ar' ? 'رأي الدبرة' : 'DABRA’s view'}</span>{localizedWhy(why, language)}</p>}
    <div className="dabra-product-facts"><span><FiMapPin /> {service.destination}</span><span><FiClock /> {service.productCount === 0 ? (language === 'ar' ? '0 خيار — التوفر غير مؤكد' : '0 options — availability unverified') : `${service.productCount} ${language === 'ar' ? 'خيار' : 'options'}`}</span></div>
    <div className="dabra-product-bottom"><div><small>{language === 'ar' ? 'الإجمالي المعروف من' : 'Known total from'}</small><strong><DabraPriceValue price={presentDabraPrice(service, pricePolicy)} language={language} /></strong></div><div className="dabra-product-actions">{!catalogOnly && <button type="button" onClick={onCart} className={cn('dabra-add-button', inCart && 'added')} aria-label={inCart ? (language === 'ar' ? 'إزالة من حقيبة الرحلة' : 'Remove from trip bag') : (language === 'ar' ? 'إضافة إلى حقيبة الرحلة' : 'Add to trip bag')}>{inCart ? <FiCheck /> : <FiShoppingBag />}</button>}<button type="button" className="dabra-whatsapp-button" onClick={openWhatsApp} aria-label={language === 'ar' ? `متابعة ${publicTitle} عبر واتساب` : `Continue ${publicTitle} on WhatsApp`}><FiMessageCircle /> {language === 'ar' ? 'واتساب' : 'WhatsApp'}</button><a href={service.href}>{language === 'ar' ? 'التفاصيل' : 'Details'} <FiArrowLeft /></a></div></div>
    {whatsAppBlocked && <p className="dabra-whatsapp-error" role="alert">{language === 'ar' ? 'تعذر فتح واتساب. لم تُرسل أي رسالة.' : 'WhatsApp could not be opened. No message was sent.'}</p>}
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
    abort?(): void;
  }
}

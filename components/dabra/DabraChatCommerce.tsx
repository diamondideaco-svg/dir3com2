'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowLeft, FiCheck, FiChevronDown, FiClock, FiHeart, FiMapPin, FiMic, FiMicOff, FiPaperclip, FiSearch, FiSend, FiShoppingBag, FiSliders, FiVolume2, FiVolumeX, FiX } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import type { MarketplaceService } from '@/lib/marketplace/data';
import { supabase } from '@/lib/supabase/client';
import { consumeDabraChatResponse } from '@/lib/dabra/chat-response-contract';
import { normalizeDabraSpeechText } from '@/lib/dabra/speech-pronunciation';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { DABRA_LOCALE_ERROR } from '@/lib/dabra/locale-contract';
import {
  createDabraWelcomeMessage,
  DABRA_WELCOME_COPY,
  localizePersistedDabraWelcome,
} from '@/lib/dabra/welcome-locale';
import {
  DABRA_ANONYMOUS_SESSION_KEY,
  applyScopedHotelChange,
  anonymousOwnerId,
  buildDabraRecommendations,
  calculateCartTotals,
  createPersisted,
  missingTripComponents,
  persistenceContextForIdentity,
  readPersisted,
  recommendationEligible,
  sortDabraResults,
  storageKey,
  validatePersistedCart,
  validatePersistedFavorites,
  validatePersistedMessages,
  type DabraCartItem,
  type DabraPersistenceContext,
  type DabraResultSort,
} from '@/lib/dabra/travel-commerce-state';

type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'muted' | 'error';
type Message = { id: string; role: 'user' | 'assistant'; text: string };
type DabraAttachment = { id: string; file: File; safeName: string; status: 'selected' | 'uploading' | 'error'; error?: string };
type CartItem = DabraCartItem;
type PersistenceContext = DabraPersistenceContext;

const quickActionIds = ['compare', 'cheapest', 'comfort', 'nonstop', 'closest', 'highest', 'date', 'alternatives', 'shortlist', 'choose'] as const;
const tabValues = [undefined, 'airport-transfers', 'hotels', 'apartments', 'cars', 'offers'] as const;

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function safeAttachmentName(name: string) {
  return name.replace(/[\\/\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'attachment';
}

const dabraCopy = {
  ar: {
    name: 'الدبرة', subtitle: 'مساعد السفر الذكي والحارس السياحي', online: 'متاحة الآن', settings: 'الإعدادات', conversation: 'محادثة الدبرة', kicker: 'رحلتك، على رواق', heading: 'خلنا نرتبها سوا.', session: 'جلسة جديدة',
    welcome: DABRA_WELCOME_COPY.ar, attachmentPrompt: 'راجع المرفقات المضافة وساعدني في تخطيط الرحلة.', attachmentSendError: 'تعذر الإرسال. حاول مرة أخرى.', attachmentLimit: `يمكن إضافة ${MAX_ATTACHMENTS} مرفقات كحد أقصى.`, attachmentUnsupported: 'المرفق غير مدعوم. استخدم PDF أو JPEG أو PNG أو WebP بحجم لا يتجاوز 8 MB.',
    status: { idle: 'جاهز أسمعك', listening: 'أسمعك الآن', processing: 'أرتب طلبك...', speaking: 'الدبرة يتحدث', muted: 'الصوت مكتوم', error: 'تعذر تشغيل الصوت' },
    voiceHint: { idle: 'الميكروفون يعمل فقط عندما تبدأ وضع الصوت', error: 'جرّب الكتابة بدلًا من الصوت', active: 'تقدر توقفني أو تقاطعني بأي وقت' }, voiceOn: 'تشغيل صوت الدبرة', voiceOff: 'كتم صوت الدبرة', stopListening: 'إيقاف الاستماع', talk: 'تحدث مع الدبرة', attach: 'إرفاق صورة أو ملف PDF', enableVoice: 'تفعيل الصوت', placeholder: 'قل للدبرة وش تحتاج...', securePlaceholder: 'نجهز جلستك الآمنة...', messageLabel: 'رسالة للدبرة', send: 'إرسال الرسالة', selectedAttachments: 'المرفقات المحددة', uploading: 'جارٍ الإرسال', ready: 'جاهز', remove: 'إزالة', quick: 'إجراءات سريعة',
    quickActions: ['قارن', 'أرخص', 'أريح', 'بدون توقف', 'أقرب', 'الأعلى سعرًا', 'غير التاريخ', 'شوف بدائل', 'اختصرها لي', 'اختاره لي'], tabs: ['الكل', 'طيران', 'فنادق', 'شقق', 'سيارات', 'باكدجات'], market: 'سوق الدبرة', options: 'خيارات تناسبك', results: 'نتائج السفر', openBag: 'فتح حقيبة الرحلة', marketSections: 'أقسام السوق', searchMarket: 'ابحث في السوق', searchPlaceholder: 'ابحث في سوق الدبرة', search: 'بحث', availableOnly: 'المتاح فقط', saved: 'المحفوظات', sort: 'ترتيب النتائج', sortOptions: ['الأفضل لك', 'السعر: الأقل', 'السعر: الأعلى', 'الأريح', 'الأقرب'], endCompare: 'إنهاء المقارنة', compare: 'قارن', loading: 'أبحث لك عن الخيارات المناسبة...', empty: 'ما لقيت خيارًا مطابقًا الآن. جرّب تغيير الوجهة أو التاريخ.', marketError: 'السوق غير متاح مؤقتًا. نقدر نكمل المحادثة بدون ما نفقد طلبك.', marketWelcome: 'اكتب وجهتك أو أولويتك، وأنا أجيب لك الخيارات الواضحة.', recommendation: 'ترشيح الدبرة', alternatives: 'بدائل ومحتوى استكشافي',
  },
  en: {
    name: 'DABRA', subtitle: 'Your intelligent travel assistant and trip guardian', online: 'Available now', settings: 'Settings', conversation: 'DABRA conversation', kicker: 'Your trip, at your pace', heading: 'Let’s arrange it together.', session: 'New session',
    welcome: DABRA_WELCOME_COPY.en, attachmentPrompt: 'Review the attached files and help me plan my trip.', attachmentSendError: 'Unable to send. Please try again.', attachmentLimit: `You can add up to ${MAX_ATTACHMENTS} attachments.`, attachmentUnsupported: 'Unsupported attachment. Use PDF, JPEG, PNG, or WebP up to 8 MB.',
    status: { idle: 'Ready to listen', listening: 'Listening now', processing: 'Arranging your request...', speaking: 'DABRA is speaking', muted: 'Voice muted', error: 'Voice unavailable' },
    voiceHint: { idle: 'The microphone activates only when you start voice mode', error: 'Try typing instead', active: 'You can stop or interrupt me at any time' }, voiceOn: 'Turn on DABRA voice', voiceOff: 'Mute DABRA voice', stopListening: 'Stop listening', talk: 'Talk to DABRA', attach: 'Attach an image or PDF', enableVoice: 'Enable voice', placeholder: 'Tell DABRA what you need...', securePlaceholder: 'Preparing your secure session...', messageLabel: 'Message DABRA', send: 'Send message', selectedAttachments: 'Selected attachments', uploading: 'Sending', ready: 'Ready', remove: 'Remove', quick: 'Quick actions',
    quickActions: ['Compare', 'Cheapest', 'Most comfortable', 'Nonstop', 'Closest', 'Highest price', 'Change date', 'Show alternatives', 'Shortlist', 'Choose for me'], tabs: ['All', 'Flights', 'Hotels', 'Apartments', 'Cars', 'Packages'], market: 'DABRA marketplace', options: 'Options for you', results: 'Travel results', openBag: 'Open trip bag', marketSections: 'Marketplace sections', searchMarket: 'Search marketplace', searchPlaceholder: 'Search DABRA marketplace', search: 'Search', availableOnly: 'Available only', saved: 'Saved', sort: 'Sort results', sortOptions: ['Recommended', 'Price: low to high', 'Price: high to low', 'Most comfortable', 'Closest'], endCompare: 'End comparison', compare: 'Compare', loading: 'Finding suitable options...', empty: 'No matching option is available right now. Try another destination or date.', marketError: 'The marketplace is temporarily unavailable. We can continue without losing your request.', marketWelcome: 'Enter your destination or priority and I’ll bring you clear options.', recommendation: 'DABRA recommendation', alternatives: 'Alternatives and discovery content',
  },
} as const;

function welcomeMessage(language: 'ar' | 'en'): Message { return createDabraWelcomeMessage(language); }

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function DabraChatCommerce() {
  const { language, direction } = useLanguage();
  const t = dabraCopy[language];
  const [messages, setMessages] = useState<Message[]>([welcomeMessage(language)]);
  const [input, setInput] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [activeTab, setActiveTab] = useState<string | undefined>();
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
  const [chatInFlight, setChatInFlight] = useState(false);
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
  const attachmentRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const identityRequestRef = useRef(0);
  const lifecycleRef = useRef(0);
  const chatInFlightRef = useRef(false);
  const chatAbortRef = useRef<AbortController | null>(null);
  const marketplaceRequestRef = useRef(0);
  const marketplaceAbortRef = useRef<AbortController | null>(null);
  const voiceGenerationRef = useRef(0);
  const voiceMutedRef = useRef(false);
  const languageRef = useRef(language);
  const previousLanguageRef = useRef(language);
  languageRef.current = language;

  useEffect(() => {
    if (previousLanguageRef.current === language) return;
    previousLanguageRef.current = language;
    invalidateActiveRequests();
    setMessages([welcomeMessage(language)]);
    setInput('');
    setAttachments([]);
    setAttachmentError('');
    setVoiceStatus(voiceMutedRef.current ? 'muted' : 'idle');
  // The locale boundary intentionally starts a fresh visible/chat history so an old-locale turn cannot leak into the next answer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  function stopVoiceResources(cancelSpeech = true) {
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
    if (cancelSpeech) window.speechSynthesis?.cancel();
  }

  function invalidateActiveRequests() {
    lifecycleRef.current += 1;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    chatInFlightRef.current = false;
    setChatInFlight(false);
    marketplaceRequestRef.current += 1;
    marketplaceAbortRef.current?.abort();
    marketplaceAbortRef.current = null;
    setLoading(false);
    stopVoiceResources();
  }

  useEffect(() => {
    let active = true;
    function detachSensitiveState() {
      invalidateActiveRequests();
      setStorageHydrated(false);
      setPersistenceContext(null);
      setIdentityResolved(false);
      setMessages([welcomeMessage(languageRef.current)]);
      setCart([]);
      setFavorites([]);
      setInput('');
      setAttachments([]);
      setAttachmentError('');
      if (attachmentRef.current) attachmentRef.current.value = '';
    }
    async function resolveValidatedIdentity() {
      const requestId = ++identityRequestRef.current;
      detachSensitiveState();
      try {
        const response = await fetch('/api/dabra/session-identity', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(8_000) });
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') return;
      identityRequestRef.current += 1;
      detachSensitiveState();
      window.setTimeout(() => { if (active) void resolveValidatedIdentity(); }, 0);
    });
    return () => { active = false; identityRequestRef.current += 1; invalidateActiveRequests(); subscription.unsubscribe(); };
  // Identity resolution subscribes exactly once; request/resource invalidation is ref-based and always observes current resources.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!identityResolved) return;
    if (!persistenceContext) {
      const reset = window.setTimeout(() => {
        setMessages([welcomeMessage(languageRef.current)]);
        setCart([]);
        setFavorites([]);
        setStorageHydrated(false);
      }, 0);
      return () => window.clearTimeout(reset);
    }
    const hydrate = window.setTimeout(() => {
      const storage = persistenceContext.storage === 'local' ? window.localStorage : window.sessionStorage;
      const { ownerId } = persistenceContext;
      const restoredMessages = readPersisted(storage.getItem(storageKey(ownerId, 'context')), ownerId, validatePersistedMessages);
      setMessages(restoredMessages
        ? localizePersistedDabraWelcome(restoredMessages, languageRef.current)
        : [welcomeMessage(languageRef.current)]);
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

  const visibleServices = useMemo(() => sortDabraResults(services
    .filter((service) => !availabilityOnly || service.availability === 'available')
    .filter((service) => !favoritesOnly || favorites.includes(service.id))
    .filter((service) => !nonstopOnly || service.tags.some((tag) => /(?:بدون توقف|مباشر|nonstop|direct)/iu.test(tag))), resultSort).slice(0, resultLimit), [availabilityOnly, favorites, favoritesOnly, nonstopOnly, resultLimit, resultSort, services]);
  const recommendationDecisions = useMemo(() => buildDabraRecommendations(visibleServices), [visibleServices]);
  const recommendations = useMemo(() => recommendationDecisions.map(({ service }) => service), [recommendationDecisions]);
  const alternatives = useMemo(() => {
    const recommendedIds = new Set(recommendations.map((service) => service.id));
    return visibleServices.filter((service) => !recommendedIds.has(service.id));
  }, [recommendations, visibleServices]);
  const cartTotals = useMemo(() => calculateCartTotals(cart), [cart]);
  const missingComponents = useMemo(() => missingTripComponents(cart), [cart]);

  useEffect(() => {
    if (lastMarketplaceQuery) void searchMarketplace(lastMarketplaceQuery);
    // Category changes intentionally refresh the current result set without restarting chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function searchMarketplace(message: string) {
    const normalizedQuery = message.trim();
    if (!normalizedQuery) return;
    const requestId = ++marketplaceRequestRef.current;
    marketplaceAbortRef.current?.abort();
    const controller = new AbortController();
    marketplaceAbortRef.current = controller;
    setLastMarketplaceQuery(normalizedQuery);
    setLoading(true);
    setResultState('idle');
    try {
      const params = new URLSearchParams({ query: normalizedQuery, pageSize: '12' });
      if (activeTab) params.set('category', activeTab);
      const response = await fetch(`/api/services?${params.toString()}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('marketplace');
      const payload = (await response.json()) as { services?: MarketplaceService[] };
      if (requestId !== marketplaceRequestRef.current) return;
      const nextServices = payload.services ?? [];
      setServices(nextServices);
      setResultState(nextServices.length ? 'idle' : 'empty');
    } catch {
      if (controller.signal.aborted || requestId !== marketplaceRequestRef.current) return;
      setServices([]);
      setResultState('error');
    } finally {
      if (requestId === marketplaceRequestRef.current) {
        marketplaceAbortRef.current = null;
        setLoading(false);
      }
    }
  }

  async function sendMessage(text = input) {
    const message = text.trim() || (attachments.length ? t.attachmentPrompt : '');
    if (!message || chatInFlightRef.current || !identityResolved) return;
    chatInFlightRef.current = true;
    setChatInFlight(true);
    const lifecycle = lifecycleRef.current;
    const marketplaceGeneration = marketplaceRequestRef.current;
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const pendingAttachments = attachments;
    setInput('');
    setAttachments((current) => current.map((item) => ({ ...item, status: 'uploading', error: undefined })));
    setAttachmentError('');
    setCart((current) => applyScopedHotelChange(current, message));
    const assistantId = makeId();
    setMessages((current) => [...current, { id: makeId(), role: 'user', text: message }, { id: assistantId, role: 'assistant', text: '' }]);
    setVoiceStatus('processing');
    try {
      const form = new FormData();
      form.set('message', message);
      form.set('history', JSON.stringify(messages.map(({ role, text: content }) => ({ role, content }))));
      form.set('stream', 'true');
      form.set('locale', language);
      for (const item of pendingAttachments) form.append('attachment', item.file, item.safeName);
      const response = await fetch('/api/ai2/chat', {
        method: 'POST',
        headers: { Accept: 'text/plain' },
        body: form,
        signal: controller.signal,
      });
      const answer = await consumeDabraChatResponse(response, (visibleAnswer) => {
        if (lifecycle !== lifecycleRef.current || controller.signal.aborted) return;
        setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, text: visibleAnswer } : item));
      }, DABRA_LOCALE_ERROR[language]);
      if (lifecycle !== lifecycleRef.current || controller.signal.aborted) return;
      setAttachments([]);
      if (attachmentRef.current) attachmentRef.current.value = '';
      if (!voiceMutedRef.current && 'speechSynthesis' in window) {
        const voiceGeneration = ++voiceGenerationRef.current;
        const speechLocale = language === 'ar' ? 'ar-SA' : 'en-US';
        const utterance = new SpeechSynthesisUtterance(normalizeDabraSpeechText(answer, speechLocale));
        utterance.lang = speechLocale;
        utterance.onstart = () => { if (voiceGeneration === voiceGenerationRef.current && lifecycle === lifecycleRef.current && !voiceMutedRef.current) setVoiceStatus('speaking'); };
        utterance.onend = () => { if (voiceGeneration === voiceGenerationRef.current && lifecycle === lifecycleRef.current) setVoiceStatus('idle'); };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      if (lifecycle !== lifecycleRef.current || controller.signal.aborted) return;
      setAttachments((current) => current.map((item) => ({ ...item, status: 'error', error: t.attachmentSendError })));
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, text: DABRA_LOCALE_ERROR[language] } : item));
    } finally {
      if (lifecycle === lifecycleRef.current) {
        chatAbortRef.current = null;
        chatInFlightRef.current = false;
        setChatInFlight(false);
        setVoiceStatus((current) => current === 'speaking' ? current : voiceMutedRef.current ? 'muted' : 'idle');
        if (!controller.signal.aborted && marketplaceGeneration === marketplaceRequestRef.current) void searchMarketplace(message);
      }
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
    if (chatInFlightRef.current) return;
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

  function toggleMute() {
    const nextMuted = !voiceMuted;
    voiceMutedRef.current = nextMuted;
    setVoiceMuted(nextMuted);
    stopVoiceResources();
    setVoiceStatus(nextMuted ? 'muted' : 'idle');
  }

  function toggleVoice() {
    if (voiceStatus === 'speaking') {
      window.speechSynthesis?.cancel();
      setVoiceStatus('idle');
    }
    if (voiceStatus === 'listening') {
      stopVoiceResources(false);
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
    recognition.onerror = () => { if (voiceGeneration === voiceGenerationRef.current && lifecycle === lifecycleRef.current) { stopVoiceResources(false); setVoiceStatus('error'); } };
    recognition.onend = () => { if (voiceGeneration === voiceGenerationRef.current && lifecycle === lifecycleRef.current) { recognitionRef.current = null; setVoiceStatus((current) => current === 'listening' ? 'idle' : current); } };
    recognition.onresult = (event) => {
      if (voiceGeneration !== voiceGenerationRef.current || lifecycle !== lifecycleRef.current || chatInFlightRef.current) return;
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

  return (
    <main className="dabra-experience" dir={direction} lang={language}>
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
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          <div className={cn('dabra-voice-panel', `dabra-voice-${voiceStatus}`)}>
            <div className="dabra-waveform" aria-hidden="true">{Array.from({ length: 19 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 17) % 38)}%` }} />)}</div>
            <div className="dabra-voice-copy"><strong>{t.status[voiceStatus]}</strong><span>{voiceStatus === 'idle' ? t.voiceHint.idle : voiceStatus === 'error' ? t.voiceHint.error : t.voiceHint.active}</span></div>
            <div className="dabra-voice-actions"><button type="button" className="dabra-voice-mute" onClick={toggleMute} aria-pressed={voiceMuted} aria-label={voiceMuted ? t.voiceOn : t.voiceOff}>{voiceMuted ? <FiVolumeX /> : <FiVolume2 />}</button><button type="button" className="dabra-voice-toggle" disabled={chatInFlight} onClick={toggleVoice} aria-label={voiceStatus === 'listening' ? t.stopListening : t.talk}>{voiceStatus === 'listening' ? <FiMicOff /> : <FiMic />}<span>{t.talk}</span></button></div>
          </div>

          <div className="dabra-composer">
            <input ref={attachmentRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => handleAttachments(event.target.files)} />
            <button type="button" className="dabra-composer-icon" aria-label={t.attach} disabled={!identityResolved} onClick={() => attachmentRef.current?.click()}><FiPaperclip /></button>
            <button type="button" className="dabra-composer-icon" aria-label={t.enableVoice} disabled={!identityResolved || chatInFlight} onClick={toggleVoice}><FiVolume2 /></button>
            <input value={input} disabled={!identityResolved} maxLength={500} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void sendMessage(); }} placeholder={identityResolved ? t.placeholder : t.securePlaceholder} aria-label={t.messageLabel} />
            <button type="button" className="dabra-send" aria-label={t.send} onClick={() => void sendMessage()} disabled={!identityResolved || (!input.trim() && !attachments.length) || chatInFlight}><FiSend /></button>
          </div>
          {attachments.length > 0 && <div className="dabra-attachment-list" aria-label={t.selectedAttachments}>{attachments.map((item) => <div className={cn('dabra-attachment-status', item.status === 'error' && 'is-error')} key={item.id}><span>{item.safeName} · {(item.file.size / 1024 / 1024).toFixed(1)} MB · {item.status === 'uploading' ? t.uploading : item.status === 'error' ? item.error : t.ready}</span><button type="button" disabled={chatInFlight} onClick={() => removeAttachment(item.id)} aria-label={`${t.remove} ${item.safeName}`}><FiX /></button></div>)}</div>}
          {attachmentError && <div className="dabra-attachment-status is-error" role="alert">{attachmentError}</div>}
          <div className="dabra-quick-actions" aria-label={t.quick}>{quickActionIds.map((action, index) => <button type="button" key={action} disabled={!identityResolved || chatInFlight} onClick={() => applyQuickAction(action)}>{t.quickActions[index]}</button>)}</div>
        </section>

        <section className="dabra-results" aria-label={t.results}>
          <div className="dabra-results-header"><div><span className="dabra-kicker">{t.market}</span><h2>{t.options}</h2></div><button type="button" className="dabra-cart-button" onClick={() => setShowCart(true)} aria-label={t.openBag}><FiShoppingBag /><b>{cart.length}</b></button></div>
          <div className="dabra-tabs" role="tablist" aria-label={t.marketSections}>{tabValues.map((value, index) => <button type="button" role="tab" aria-selected={activeTab === value} className={cn(activeTab === value && 'active')} key={t.tabs[index]} onClick={() => setActiveTab(value)}>{t.tabs[index]}</button>)}</div>
          <form className="dabra-marketplace-search" onSubmit={(event) => { event.preventDefault(); void searchMarketplace(marketplaceQuery); }}><label className="sr-only" htmlFor="dabra-marketplace-query">{t.searchMarket}</label><input id="dabra-marketplace-query" value={marketplaceQuery} onChange={(event) => setMarketplaceQuery(event.target.value)} placeholder={t.searchPlaceholder} maxLength={200} /><button type="submit" disabled={!marketplaceQuery.trim()} aria-label={t.search}><FiSearch /></button></form>
          <div className="dabra-filter-row"><button type="button" aria-pressed={availabilityOnly} onClick={() => setAvailabilityOnly((value) => !value)}><FiSliders /> {t.availableOnly}</button><button type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((value) => !value)}><FiHeart /> {t.saved}</button><label><span className="sr-only">{t.sort}</span><select value={resultSort} onChange={(event) => setResultSort(event.target.value as DabraResultSort)}><option value="recommended">{t.sortOptions[0]}</option><option value="price-low">{t.sortOptions[1]}</option><option value="price-high">{t.sortOptions[2]}</option><option value="comfort">{t.sortOptions[3]}</option><option value="closest">{t.sortOptions[4]}</option></select><FiChevronDown aria-hidden="true" /></label><button type="button" onClick={() => setCompareMode((value) => !value)}>{compareMode ? t.endCompare : t.compare}</button></div>

          {loading && <div className="dabra-state"><span className="dabra-spinner" /><p>{t.loading}</p></div>}
          {!loading && resultState === 'empty' && <div className="dabra-state"><FiMapPin /><p>{t.empty}</p></div>}
          {!loading && resultState === 'error' && <div className="dabra-state"><FiX /><p>{t.marketError}</p></div>}
          {!loading && resultState === 'idle' && services.length === 0 && <div className="dabra-state dabra-state-welcome"><FiArrowLeft /><p>{t.marketWelcome}</p></div>}

          {!loading && recommendationDecisions.length > 0 && <div className="dabra-recommendations"><div className="dabra-section-label">{t.recommendation}</div>{recommendationDecisions.map(({ service, badge, why }) => <ProductCard key={service.id} language={language} service={service} badge={badge} why={why} inCart={cart.some((item) => item.id === service.id)} favorite={favorites.includes(service.id)} onCart={() => toggleCart(service)} onFavorite={() => toggleFavorite(service.id)} compare={compareMode} />)}</div>}
          {compareMode && recommendationDecisions.length > 1 && <ComparisonTable language={language} recommendations={recommendationDecisions} />}
          {alternatives.length > 0 && <div className="dabra-other-results"><div className="dabra-section-label">{t.alternatives}</div>{alternatives.map((service) => <ProductCard key={service.id} language={language} service={service} catalogOnly={!recommendationEligible(service)} inCart={cart.some((item) => item.id === service.id)} favorite={favorites.includes(service.id)} onCart={() => toggleCart(service)} onFavorite={() => toggleFavorite(service.id)} compare={compareMode} />)}</div>}
        </section>
      </div>

      {showSettings && <div className="dabra-settings" role="dialog" aria-label={t.settings}><button type="button" onClick={() => setShowSettings(false)} aria-label={language === 'ar' ? 'إغلاق' : 'Close'}><FiX /></button><strong>{language === 'ar' ? 'إعدادات المحادثة' : 'Conversation settings'}</strong><label><input type="checkbox" defaultChecked /> {language === 'ar' ? 'اقتراحات مختصرة' : 'Concise suggestions'}</label><label><input type="checkbox" defaultChecked /> {language === 'ar' ? 'تنبيه عند تغيّر الحالة' : 'Status change alerts'}</label></div>}
      {showCart && <div className="dabra-cart-drawer" role="dialog" aria-modal="true" aria-label={language === 'ar' ? 'حقيبة الرحلة' : 'Trip bag'}><button type="button" className="dabra-drawer-close" onClick={() => setShowCart(false)} aria-label={language === 'ar' ? 'إغلاق الحقيبة' : 'Close trip bag'}><FiX /></button><span className="dabra-kicker">{language === 'ar' ? 'بناء الرحلة' : 'Build your trip'}</span><h2>{language === 'ar' ? 'حقيبتك' : 'Your bag'}</h2>{cart.length === 0 ? <p className="dabra-muted">{language === 'ar' ? 'ما اخترت شيئًا بعد. نضيف الخيارات اللي تعجبك هنا.' : 'You have not selected anything yet. Your chosen options will appear here.'}</p> : <>{cart.map((item) => <div className="dabra-cart-item" key={item.id}><div><strong>{item.name_ar}</strong><span>{item.categoryLabel}</span></div><b>{item.basePrice || (language === 'ar' ? 'حسب الطلب' : 'On request')} {item.currency}</b><button type="button" className="dabra-drawer-close" onClick={() => setCart((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`${t.remove} ${item.name_ar}`}><FiX /></button></div>)}<div className="dabra-cart-total"><span>{language === 'ar' ? cartTotals.message : cartTotals.unified ? 'Known total' : 'Totals are grouped by currency'}</span><strong>{cartTotals.unified ? `${cartTotals.amount} ${cartTotals.currency}` : language === 'ar' ? 'غير موحّد' : 'Mixed currencies'}</strong></div>{!cartTotals.unified && <div className="dabra-cart-groups">{cartTotals.groups.map((group) => <span key={group.currency}>{group.amount} {group.currency}</span>)}</div>}<p className="dabra-muted">{language === 'ar' ? 'الضرائب والرسوم تظهر عند توفرها. التوفير لا يظهر إلا إذا كان موثقًا من المزود. ما راح نخفي أي تكلفة.' : 'Taxes and fees appear when available. Savings are shown only when verified by the provider. No known cost is hidden.'}</p></>}<div className="dabra-missing-components"><strong>{language === 'ar' ? 'المكونات الناقصة' : 'Missing components'}</strong><span>{missingComponents.length ? (language === 'ar' ? missingComponents : missingComponents.map((item) => ({ الرحلة: 'flight', السكن: 'stay', السيارة: 'car' })[item] ?? item)).join(language === 'ar' ? '، ' : ', ') : language === 'ar' ? 'الرحلة الأساسية مكتملة' : 'Core trip is complete'}</span></div>{lastMarketplaceQuery && <p className="dabra-muted">{language === 'ar' ? 'آخر بحث محفوظ في الجلسة الحالية:' : 'Latest search saved in this session:'} {lastMarketplaceQuery}</p>}</div>}
    </main>
  );
}

function localizedWhy(why: string, language: 'ar' | 'en') {
  if (language === 'ar') return why;
  if (why.includes('أقل سعر')) return 'Lowest known price among the remaining eligible options';
  if (why.includes('مميزة أو فاخرة')) return 'Classified as a premium or luxury experience in marketplace data';
  return 'Matches verified marketplace recommendation signals';
}

function ComparisonTable({ recommendations, language }: { recommendations: ReturnType<typeof buildDabraRecommendations>; language: 'ar' | 'en' }) {
  return <div className="dabra-comparison" role="region" aria-label={language === 'ar' ? 'مقارنة الخيارات' : 'Compare options'}><div className="dabra-section-label">{language === 'ar' ? 'مقارنة القرار' : 'Decision comparison'}</div><div className="dabra-comparison-scroll"><table><thead><tr><th scope="col">{language === 'ar' ? 'المعيار' : 'Criterion'}</th>{recommendations.map(({ service }) => <th scope="col" key={service.id}>{language === 'en' ? service.name_en ?? service.name_ar : service.name_ar}</th>)}</tr></thead><tbody><tr><th scope="row">{language === 'ar' ? 'السعر' : 'Price'}</th>{recommendations.map(({ service }) => <td key={service.id}>{service.basePrice || (language === 'ar' ? 'حسب الطلب' : 'On request')} {service.currency}</td>)}</tr><tr><th scope="row">{language === 'ar' ? 'التوفر' : 'Availability'}</th>{recommendations.map(({ service }) => <td key={service.id}>{service.availability === 'available' ? (language === 'ar' ? 'متاح' : 'Available') : service.availability === 'limited' ? (language === 'ar' ? 'محدود' : 'Limited') : (language === 'ar' ? 'غير متاح' : 'Unavailable')}</td>)}</tr><tr><th scope="row">{language === 'ar' ? 'سبب الترشيح' : 'Why recommended'}</th>{recommendations.map(({ service, why }) => <td key={service.id}>{localizedWhy(why, language)}</td>)}</tr></tbody></table></div></div>;
}

function ProductCard({ service, badge, why, catalogOnly = false, inCart, favorite, onCart, onFavorite, compare, language }: { service: MarketplaceService; badge?: string; why?: string; catalogOnly?: boolean; inCart: boolean; favorite: boolean; onCart: () => void; onFavorite: () => void; compare: boolean; language: 'ar' | 'en' }) {
  return <article className={cn('dabra-product-card', compare && 'dabra-product-card-compare', catalogOnly && 'dabra-product-card-catalog')}>
    <div className="dabra-product-top"><span className="dabra-product-family">{service.categoryLabel}</span><button type="button" className={cn('dabra-favorite', favorite && 'selected')} onClick={onFavorite} aria-label={favorite ? (language === 'ar' ? 'إزالة من المحفوظات' : 'Remove from saved') : (language === 'ar' ? 'حفظ الخيار' : 'Save option')}><FiHeart /></button></div>
    {catalogOnly && <span className="dabra-catalog-notice">{language === 'ar' ? 'محتوى استكشافي — التوفر غير موثّق' : 'Discovery content — availability is not verified'}</span>}
    {badge && <span className="dabra-recommendation-badge"><FiCheck /> {badge}</span>}
    <h3>{language === 'en' ? service.name_en ?? service.name_ar : service.name_ar}</h3><p className="dabra-product-description">{language === 'en' ? service.description_en ?? service.description_ar : service.description_ar}</p>
    {why && <p className="dabra-why"><span>{language === 'ar' ? 'رأي الدبرة' : 'DABRA’s view'}</span>{localizedWhy(why, language)}</p>}
    <div className="dabra-product-facts"><span><FiMapPin /> {service.destination}</span><span><FiClock /> {service.productCount === 0 ? (language === 'ar' ? '0 خيار — التوفر غير مؤكد' : '0 options — availability unverified') : `${service.productCount} ${language === 'ar' ? 'خيار' : 'options'}`}</span></div>
    <div className="dabra-product-bottom"><div><small>{language === 'ar' ? 'الإجمالي المعروف من' : 'Known total from'}</small><strong>{service.basePrice || (language === 'ar' ? 'حسب الطلب' : 'On request')} {service.currency}</strong></div><div className="dabra-product-actions">{!catalogOnly && <button type="button" onClick={onCart} className={cn('dabra-add-button', inCart && 'added')} aria-label={inCart ? (language === 'ar' ? 'إزالة من حقيبة الرحلة' : 'Remove from trip bag') : (language === 'ar' ? 'إضافة إلى حقيبة الرحلة' : 'Add to trip bag')}>{inCart ? <FiCheck /> : <FiShoppingBag />}</button>}<a href={service.href}>{language === 'ar' ? 'التفاصيل' : 'Details'} <FiArrowLeft /></a></div></div>
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

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowLeft, FiCheck, FiChevronDown, FiClock, FiHeart, FiMapPin, FiMic, FiMicOff, FiPaperclip, FiSearch, FiSend, FiShoppingBag, FiSliders, FiVolume2, FiVolumeX, FiX } from 'react-icons/fi';
import { cn } from '@/lib/utils';
import type { MarketplaceService } from '@/lib/marketplace/data';
import { supabase } from '@/lib/supabase/client';
import { consumeDabraChatResponse, DABRA_SAFE_CHAT_ERROR } from '@/lib/dabra/chat-response-contract';
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

const quickActions = ['قارن', 'أرخص', 'أريح', 'بدون توقف', 'أقرب', 'الأعلى سعرًا', 'غير التاريخ', 'شوف بدائل', 'اختصرها لي', 'اختاره لي'];
const tabs = [
  { label: 'الكل', value: undefined },
  { label: 'طيران', value: 'airport-transfers' },
  { label: 'فنادق', value: 'hotels' },
  { label: 'شقق', value: 'apartments' },
  { label: 'سيارات', value: 'cars' },
  { label: 'باكدجات', value: 'offers' },
] as const;

const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

function safeAttachmentName(name: string) {
  return name.replace(/[\\/\u0000-\u001f\u007f<>:"|?*]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'attachment';
}

const statusCopy: Record<VoiceStatus, string> = {
  idle: 'جاهز أسمعك',
  listening: 'أسمعك الآن',
  processing: 'أرتب طلبك...',
  speaking: 'الدبرة يتحدث',
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
      setMessages([welcomeMessage]);
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
    const message = text.trim() || (attachments.length ? 'راجع المرفقات المضافة وساعدني في تخطيط الرحلة.' : '');
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
      });
      if (lifecycle !== lifecycleRef.current || controller.signal.aborted) return;
      setAttachments([]);
      if (attachmentRef.current) attachmentRef.current.value = '';
      if (!voiceMutedRef.current && 'speechSynthesis' in window) {
        const voiceGeneration = ++voiceGenerationRef.current;
        const utterance = new SpeechSynthesisUtterance(answer);
        utterance.lang = 'ar-SA';
        utterance.onstart = () => { if (voiceGeneration === voiceGenerationRef.current && lifecycle === lifecycleRef.current && !voiceMutedRef.current) setVoiceStatus('speaking'); };
        utterance.onend = () => { if (voiceGeneration === voiceGenerationRef.current && lifecycle === lifecycleRef.current) setVoiceStatus('idle'); };
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      }
    } catch {
      if (lifecycle !== lifecycleRef.current || controller.signal.aborted) return;
      setAttachments((current) => current.map((item) => ({ ...item, status: 'error', error: 'تعذر الإرسال. حاول مرة أخرى.' })));
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, text: DABRA_SAFE_CHAT_ERROR } : item));
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
      setAttachmentError(`يمكن إضافة ${MAX_ATTACHMENTS} مرفقات كحد أقصى.`);
      if (attachmentRef.current) attachmentRef.current.value = '';
      return;
    }
    const next: DabraAttachment[] = [];
    for (const file of incoming) {
      if (!ALLOWED_ATTACHMENT_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError('المرفق غير مدعوم. استخدم PDF أو JPEG أو PNG أو WebP بحجم لا يتجاوز 8 MB.');
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

  function applyQuickAction(action: string) {
    if (action === 'قارن') return setCompareMode(true);
    if (action === 'أرخص') return setResultSort('price-low');
    if (action === 'أريح') return setResultSort('comfort');
    if (action === 'بدون توقف') {
      setNonstopOnly((value) => !value);
      return;
    }
    if (action === 'أقرب') return setResultSort('closest');
    if (action === 'الأعلى سعرًا') return setResultSort('price-high');
    if (action === 'غير التاريخ') {
      setInput('غير التاريخ إلى ');
      return;
    }
    if (action === 'شوف بدائل') {
      setResultLimit(12);
      setResultSort('recommended');
      setNonstopOnly(false);
      return;
    }
    if (action === 'اختصرها لي') return setResultLimit(3);
    if (action === 'اختارها لي') {
      const choice = recommendations[0];
      if (choice) setCart((current) => current.some((item) => item.id === choice.id) ? current : [...current, { id: choice.id, name_ar: choice.name_ar, basePrice: choice.basePrice, currency: choice.currency, categoryLabel: choice.categoryLabel, href: choice.href }]);
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
    recognition.lang = 'ar-SA';
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
        </div>
      </header>

      <div className="dabra-layout">
        <section className="dabra-conversation" aria-label="محادثة الدبرة">
          <div className="dabra-conversation-heading">
            <div><span className="dabra-kicker">رحلتك، على رواق</span><h1>خلنا نرتبها سوا.</h1></div>
            <span className="dabra-session"><FiClock /> جلسة جديدة</span>
          </div>
          <div className="dabra-stream" aria-live="polite" aria-busy={chatInFlight} ref={streamRef}>
            {messages.map((message) => (
              <div key={message.id} className={cn('dabra-message', message.role === 'user' ? 'dabra-message-user' : 'dabra-message-assistant')}>
                {message.role === 'assistant' && <span className="dabra-mini-avatar" aria-hidden="true">د</span>}
                <p>{message.text}</p>
              </div>
            ))}
          </div>

          <div className={cn('dabra-voice-panel', `dabra-voice-${voiceStatus}`)}>
            <div className="dabra-waveform" aria-hidden="true">{Array.from({ length: 19 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 17) % 38)}%` }} />)}</div>
            <div className="dabra-voice-copy"><strong>{statusCopy[voiceStatus]}</strong><span>{voiceStatus === 'idle' ? 'الميكروفون يعمل فقط عندما تبدأ وضع الصوت' : voiceStatus === 'error' ? 'جرّب الكتابة بدلًا من الصوت' : 'تقدر توقفني أو تقاطعني بأي وقت'}</span></div>
            <div className="dabra-voice-actions"><button type="button" className="dabra-voice-mute" onClick={toggleMute} aria-pressed={voiceMuted} aria-label={voiceMuted ? 'تشغيل صوت الدبرة' : 'كتم صوت الدبرة'}>{voiceMuted ? <FiVolumeX /> : <FiVolume2 />}</button><button type="button" className="dabra-voice-toggle" disabled={chatInFlight} onClick={toggleVoice} aria-label={voiceStatus === 'listening' ? 'إيقاف الاستماع' : 'تحدث مع الدبرة'}>{voiceStatus === 'listening' ? <FiMicOff /> : <FiMic />}<span>تحدث مع الدبرة</span></button></div>
          </div>

          <div className="dabra-composer">
            <input ref={attachmentRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => handleAttachments(event.target.files)} />
            <button type="button" className="dabra-composer-icon" aria-label="إرفاق صورة أو ملف PDF" disabled={!identityResolved} onClick={() => attachmentRef.current?.click()}><FiPaperclip /></button>
            <button type="button" className="dabra-composer-icon" aria-label="تفعيل الصوت" disabled={!identityResolved || chatInFlight} onClick={toggleVoice}><FiVolume2 /></button>
            <input value={input} disabled={!identityResolved} maxLength={500} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) void sendMessage(); }} placeholder={identityResolved ? 'قل للدبرة وش تحتاج...' : 'نجهز جلستك الآمنة...'} aria-label="رسالة للدبرة" />
            <button type="button" className="dabra-send" aria-label="إرسال الرسالة" onClick={() => void sendMessage()} disabled={!identityResolved || (!input.trim() && !attachments.length) || chatInFlight}><FiSend /></button>
          </div>
          {attachments.length > 0 && <div className="dabra-attachment-list" aria-label="المرفقات المحددة">{attachments.map((item) => <div className={cn('dabra-attachment-status', item.status === 'error' && 'is-error')} key={item.id}><span>{item.safeName} · {(item.file.size / 1024 / 1024).toFixed(1)} MB · {item.status === 'uploading' ? 'جارٍ الإرسال' : item.status === 'error' ? item.error : 'جاهز'}</span><button type="button" disabled={chatInFlight} onClick={() => removeAttachment(item.id)} aria-label={`إزالة ${item.safeName}`}><FiX /></button></div>)}</div>}
          {attachmentError && <div className="dabra-attachment-status is-error" role="alert">{attachmentError}</div>}
          <div className="dabra-quick-actions" aria-label="إجراءات سريعة">{quickActions.map((action) => <button type="button" key={action} disabled={!identityResolved || chatInFlight} onClick={() => applyQuickAction(action)}>{action}</button>)}</div>
        </section>

        <section className="dabra-results" aria-label="نتائج السفر">
          <div className="dabra-results-header"><div><span className="dabra-kicker">سوق الدبرة</span><h2>خيارات تناسبك</h2></div><button type="button" className="dabra-cart-button" onClick={() => setShowCart(true)} aria-label="فتح حقيبة الرحلة"><FiShoppingBag /><b>{cart.length}</b></button></div>
          <div className="dabra-tabs" role="tablist" aria-label="أقسام السوق">{tabs.map((tab) => <button type="button" role="tab" aria-selected={activeTab === tab.value} className={cn(activeTab === tab.value && 'active')} key={tab.label} onClick={() => setActiveTab(tab.value)}>{tab.label}</button>)}</div>
          <form className="dabra-marketplace-search" onSubmit={(event) => { event.preventDefault(); void searchMarketplace(marketplaceQuery); }}><label className="sr-only" htmlFor="dabra-marketplace-query">ابحث في السوق</label><input id="dabra-marketplace-query" value={marketplaceQuery} onChange={(event) => setMarketplaceQuery(event.target.value)} placeholder="ابحث في سوق الدبرة" maxLength={200} /><button type="submit" disabled={!marketplaceQuery.trim()} aria-label="بحث"><FiSearch /></button></form>
          <div className="dabra-filter-row"><button type="button" aria-pressed={availabilityOnly} onClick={() => setAvailabilityOnly((value) => !value)}><FiSliders /> المتاح فقط</button><button type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((value) => !value)}><FiHeart /> المحفوظات</button><label><span className="sr-only">ترتيب النتائج</span><select value={resultSort} onChange={(event) => setResultSort(event.target.value as DabraResultSort)}><option value="recommended">الأفضل لك</option><option value="price-low">السعر: الأقل</option><option value="price-high">السعر: الأعلى</option><option value="comfort">الأريح</option><option value="closest">الأقرب</option></select><FiChevronDown aria-hidden="true" /></label><button type="button" onClick={() => setCompareMode((value) => !value)}>{compareMode ? 'إنهاء المقارنة' : 'قارن'}</button></div>

          {loading && <div className="dabra-state"><span className="dabra-spinner" /><p>أبحث لك عن الخيارات المناسبة...</p></div>}
          {!loading && resultState === 'empty' && <div className="dabra-state"><FiMapPin /><p>ما لقيت خيارًا مطابقًا الآن. جرّب تغيير الوجهة أو التاريخ.</p></div>}
          {!loading && resultState === 'error' && <div className="dabra-state"><FiX /><p>السوق غير متاح مؤقتًا. نقدر نكمل المحادثة بدون ما نفقد طلبك.</p></div>}
          {!loading && resultState === 'idle' && services.length === 0 && <div className="dabra-state dabra-state-welcome"><FiArrowLeft /><p>اكتب وجهتك أو أولويتك، وأنا أجيب لك الخيارات الواضحة.</p></div>}

          {!loading && recommendationDecisions.length > 0 && <div className="dabra-recommendations"><div className="dabra-section-label">ترشيح الدبرة</div>{recommendationDecisions.map(({ service, badge, why }) => <ProductCard key={service.id} service={service} badge={badge} why={why} inCart={cart.some((item) => item.id === service.id)} favorite={favorites.includes(service.id)} onCart={() => toggleCart(service)} onFavorite={() => toggleFavorite(service.id)} compare={compareMode} />)}</div>}
          {compareMode && recommendationDecisions.length > 1 && <ComparisonTable recommendations={recommendationDecisions} />}
          {alternatives.length > 0 && <div className="dabra-other-results"><div className="dabra-section-label">بدائل ومحتوى استكشافي</div>{alternatives.map((service) => <ProductCard key={service.id} service={service} catalogOnly={!recommendationEligible(service)} inCart={cart.some((item) => item.id === service.id)} favorite={favorites.includes(service.id)} onCart={() => toggleCart(service)} onFavorite={() => toggleFavorite(service.id)} compare={compareMode} />)}</div>}
        </section>
      </div>

      {showSettings && <div className="dabra-settings" role="dialog" aria-label="إعدادات الدبرة"><button type="button" onClick={() => setShowSettings(false)} aria-label="إغلاق"><FiX /></button><strong>إعدادات المحادثة</strong><label><input type="checkbox" defaultChecked /> اقتراحات مختصرة</label><label><input type="checkbox" defaultChecked /> تنبيه عند تغيّر الحالة</label></div>}
      {showCart && <div className="dabra-cart-drawer" role="dialog" aria-modal="true" aria-label="حقيبة الرحلة"><button type="button" className="dabra-drawer-close" onClick={() => setShowCart(false)} aria-label="إغلاق الحقيبة"><FiX /></button><span className="dabra-kicker">بناء الرحلة</span><h2>حقيبتك</h2>{cart.length === 0 ? <p className="dabra-muted">ما اخترت شيئًا بعد. نضيف الخيارات اللي تعجبك هنا.</p> : <>{cart.map((item) => <div className="dabra-cart-item" key={item.id}><div><strong>{item.name_ar}</strong><span>{item.categoryLabel}</span></div><b>{item.basePrice || 'حسب الطلب'} {item.currency}</b><button type="button" className="dabra-drawer-close" onClick={() => setCart((current) => current.filter((entry) => entry.id !== item.id))} aria-label={`إزالة ${item.name_ar} من الحقيبة`}><FiX /></button></div>)}<div className="dabra-cart-total"><span>{cartTotals.message}</span><strong>{cartTotals.unified ? `${cartTotals.amount} ${cartTotals.currency}` : 'غير موحّد'}</strong></div>{!cartTotals.unified && <div className="dabra-cart-groups">{cartTotals.groups.map((group) => <span key={group.currency}>{group.amount} {group.currency}</span>)}</div>}<p className="dabra-muted">الضرائب والرسوم تظهر عند توفرها. التوفير لا يظهر إلا إذا كان موثقًا من المزود. ما راح نخفي أي تكلفة.</p></>}<div className="dabra-missing-components"><strong>المكونات الناقصة</strong><span>{missingComponents.length ? missingComponents.join('، ') : 'الرحلة الأساسية مكتملة'}</span></div>{lastMarketplaceQuery && <p className="dabra-muted">آخر بحث محفوظ في الجلسة الحالية: {lastMarketplaceQuery}</p>}</div>}
    </main>
  );
}

function ComparisonTable({ recommendations }: { recommendations: ReturnType<typeof buildDabraRecommendations> }) {
  return <div className="dabra-comparison" role="region" aria-label="مقارنة الخيارات"><div className="dabra-section-label">مقارنة القرار</div><div className="dabra-comparison-scroll"><table><thead><tr><th scope="col">المعيار</th>{recommendations.map(({ service }) => <th scope="col" key={service.id}>{service.name_ar}</th>)}</tr></thead><tbody><tr><th scope="row">السعر</th>{recommendations.map(({ service }) => <td key={service.id}>{service.basePrice || 'حسب الطلب'} {service.currency}</td>)}</tr><tr><th scope="row">التوفر</th>{recommendations.map(({ service }) => <td key={service.id}>{service.availability === 'available' ? 'متاح' : service.availability === 'limited' ? 'محدود' : 'غير متاح'}</td>)}</tr><tr><th scope="row">سبب الترشيح</th>{recommendations.map(({ service, why }) => <td key={service.id}>{why}</td>)}</tr></tbody></table></div></div>;
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
    abort?(): void;
  }
}

'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { FiMessageCircle, FiMic, FiMicOff, FiSend, FiX } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { useDibrahSpeech } from '@/components/layout/useDibrahSpeech';

type DibrahAssistantContext = {
  source: 'supabase' | 'api' | 'fallback';
  hasRealData: boolean;
  dataQuality?: 'live-verified' | 'pilot-test' | 'unavailable';
  totalServices: number;
  categories: Array<{ category: string; label: string; count: number }>;
  topServices: Array<{
    id: string | number;
    title: string;
    category: string;
    price: number;
    currency: string;
    destination: string;
    href: string;
  }>;
};

type DibrahMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
};

const DIBRAH_POSITION_STORAGE_KEY = 'dir3com:dibrah-position:v1';
const DIBRAH_POLICY_ACCEPTED_KEY = 'dir3com:dibrah-policy-accepted:v1';
const DEFAULT_DIBRAH_POSITION = { x: 12, y: 120 };

function buildSeedMessages(context: DibrahAssistantContext | null): DibrahMessage[] {
  const sourceLine = context?.dataQuality === 'live-verified'
    ? 'البيانات الحالية موثقة ضمن السوق الحي.'
    : context?.dataQuality === 'pilot-test'
      ? 'البيانات الحالية تجريبية أو ضمن نطاق الاختبار، وليست إثباتًا للتوفر الحي.'
      : 'لا تتوفر حاليًا بيانات سوق موثقة كافية.';

  return [
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content: `ياهلا، أنا الدبرة. ${sourceLine} أقدر أساعدك باقتراح الخدمات المناسبة حسب الوجهة ونوع الرحلة.`,
    },
  ];
}

function presentAssistantAnswer(answer: string | undefined) {
  const trimmed = answer?.trim();
  if (!trimmed) return 'لا تتوفر إجابة موثوقة حاليًا. جرّب إضافة الوجهة أو نوع الخدمة المطلوبة.';

  const exposesInternalFallback = [
    'قاعدة المعرفة الداخلية',
    'ضمن نطاق DIR3COM المعتمد',
    "I don't have a sufficiently authoritative source",
    'internal knowledge base',
  ].some((marker) => trimmed.includes(marker));

  return exposesInternalFallback
    ? 'لا تتوفر لدي معلومات موثوقة كافية لهذا الطلب حاليًا. جرّب تحديد الوجهة ونوع الخدمة، أو تواصل مع فريق الدعم للمساعدة.'
    : trimmed;
}

function detectConversationLanguage(text: string, fallback: 'ar' | 'en' = 'ar'): 'ar' | 'en' {
  if (/[\u0600-\u06ff]/.test(text)) return 'ar';
  if (/[a-z]/i.test(text)) return 'en';
  return fallback;
}

export default function FloatingDibrah() {
  const pathname = usePathname();
  const controlRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({ active: false, moved: false, pointerId: -1, startX: 0, startY: 0, originX: 0, originY: 0 });
  const pointerTargetRef = useRef<HTMLButtonElement | null>(null);
  const suppressClickRef = useRef(false);

  const [position, setPosition] = useState<{ x: number; y: number }>(DEFAULT_DIBRAH_POSITION);
  const [dragging, setDragging] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyChecked, setPolicyChecked] = useState(false);
  const [, setAssistantContext] = useState<DibrahAssistantContext | null>(null);
  const [messages, setMessages] = useState<DibrahMessage[]>(() => buildSeedMessages(null));
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [micLanguage, setMicLanguage] = useState<'ar' | 'en'>('ar');
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const sendInFlightRef = useRef(false);
  const activeRequestIdRef = useRef<string | null>(null);

  const clampPosition = useCallback((x: number, y: number) => {
    const width = controlRef.current?.offsetWidth ?? 220;
    const height = controlRef.current?.offsetHeight ?? 72;
    const margin = 12;

    return {
      x: Math.min(Math.max(x, margin), window.innerWidth - width - margin),
      y: Math.min(Math.max(y, 84), window.innerHeight - height - margin),
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const mobile = window.matchMedia('(max-width: 639px)').matches;
      const marketplaceRequestMobile = mobile
        && pathname.startsWith('/services/')
        && document.querySelector('[data-marketplace-request-form]') !== null;
      if (marketplaceRequestMobile) {
        setPosition(clampPosition(Number.POSITIVE_INFINITY, 96));
        return;
      }

      const dir121Mobile = mobile
        && document.querySelector('.real-preview-shell') !== null;
      if (dir121Mobile) {
        setPosition(clampPosition(12, Number.POSITIVE_INFINITY));
        return;
      }

      const stored = window.localStorage.getItem(DIBRAH_POSITION_STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as { x?: unknown; y?: unknown };
          if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
            setPosition(clampPosition(parsed.x, parsed.y));
            return;
          }
        } catch {
          window.localStorage.removeItem(DIBRAH_POSITION_STORAGE_KEY);
        }
      }

      setPosition(clampPosition(12, Math.max(window.innerHeight - 124, 84)));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [clampPosition, pathname]);

  useEffect(() => {
    const handleResize = () => {
      const marketplaceRequestMobile = window.matchMedia('(max-width: 639px)').matches
        && pathname.startsWith('/services/')
        && document.querySelector('[data-marketplace-request-form]') !== null;
      if (marketplaceRequestMobile) {
        setPosition(clampPosition(Number.POSITIVE_INFINITY, 96));
        return;
      }
      setPosition((previous) => clampPosition(previous.x, previous.y));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPosition, pathname]);

  useEffect(() => {
    if (!panelOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPanelOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [panelOpen]);

  // Track whether the reader is parked near the bottom so we never yank them away mid-read.
  useEffect(() => {
    const node = messagesRef.current;
    if (!panelOpen || !node) return;
    const onScroll = () => {
      stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [panelOpen]);

  useEffect(() => {
    if (!panelOpen || !stickToBottomRef.current) return;
    const id = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(id);
  }, [messages, sending, panelOpen]);

  useEffect(() => {
    async function loadAssistantContext() {
      try {
        const response = await fetch('/api/services?view=assistant', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as DibrahAssistantContext;
        setAssistantContext(payload);
        setMessages((previous) => (
          previous.length === 1 && previous[0]?.id === 'assistant-welcome'
            ? buildSeedMessages(payload)
            : previous
        ));
      } catch {
        setAssistantContext(null);
      }
    }

    loadAssistantContext();
  }, []);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      if (!dragStateRef.current.active || event.pointerId !== dragStateRef.current.pointerId) return;

      const deltaX = event.clientX - dragStateRef.current.startX;
      const deltaY = event.clientY - dragStateRef.current.startY;

      if (!dragStateRef.current.moved && Math.hypot(deltaX, deltaY) >= 6) {
        dragStateRef.current.moved = true;
        setDragging(true);
      }

      if (!dragStateRef.current.moved) {
        return;
      }

      setPosition(clampPosition(dragStateRef.current.originX + deltaX, dragStateRef.current.originY + deltaY));
    };

    const finalizeDrag = (event: PointerEvent) => {
      if (!dragStateRef.current.active || event.pointerId !== dragStateRef.current.pointerId) return;

      try {
        pointerTargetRef.current?.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
      dragStateRef.current.active = false;
      dragStateRef.current.pointerId = -1;

      if (!dragStateRef.current.moved) {
        setDragging(false);
        return;
      }

      suppressClickRef.current = true;
      setDragging(false);
      setPosition((previous) => {
        if (!controlRef.current) return previous;

        const width = controlRef.current.offsetWidth;
        const snapToRight = previous.x + width / 2 > window.innerWidth / 2;
        const snappedX = snapToRight ? window.innerWidth - width - 12 : 12;
        const next = clampPosition(snappedX, previous.y);
        window.localStorage.setItem(DIBRAH_POSITION_STORAGE_KEY, JSON.stringify(next));
        return next;
      });

      dragStateRef.current.moved = false;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', finalizeDrag);
    window.addEventListener('pointercancel', finalizeDrag);

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', finalizeDrag);
      window.removeEventListener('pointercancel', finalizeDrag);
    };
  }, [clampPosition]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!controlRef.current) return;

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Continue with window listeners when capture is unavailable.
    }
    pointerTargetRef.current = event.currentTarget;
    suppressClickRef.current = false;
    dragStateRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
  };

  const speech = useDibrahSpeech(micLanguage, (transcript) => {
    setDraft((previous) => (previous ? `${previous.trimEnd()} ${transcript}` : transcript));
    draftRef.current?.focus();
  });

  const resizeComposer = useCallback((node: HTMLTextAreaElement | null) => {
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    resizeComposer(draftRef.current);
  }, [draft, resizeComposer]);

  const openAssistant = () => {
    setPanelOpen(true);
    if (window.localStorage.getItem(DIBRAH_POLICY_ACCEPTED_KEY) !== 'true') {
      setPolicyChecked(false);
      setPolicyOpen(true);
    }
  };

  useEffect(() => {
    if (panelOpen && !policyOpen) window.requestAnimationFrame(() => draftRef.current?.focus());
  }, [panelOpen, policyOpen]);

  const acceptPolicy = () => {
    window.localStorage.setItem(DIBRAH_POLICY_ACCEPTED_KEY, 'true');
    setPolicyOpen(false);
    setPolicyChecked(false);
  };

  const sendDraft = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending || sendInFlightRef.current) return;
    setMicLanguage(detectConversationLanguage(trimmed, micLanguage));
    const requestId = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const userMessageId = `user-${requestId}`;
    const assistantMessageId = `assistant-${requestId}`;
    sendInFlightRef.current = true;
    activeRequestIdRef.current = requestId;
    // Short session-only context so DABRA can resolve follow-ups ("خليها 3 أيام") without a persistent memory claim.
    const historyForRequest = messages
      .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
      .slice(-8)
      .map((entry) => ({ role: entry.role, content: entry.content }));
    setSending(true);
    setSendError(null);
    setMessages((previous) => (
      previous.some((entry) => entry.id === userMessageId)
        ? previous
        : [...previous, { id: userMessageId, role: 'user', content: trimmed }]
    ));
    setDraft('');
    // Sending is an explicit action, so always return the viewport to the newest message.
    stickToBottomRef.current = true;
    try {
      const response = await fetch('/api/ai2/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history: historyForRequest }),
      });
      const payload = (await response.json().catch(() => ({}))) as { answer?: string; error?: string };
      if (!response.ok) {
        if (response.status === 400) {
          setSendError('الرسالة غير صالحة، حاول صياغتها بشكل مختلف.');
        } else if (response.status === 401 || response.status === 403) {
          setSendError('تعذر التحقق من الجلسة. حدّث الصفحة وحاول مرة أخرى.');
        } else {
          setSendError('تعذر الاتصال بالدبرة حاليًا. حاول مرة أخرى لاحقًا.');
        }
        return;
      }
      if (activeRequestIdRef.current !== requestId) return;
      setMessages((previous) => (
        previous.some((entry) => entry.id === assistantMessageId)
          ? previous
          : [...previous, { id: assistantMessageId, role: 'assistant', content: presentAssistantAnswer(payload.answer) }]
      ));
    } catch {
      setSendError('تعذر الاتصال بالدبرة حاليًا. تحقّق من الاتصال بالإنترنت وحاول مرة أخرى.');
    } finally {
      if (activeRequestIdRef.current === requestId) {
        activeRequestIdRef.current = null;
        sendInFlightRef.current = false;
        setSending(false);
        window.requestAnimationFrame(() => draftRef.current?.focus());
      }
    }
  }, [draft, sending, messages, micLanguage]);

  return (
    <div
      ref={controlRef}
      id="dibrah"
      data-dabra-runtime="canonical-v2"
      className={`group fixed z-50 select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ left: position.x, top: position.y }}
    >
      <span className="pointer-events-none absolute -top-12 right-0 hidden whitespace-nowrap rounded-full border border-[var(--color-gold)]/25 bg-[var(--color-surface-strong)] px-3 py-2 text-xs font-medium text-[var(--color-light)] shadow-[0_10px_30px_rgba(13,27,42,0.3)] group-hover:block group-focus-within:block">
        اسحب للتحريك - اسأل الدبرة
      </span>

      {panelOpen ? (
        <div className="dabra-panel-shell fixed inset-0 z-50 sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(82dvh,780px)] sm:w-[min(94vw,600px)]">
          <div className="dabra-panel flex h-full flex-col overflow-hidden border border-[#d7bd82] bg-[#fffdf8] shadow-[0_30px_80px_rgba(13,27,42,0.34)] sm:rounded-[24px]">
            <div className="flex items-center justify-between border-b border-[#dfd4bd] bg-[#fffaf0] px-4 py-3.5 sm:px-5">
              <div>
                <p className="text-xs font-bold tracking-[0.2em] text-[#946b1f]">DIBRAH ASSISTANT</p>
                <p className="mt-1 text-base font-bold text-[#13243a]">الدبرة</p>
                <p className="mt-0.5 text-[11px] font-medium text-[#64748b]">تحت الاختبار</p>
              </div>
              <button
                type="button"
                aria-label="إغلاق لوحة الدبرة"
                onClick={(event) => {
                  event.stopPropagation();
                  setPanelOpen(false);
                }}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-border)] text-[var(--color-navy)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
              >
                <FiX />
              </button>
            </div>

            <div ref={messagesRef} className="dabra-messages min-h-0 flex-1 overflow-y-auto bg-[#f8f5ee] px-3 py-4 sm:px-5">
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    dir={detectConversationLanguage(message.content) === 'ar' ? 'rtl' : 'ltr'}
                    className={`min-w-0 max-w-[92%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-[18px] px-4 py-3 text-[15px] leading-7 sm:text-base ${
                      message.role === 'assistant'
                        ? 'mr-auto border border-[#ded7ca] bg-[#fffefb] text-[#172033] shadow-sm'
                        : 'ml-auto border border-[#dcc58e] bg-[#f4e6bd] text-[#14243a]'
                    }`}
                  >
                    {message.content}
                  </div>
                ))}
              </div>

              <div ref={messagesEndRef} aria-hidden="true" />
            </div>

            <div className="shrink-0 border-t border-[#dfd4bd] bg-[#fffaf0] px-3 py-3 sm:px-5">
              {sendError ? <p className="mb-2 text-xs text-rose-700">{sendError}</p> : null}
              <div className="flex items-end gap-2 rounded-[20px] border border-[#c9b476] bg-white px-3 py-2 shadow-[0_6px_18px_rgba(13,27,42,0.08)] focus-within:border-[#a97922] focus-within:ring-2 focus-within:ring-[#c89536]/25">
                <FiMessageCircle className="mb-2 text-[#a97922]" />
                <textarea
                  ref={draftRef}
                  rows={1}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onInput={(event) => resizeComposer(event.currentTarget)}
                  onKeyDown={(event) => {
                    // Ignore Enter while an IME composition is active so Arabic/CJK input is not sent early.
                    if (event.nativeEvent.isComposing || event.keyCode === 229) {
                      return;
                    }
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendDraft();
                    }
                  }}
                  dir={detectConversationLanguage(draft, micLanguage) === 'ar' ? 'rtl' : 'ltr'}
                  placeholder={micLanguage === 'ar' ? 'ابدأ الكتابة' : 'Start typing'}
                  className="dabra-composer w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-[15px] leading-6 text-[#14243a] placeholder:text-[#718096] outline-none"
                />
                <div className="mb-1 flex shrink-0 overflow-hidden rounded-full border border-[#d7bd82] bg-[#fffaf0] text-[10px] font-bold" aria-label="لغة الميكروفون">
                  {(['ar', 'en'] as const).map((language) => (
                    <button
                      key={language}
                      type="button"
                      aria-pressed={micLanguage === language}
                      onClick={() => setMicLanguage(language)}
                      className={`px-2 py-1 ${micLanguage === language ? 'bg-[#c89536] text-[#13243a]' : 'text-[#5b6574]'}`}
                    >
                      {language.toUpperCase()}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  aria-label={speech.status === 'listening' ? 'إيقاف الإدخال الصوتي' : 'الإدخال الصوتي'}
                  aria-pressed={speech.status === 'listening'}
                  onClick={() => (speech.status === 'listening' ? speech.stopListening() : speech.startListening())}
                  disabled={speech.status === 'unsupported'}
                  title={speech.status === 'listening' ? 'إيقاف الاستماع' : 'اضغط للتحدث'}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-gold)]/55 transition disabled:cursor-not-allowed disabled:opacity-40 ${speech.status === 'listening' ? 'dabra-mic--listening bg-[var(--color-gold)] text-[var(--color-navy)]' : 'bg-white text-[var(--color-gold)] hover:bg-[var(--color-gold)]/12'}`}
                >
                  {speech.status === 'listening' ? <FiMicOff size={14} /> : <FiMic size={14} />}
                </button>
                <button
                  type="button"
                  aria-label="إرسال"
                  onClick={() => void sendDraft()}
                  disabled={sending || !draft.trim()}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-strong)] text-[var(--color-light)] transition hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FiSend size={14} />
                </button>
              </div>
              <p className={`mt-2 text-xs ${speech.status === 'listening' ? 'font-semibold text-[#946b1f]' : 'text-[#64748b]'}`} aria-live="polite">
                {speech.status === 'listening'
                  ? (micLanguage === 'ar' ? 'جاري الاستماع...' : 'Listening...')
                  : speech.status === 'idle'
                    ? (micLanguage === 'ar' ? 'اضغط للتحدث' : 'Tap to speak')
                    : null}
                {speech.interimTranscript ? ` ${speech.interimTranscript}` : ''}
              </p>
              {speech.status === 'denied' ? (
                <p role="alert" className="mt-2 text-xs text-[#b91c1c]">تعذر الوصول إلى الميكروفون. اسمح للمتصفح باستخدام الميكروفون ثم حاول مرة أخرى.</p>
              ) : null}
              {speech.status === 'unsupported' ? (
                <p className="mt-2 text-xs text-[var(--color-muted)]">الإدخال الصوتي غير مدعوم في هذا المتصفح. استخدم الكتابة أو متصفحًا يدعم Web Speech.</p>
              ) : null}
            </div>
          </div>
          {policyOpen ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[24px] bg-[var(--color-surface-strong)]/35 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="dabra-policy-title">
              <div className="flex max-h-full w-full flex-col overflow-hidden rounded-[20px] border border-[var(--color-gold)]/30 bg-[var(--color-shell)] shadow-[0_24px_60px_rgba(13,27,42,0.3)]" dir="rtl">
                <div className="shrink-0 border-b border-[color:var(--color-border)] px-4 py-3"><h2 id="dabra-policy-title" className="text-lg font-semibold text-[var(--color-navy)]">إخلاء مسؤولية</h2></div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm leading-7 text-[var(--color-muted)]">
                  <p>إن تطبيق الدَّبْرَة هو نموذج لغوي للذكاء الاصطناعي، يستخدم البيانات الخاصة بمواقع dir3com لتسهيل الوصول إلى المعلومات المتعلقة بالبحث والحجز للسيارات والفنادق والشقق والتأشيرات والتجارب والفعاليات وخطط الرحلات السياحية. وعليه، لا يجب اعتبار الردود الصادرة عنه استشارة مهنية أو بديلًا عن استشارة خبير متخصص ومؤهل.</p>
                  <p className="mt-3">لا تتحمل dir3com ولا الدَّبْرَة، مساعد الذكاء الاصطناعي، المسؤولية عن أي إجراء أو إجراءات يتم اتخاذها أو التخلي عنها بناءً على المعلومات التي يقدمها. كما قد لا يوفر مساعد الذكاء الاصطناعي دائمًا إجابات دقيقة أو كاملة، وقد يُنشئ أحيانًا إجابات غير مناسبة أو غير صحيحة نظرًا لطبيعة بيانات التدريب الخاصة به.</p>
                  <p className="mt-3">يتحمل المستخدم بالكامل مسؤولية استخدامه لتطبيق مساعد الذكاء الاصطناعي الدَّبْرَة.</p>
                  <p className="mt-3 font-semibold text-[var(--color-navy)]">تحت الاختبار.</p>
                  <label className="mt-4 flex items-start gap-3 text-[var(--color-navy)]"><input type="checkbox" checked={policyChecked} onChange={(event) => setPolicyChecked(event.target.checked)} className="mt-1 h-4 w-4" /><span>أوافق على أنني قد قرأت <Link href="/terms" className="font-semibold text-[var(--color-gold)] underline">الشروط والأحكام</Link> و<Link href="/privacy" className="font-semibold text-[var(--color-gold)] underline">سياسة الخصوصية</Link>، وأوافق أيضًا على معالجة اسمي وعنوان بريدي الإلكتروني عند تسجيل الدخول. أفهم أن الاسم الكامل وعنوان البريد الإلكتروني يُستخدمان لتتبع المحادثات وتوفير تجربة مخصصة.</span></label>
                </div>
                <div className="shrink-0 border-t border-[color:var(--color-border)] px-4 py-3"><button type="button" onClick={acceptPolicy} disabled={!policyChecked} className="w-full rounded-xl bg-[var(--color-gold)] px-4 py-3 text-sm font-semibold text-[var(--color-navy)] disabled:cursor-not-allowed disabled:opacity-40">متابعة</button></div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        title="اسأل الدبرة"
        aria-label="الدبرة"
        onPointerDown={handlePointerDown}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (panelOpen) setPanelOpen(false); else openAssistant();
        }}
        onClick={(event) => {
          event.stopPropagation();
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          if (panelOpen) setPanelOpen(false); else openAssistant();
        }}
        className="group relative flex min-h-14 items-center gap-3 overflow-hidden rounded-full border border-[var(--color-gold)]/40 bg-[linear-gradient(150deg,#334155_0%,#163149_100%)] px-3 py-3 text-right text-[var(--color-light)] shadow-[0_26px_56px_rgba(13,27,42,0.3)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45"
      >
        <span className="pointer-events-none absolute -right-4 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-[var(--color-gold)]/20 blur-2xl" />
        <span className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-[var(--color-gold)]/40 bg-white/60">
          <Image src="/brand/runtime/DABRA emoji.png" alt="DABRA avatar" fill sizes="48px" unoptimized className="object-cover" />
        </span>
        <span className="hidden flex-col sm:flex">
          <span className="inline-flex items-center gap-2 text-xs text-[var(--color-gold)]">
            <HiSparkles /> مساعد السفر الودود
          </span>
          <span className="text-sm font-semibold">الدبرة</span>
          <span className="text-[11px] text-[var(--color-light)]/70">اسأل الدبرة</span>
        </span>
      </button>
    </div>
  );
}

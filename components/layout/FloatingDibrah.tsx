'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { FiExternalLink, FiMessageCircle, FiMic, FiMicOff, FiSend, FiX } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { useLanguage } from '@/components/i18n/LanguageProvider';
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

export default function FloatingDibrah() {
  const { language } = useLanguage();
  const controlRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({ active: false, moved: false, pointerId: -1, startX: 0, startY: 0, originX: 0, originY: 0 });
  const pointerTargetRef = useRef<HTMLButtonElement | null>(null);
  const suppressClickRef = useRef(false);

  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') {
      return { x: 12, y: 120 };
    }

    const stored = window.localStorage.getItem(DIBRAH_POSITION_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { x?: unknown; y?: unknown };
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return {
            x: Math.min(Math.max(parsed.x, 12), window.innerWidth - 220 - 12),
            y: Math.min(Math.max(parsed.y, 84), window.innerHeight - 72 - 12),
          };
        }
      } catch {
        window.localStorage.removeItem(DIBRAH_POSITION_STORAGE_KEY);
      }
    }

    return {
      x: 12,
      y: Math.max(window.innerHeight - 124, 84),
    };
  });
  const [dragging, setDragging] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyChecked, setPolicyChecked] = useState(false);
  const [assistantContext, setAssistantContext] = useState<DibrahAssistantContext | null>(null);
  const [messages, setMessages] = useState<DibrahMessage[]>(() => buildSeedMessages(null));
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

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
    const handleResize = () => {
      setPosition((previous) => clampPosition(previous.x, previous.y));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPosition]);

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
        setMessages(buildSeedMessages(payload));
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

  const quickLinks = useMemo(() => assistantContext?.topServices.slice(0, 3) ?? [], [assistantContext]);

  const speech = useDibrahSpeech('ar', (transcript) => {
    setDraft((previous) => (previous ? `${previous} ${transcript}` : transcript));
    draftRef.current?.focus();
  });

  const openAssistant = useCallback(() => {
    setPanelOpen(true);
    if (window.localStorage.getItem(DIBRAH_POLICY_ACCEPTED_KEY) !== 'true') {
      setPolicyChecked(false);
      setPolicyOpen(true);
    }
  }, []);

  useEffect(() => {
    const handleOpenRequest = () => openAssistant();
    window.addEventListener('dir3com:open-dibrah', handleOpenRequest);
    return () => window.removeEventListener('dir3com:open-dibrah', handleOpenRequest);
  }, [openAssistant]);

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
    if (!trimmed || sending) return;
    const timestamp = Date.now();
    // Short session-only context so DABRA can resolve follow-ups ("خليها 3 أيام") without a persistent memory claim.
    const historyForRequest = messages
      .filter((entry) => entry.role === 'user' || entry.role === 'assistant')
      .slice(-8)
      .map((entry) => ({ role: entry.role, content: entry.content }));
    setSending(true);
    setSendError(null);
    setMessages((previous) => [...previous, { id: `user-${timestamp}`, role: 'user', content: trimmed }]);
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
      setMessages((previous) => [...previous, { id: `assistant-${timestamp}`, role: 'assistant', content: presentAssistantAnswer(payload.answer) }]);
    } catch {
      setSendError('تعذر الاتصال بالدبرة حاليًا. تحقّق من الاتصال بالإنترنت وحاول مرة أخرى.');
    } finally {
      setSending(false);
      window.requestAnimationFrame(() => draftRef.current?.focus());
    }
  }, [draft, sending, messages]);

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
        <div className="dabra-panel-shell fixed inset-0 z-50 sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[min(78dvh,760px)] sm:w-[min(92vw,560px)]">
          <div className="dabra-panel flex flex-col overflow-hidden rounded-none border border-[var(--color-gold)]/25 bg-[var(--color-shell)]/95 shadow-[0_30px_70px_rgba(13,27,42,0.26)] backdrop-blur-xl sm:rounded-[24px]">
            <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-[var(--color-gold)]">DIBRAH ASSISTANT</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-navy)]">الدبرة</p>
                <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">تحت الاختبار</p>
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

            <div ref={messagesRef} className="dabra-messages max-h-[62vh] flex-1 overflow-y-auto px-4 py-3" role="log" aria-live="polite" aria-label={language === 'ar' ? 'محادثة الدبرة' : 'DABRA conversation'}>
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 px-3 py-1.5 text-[var(--color-navy)]">
                  {assistantContext?.dataQuality === 'live-verified'
                    ? 'بيانات سوق موثقة'
                    : assistantContext?.dataQuality === 'pilot-test'
                      ? 'بيانات تجريبية للاختبار'
                      : 'بيانات غير متاحة'}
                </span>
              </div>

              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-[16px] px-3 py-2 text-sm leading-7 ${
                      message.role === 'assistant'
                        ? 'border border-[color:var(--color-border)] bg-white/75 text-[var(--color-navy)]'
                        : 'bg-[var(--color-surface-strong)] text-[var(--color-light)]'
                    }`}
                  >
                    {message.content}
                  </div>
                ))}
              </div>

              {quickLinks.length ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold tracking-[0.16em] text-[var(--color-gold)]">خدمات مقترحة</p>
                  {quickLinks.map((service) => (
                    <Link
                      key={service.id}
                      href={service.href}
                      className="flex items-center justify-between rounded-[14px] border border-[color:var(--color-border)] bg-white/80 px-3 py-2 text-sm text-[var(--color-navy)] transition hover:border-[var(--color-gold)]"
                    >
                      <span>{service.title}</span>
                      <FiExternalLink />
                    </Link>
                  ))}
                </div>
              ) : null}

              {assistantContext?.categories.length ? (
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  {assistantContext.categories.slice(0, 5).map((item) => (
                    <span key={item.category} className="rounded-full border border-[color:var(--color-border)] bg-white/75 px-3 py-1.5 text-[var(--color-muted)]">
                      {item.label} ({item.count})
                    </span>
                  ))}
                </div>
              ) : null}
              <div ref={messagesEndRef} aria-hidden="true" />
            </div>

            <div className="border-t border-[color:var(--color-border)] px-4 py-3">
              {sendError ? <p role="alert" className="mb-2 text-xs text-rose-700">{sendError}</p> : null}
              <p className="sr-only" role="status" aria-live="polite">{sending ? (language === 'ar' ? 'جارٍ إعداد الرد' : 'Preparing a response') : ''}</p>
              <div className="flex items-end gap-2 rounded-[20px] border border-[color:var(--color-border)] bg-white/70 px-3 py-2">
                <FiMessageCircle className="text-[var(--color-gold)]" />
                <textarea
                  ref={draftRef}
                  rows={1}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
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
                  placeholder="ابدأ الكتابة"
                  className="dabra-composer w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-sm leading-6 text-[var(--color-navy)] outline-none"
                />
                <button
                  type="button"
                  aria-label={speech.status === 'listening'
                    ? (language === 'ar' ? 'إيقاف الإدخال الصوتي' : 'Stop voice input')
                    : (language === 'ar' ? 'الإدخال الصوتي' : 'Voice input')}
                  aria-pressed={speech.status === 'listening'}
                  onClick={() => (speech.status === 'listening' ? speech.stopListening() : speech.startListening())}
                  disabled={speech.status === 'unsupported'}
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-gold)]/40 transition disabled:cursor-not-allowed disabled:opacity-40 ${speech.status === 'listening' ? 'bg-[var(--color-gold)] text-[var(--color-navy)]' : 'text-[var(--color-gold)] hover:bg-[var(--color-gold)]/12'}`}
                >
                  {speech.status === 'listening' ? <FiMicOff size={14} /> : <FiMic size={14} />}
                </button>
                <button
                  type="button"
                  aria-label={language === 'ar' ? 'إرسال' : 'Send'}
                  onClick={() => void sendDraft()}
                  disabled={sending || !draft.trim()}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-strong)] text-[var(--color-light)] transition hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FiSend size={14} />
                </button>
              </div>
              {speech.status === 'denied' ? (
                <p role="alert" className="mt-2 text-xs text-[#b91c1c]">تم رفض إذن الميكروفون. فعّل الإذن من إعدادات المتصفح ثم أعد المحاولة.</p>
              ) : null}
              {speech.status === 'unsupported' ? (
                <p className="mt-2 text-xs text-[var(--color-muted)]">الإدخال الصوتي غير مدعوم في هذا المتصفح. يمكنك الكتابة مباشرة.</p>
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

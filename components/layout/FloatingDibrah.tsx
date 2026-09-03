'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { FiMessageCircle, FiMic, FiMicOff, FiSend, FiX } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { useDibrahSpeech } from '@/components/layout/useDibrahSpeech';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { placeDabraLauncher, type DabraDockPreference, type DabraViewport } from '@/lib/dabra/floating-layout';

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

const floatingCopy = {
  ar: {
    unavailable: 'لا تتوفر حاليًا قوائم سوق منشورة كافية.', live: 'تتوفر قوائم سوق منشورة للاستكشاف، ويظل التأكيد حسب المسار الموضح لكل خدمة.', pilot: 'البيانات الحالية تجريبية أو ضمن نطاق الاختبار، وليست إثباتًا للتوفر الحي.',
    welcome: 'ياهلا، أنا الدبرة.', help: 'أقدر أساعدك باقتراح الخدمات المناسبة حسب الوجهة ونوع الرحلة.', fallback: 'لا تتوفر إجابة موثوقة حاليًا. جرّب إضافة الوجهة أو نوع الخدمة المطلوبة.',
    invalid: 'الرسالة غير صالحة، حاول صياغتها بشكل مختلف.', session: 'تعذر التحقق من الجلسة. حدّث الصفحة وحاول مرة أخرى.', unavailableChat: 'تعذر الاتصال بالدبرة حاليًا. حاول مرة أخرى لاحقًا.', network: 'تعذر الاتصال بالدبرة حاليًا. تحقّق من الاتصال بالإنترنت وحاول مرة أخرى.',
    drag: 'اسحب للتحريك - اسأل الدبرة', close: 'إغلاق لوحة الدبرة', assistant: 'مساعد السفر', status: 'مساعدة اختيارية', placeholder: 'ابدأ الكتابة', send: 'إرسال', micLanguage: 'لغة الميكروفون', stopMic: 'إيقاف الإدخال الصوتي', startMic: 'الإدخال الصوتي', stopListening: 'إيقاف الاستماع', tap: 'اضغط للتحدث', listening: 'جاري الاستماع...', denied: 'تعذر الوصول إلى الميكروفون. اسمح للمتصفح باستخدام الميكروفون ثم حاول مرة أخرى.', unsupported: 'الإدخال الصوتي غير مدعوم في هذا المتصفح. استخدم الكتابة أو متصفحًا يدعم Web Speech.',
    policyTitle: 'إخلاء مسؤولية وحدود الدبرة', policyOne: 'الدبرة مساعد سفر اختياري للتخطيط والمقارنة والوصول إلى بيانات سوق dir3com الموثقة. لا تُعد الردود تأكيدًا للتوفر أو السعر أو الحجز.', policyTwo: 'لا تنفّذ الدبرة الحجز أو الدفع أو الإلغاء أو الاسترداد أو أي إجراء غير قابل للعكس من تلقاء نفسها. موافقتك الصريحة والمتابعة عبر المسار الرسمي مطلوبة.', policyAgree: 'قرأت الشروط والأحكام وسياسة الخصوصية، وأفهم أن الدبرة لا تنفّذ المعاملات تلقائيًا.', continue: 'متابعة', friendly: 'مساعد السفر الودود', ask: 'اسأل الدبرة', title: 'الدبرة',
  },
  en: {
    unavailable: 'There are not enough published marketplace listings right now.', live: 'Published marketplace listings are available to explore; confirmation follows the flow shown for each service.', pilot: 'Current data is test or pilot data and is not proof of live availability.',
    welcome: 'Hello, I’m DABRA.', help: 'I can help you explore services by destination and trip type.', fallback: 'A reliable answer is not available right now. Try adding a destination or service type.',
    invalid: 'That message is invalid. Please phrase it differently.', session: 'Your session could not be verified. Refresh and try again.', unavailableChat: 'DABRA is temporarily unavailable. Please try again later.', network: 'DABRA could not be reached. Check your connection and try again.',
    drag: 'Drag to move — ask DABRA', close: 'Close DABRA panel', assistant: 'Travel assistant', status: 'Optional assistance', placeholder: 'Start typing', send: 'Send', micLanguage: 'Microphone language', stopMic: 'Stop voice input', startMic: 'Voice input', stopListening: 'Stop listening', tap: 'Tap to speak', listening: 'Listening...', denied: 'Microphone access was denied. Allow microphone access and try again.', unsupported: 'Voice input is not supported in this browser. Use typing or a browser with Web Speech support.',
    policyTitle: 'DABRA boundaries', policyOne: 'DABRA is an optional travel assistant for planning, comparison, and access to verified DIR3COM marketplace data. Replies are not confirmation of availability, price, or booking.', policyTwo: 'DABRA never books, pays, cancels, refunds, or performs irreversible actions on its own. Your explicit approval and the canonical flow are required.', policyAgree: 'I have read the Terms and Privacy Policy and understand that DABRA does not execute transactions automatically.', continue: 'Continue', friendly: 'Friendly travel assistant', ask: 'Ask DABRA', title: 'DABRA',
  },
} as const;

function buildSeedMessages(context: DibrahAssistantContext | null, language: 'ar' | 'en'): DibrahMessage[] {
  const t = floatingCopy[language];
  const sourceLine = context?.dataQuality === 'live-verified'
    ? t.live
    : context?.dataQuality === 'pilot-test'
      ? t.pilot
      : t.unavailable;

  return [
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content: `${t.welcome} ${sourceLine} ${t.help}`,
    },
  ];
}

function presentAssistantAnswer(answer: string | undefined, language: 'ar' | 'en') {
  const trimmed = answer?.trim();
  if (!trimmed) return floatingCopy[language].fallback;

  const exposesInternalFallback = [
    'قاعدة المعرفة الداخلية',
    'ضمن نطاق DIR3COM المعتمد',
    "I don't have a sufficiently authoritative source",
    'internal knowledge base',
  ].some((marker) => trimmed.includes(marker));

  return exposesInternalFallback
    ? floatingCopy[language].fallback
    : trimmed;
}

function detectConversationLanguage(text: string, fallback: 'ar' | 'en' = 'ar'): 'ar' | 'en' {
  if (/[\u0600-\u06ff]/.test(text)) return 'ar';
  if (/[a-z]/i.test(text)) return 'en';
  return fallback;
}

export default function FloatingDibrah() {
  const { language } = useLanguage();
  // A locale is a conversation boundary. Remount atomically, including history,
  // drafts, speech callbacks, errors and request refs, even for AR -> EN -> AR.
  return <FloatingDibrahSession key={language} language={language} />;
}

function FloatingDibrahSession({ language }: { language: 'ar' | 'en' }) {
  const t = floatingCopy[language];
  const positionStorageKey = `${DIBRAH_POSITION_STORAGE_KEY}:${language}`;
  const pathname = usePathname();
  const controlRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({ active: false, moved: false, pointerId: -1, startX: 0, startY: 0, originX: 0, originY: 0 });
  const pointerTargetRef = useRef<HTMLButtonElement | null>(null);
  const suppressClickRef = useRef(false);

  const [position, setPosition] = useState<{ x: number; y: number }>(DEFAULT_DIBRAH_POSITION);
  const [launcherVisible, setLauncherVisible] = useState(false);
  const [panelViewport, setPanelViewport] = useState<DabraViewport | null>(null);
  const dockPreferenceRef = useRef<DabraDockPreference | null>(null);
  const reclampRef = useRef<(() => void) | null>(null);
  const [dragging, setDragging] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyChecked, setPolicyChecked] = useState(false);
  const [, setAssistantContext] = useState<DibrahAssistantContext | null>(null);
  const [messages, setMessages] = useState<DibrahMessage[]>(() => buildSeedMessages(null, language));
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [micLanguage, setMicLanguage] = useState<'ar' | 'en'>(language);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const sendInFlightRef = useRef(false);
  const activeRequestIdRef = useRef<string | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    activeRequestIdRef.current = null;
    chatAbortRef.current?.abort();
  }, []);

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
      dockPreferenceRef.current = null;
      const stored = window.localStorage.getItem(positionStorageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Partial<DabraDockPreference>;
          if ((parsed.side === 'left' || parsed.side === 'right') && typeof parsed.bottomGap === 'number' && Number.isFinite(parsed.bottomGap)) {
            dockPreferenceRef.current = { side: parsed.side, bottomGap: Math.max(12, parsed.bottomGap) };
          }
        } catch {
          window.localStorage.removeItem(positionStorageKey);
        }
      }
    let frame = 0;
    const update = () => {
      frame = 0;
      const shell = controlRef.current;
      const launcher = shell?.querySelector<HTMLButtonElement>(':scope > button');
      if (!shell || !launcher) return;
      const vv = window.visualViewport;
      const viewport = { left: vv?.offsetLeft ?? 0, top: vv?.offsetTop ?? 0, width: vv?.width ?? window.innerWidth, height: vv?.height ?? window.innerHeight };
      const mobilePanel = window.innerWidth < 640 ? viewport : null;
      setPanelViewport(previous => JSON.stringify(previous) === JSON.stringify(mobilePanel) ? previous : mobilePanel);
      const obstacles = [...document.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [role="button"], [role="tab"], [role="dialog"], [role="menu"], header nav, [data-cookie-banner], [data-marketplace-critical-action]')]
        .filter(element => !shell.contains(element) && !element.closest('nextjs-portal') && getComputedStyle(element).visibility !== 'hidden')
        .map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
      const next = placeDabraLauncher({ language, viewport, width: launcher.offsetWidth, height: launcher.offsetHeight, obstacles, preference: dockPreferenceRef.current });
      if (!dragStateRef.current.active) {
        setPosition(previous => previous.x === next.x && previous.y === next.y ? previous : { x: next.x, y: next.y });
        setLauncherVisible(next.visible);
      }
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    reclampRef.current = schedule;
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'hidden', 'open'] });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      reclampRef.current = null;
    };
  }, [language, pathname, positionStorageKey]);

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
    const controller = new AbortController();
    async function loadAssistantContext() {
      try {
        const response = await fetch('/api/services?view=assistant', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as DibrahAssistantContext;
        if (controller.signal.aborted) return;
        setAssistantContext(payload);
        setMessages((previous) => (
          previous.length === 1 && previous[0]?.id === 'assistant-welcome'
            ? buildSeedMessages(payload, language)
            : previous
        ));
      } catch {
        if (!controller.signal.aborted) setAssistantContext(null);
      }
    }

    loadAssistantContext();
    return () => controller.abort();
  }, [language]);

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
        dockPreferenceRef.current = { side: snapToRight ? 'right' : 'left', bottomGap: window.innerHeight - next.y - controlRef.current.offsetHeight };
        window.localStorage.setItem(positionStorageKey, JSON.stringify(dockPreferenceRef.current));
        reclampRef.current?.();
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
  }, [clampPosition, positionStorageKey]);

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
      const controller = new AbortController();
      chatAbortRef.current = controller;
      const response = await fetch('/api/ai2/chat', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: trimmed, history: historyForRequest, locale: micLanguage }),
      });
      const payload = (await response.json().catch(() => ({}))) as { answer?: string; error?: string };
      if (controller.signal.aborted || activeRequestIdRef.current !== requestId) return;
      if (!response.ok) {
        if (response.status === 400) {
          setSendError(t.invalid);
        } else if (response.status === 401 || response.status === 403) {
          setSendError(t.session);
        } else {
          setSendError(t.unavailableChat);
        }
        return;
      }
      if (activeRequestIdRef.current !== requestId) return;
      setMessages((previous) => (
        previous.some((entry) => entry.id === assistantMessageId)
          ? previous
          : [...previous, { id: assistantMessageId, role: 'assistant', content: presentAssistantAnswer(payload.answer, micLanguage) }]
      ));
    } catch {
      if (activeRequestIdRef.current === requestId && !chatAbortRef.current?.signal.aborted) setSendError(t.network);
    } finally {
      if (activeRequestIdRef.current === requestId) {
        activeRequestIdRef.current = null;
        sendInFlightRef.current = false;
        setSending(false);
        window.requestAnimationFrame(() => draftRef.current?.focus());
      }
    }
  }, [draft, sending, messages, micLanguage, t]);

  return (
    <div
      ref={controlRef}
      id="dibrah"
      data-dabra-runtime="canonical-v2"
      className={`group fixed z-50 select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ left: position.x, top: position.y }}
    >
      <span className="pointer-events-none absolute -top-12 right-0 hidden whitespace-nowrap rounded-full border border-[var(--color-gold)]/25 bg-[var(--color-surface-strong)] px-3 py-2 text-xs font-medium text-[var(--color-light)] shadow-[0_10px_30px_rgba(13,27,42,0.3)] group-hover:block group-focus-within:block">
        {t.drag}
      </span>

      {panelOpen ? (
        <div style={panelViewport ? { top: panelViewport.top, left: panelViewport.left, width: panelViewport.width, height: panelViewport.height, bottom: 'auto', right: 'auto' } : undefined} className={`dabra-panel-shell fixed inset-0 z-50 sm:inset-auto sm:bottom-5 sm:h-[min(82dvh,780px)] sm:w-[min(94vw,600px)] ${language === 'ar' ? 'sm:left-5' : 'sm:right-5'}`}>
          <div className="dabra-panel flex h-full flex-col overflow-hidden border border-[#d7bd82] bg-[#fffdf8] shadow-[0_30px_80px_rgba(13,27,42,0.34)] sm:rounded-[24px]">
            <div className="flex items-center justify-between border-b border-[#dfd4bd] bg-[#fffaf0] px-4 py-3.5 sm:px-5">
              <div>
                <p className="text-xs font-bold tracking-[0.2em] text-[#946b1f]">{t.assistant}</p>
                <p className="mt-1 text-base font-bold text-[#13243a]">{t.title}</p>
                <p className="mt-0.5 text-[11px] font-medium text-[#64748b]">{t.status}</p>
              </div>
              <button
                type="button"
                aria-label={t.close}
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
                  placeholder={t.placeholder}
                  className="dabra-composer w-full resize-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-[15px] leading-6 text-[#14243a] placeholder:text-[#718096] outline-none"
                />
                <div className="mb-1 flex shrink-0 overflow-hidden rounded-full border border-[#d7bd82] bg-[#fffaf0] text-[10px] font-bold" aria-label={t.micLanguage}>
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
                  aria-label={speech.status === 'listening' ? t.stopMic : t.startMic}
                  aria-pressed={speech.status === 'listening'}
                  onClick={() => (speech.status === 'listening' ? speech.stopListening() : speech.startListening())}
                  disabled={speech.status === 'unsupported'}
                  title={speech.status === 'listening' ? t.stopListening : t.tap}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-gold)]/55 transition disabled:cursor-not-allowed disabled:opacity-40 ${speech.status === 'listening' ? 'dabra-mic--listening bg-[var(--color-gold)] text-[var(--color-navy)]' : 'bg-white text-[var(--color-gold)] hover:bg-[var(--color-gold)]/12'}`}
                >
                  {speech.status === 'listening' ? <FiMicOff size={14} /> : <FiMic size={14} />}
                </button>
                <button
                  type="button"
                  aria-label={t.send}
                  onClick={() => void sendDraft()}
                  disabled={sending || !draft.trim()}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-strong)] text-[var(--color-light)] transition hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FiSend size={14} />
                </button>
              </div>
              <p className={`mt-2 text-xs ${speech.status === 'listening' ? 'font-semibold text-[#946b1f]' : 'text-[#64748b]'}`} aria-live="polite">
                {speech.status === 'listening'
                  ? t.listening
                  : speech.status === 'idle'
                    ? t.tap
                    : null}
                {speech.interimTranscript ? ` ${speech.interimTranscript}` : ''}
              </p>
              {speech.status === 'denied' ? (
                <p role="alert" className="mt-2 text-xs text-[#b91c1c]">{t.denied}</p>
              ) : null}
              {speech.status === 'unsupported' ? (
                <p className="mt-2 text-xs text-[var(--color-muted)]">{t.unsupported}</p>
              ) : null}
            </div>
          </div>
          {policyOpen ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[24px] bg-[var(--color-surface-strong)]/35 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="dabra-policy-title">
              <div className="flex max-h-full w-full flex-col overflow-hidden rounded-[20px] border border-[var(--color-gold)]/30 bg-[var(--color-shell)] shadow-[0_24px_60px_rgba(13,27,42,0.3)]" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                <div className="shrink-0 border-b border-[color:var(--color-border)] px-4 py-3"><h2 id="dabra-policy-title" className="text-lg font-semibold text-[var(--color-navy)]">{t.policyTitle}</h2></div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm leading-7 text-[var(--color-muted)]">
                  <p>{t.policyOne}</p>
                  <p className="mt-3">{t.policyTwo}</p>
                  <label className="mt-4 flex items-start gap-3 text-[var(--color-navy)]"><input type="checkbox" checked={policyChecked} onChange={(event) => setPolicyChecked(event.target.checked)} className="mt-1 h-4 w-4" /><span>{t.policyAgree} <Link href="/terms" className="font-semibold text-[var(--color-gold)] underline">{language === 'ar' ? 'الشروط' : 'Terms'}</Link> · <Link href="/privacy" className="font-semibold text-[var(--color-gold)] underline">{language === 'ar' ? 'الخصوصية' : 'Privacy'}</Link></span></label>
                </div>
                <div className="shrink-0 border-t border-[color:var(--color-border)] px-4 py-3"><button type="button" onClick={acceptPolicy} disabled={!policyChecked} className="w-full rounded-xl bg-[var(--color-gold)] px-4 py-3 text-sm font-semibold text-[var(--color-navy)] disabled:cursor-not-allowed disabled:opacity-40">{t.continue}</button></div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        style={{ visibility: launcherVisible && !panelOpen ? 'visible' : 'hidden' }}
        aria-hidden={!launcherVisible || panelOpen}
        tabIndex={launcherVisible && !panelOpen ? 0 : -1}
        title={t.ask}
        aria-label={t.title}
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
            <HiSparkles /> {t.friendly}
          </span>
          <span className="text-sm font-semibold">{t.title}</span>
          <span className="text-[11px] text-[var(--color-light)]/70">{t.ask}</span>
        </span>
      </button>
    </div>
  );
}

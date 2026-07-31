'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { FiExternalLink, FiMessageCircle, FiSend, FiX } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import { subtleEasing } from '@/components/shared/motion';

type DibrahAssistantContext = {
  source: 'supabase' | 'api' | 'fallback';
  hasRealData: boolean;
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

function buildSeedMessages(context: DibrahAssistantContext | null): DibrahMessage[] {
  const sourceLine = context?.hasRealData ? 'البيانات الحالية مرتبطة بسوق حي.' : 'حالياً نعرض كتالوجاً احتياطياً حتى اكتمال الربط.';

  return [
    {
      id: 'assistant-welcome',
      role: 'assistant',
      content: `ياهلا، أنا الدبرة. ${sourceLine} أقدر أساعدك باقتراح الخدمات المناسبة حسب الوجهة ونوع الرحلة.`,
    },
  ];
}

export default function FloatingDibrah() {
  const controlRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({ active: false, moved: false, startX: 0, startY: 0 });
  const pointerOffsetRef = useRef({ x: 0, y: 0 });

  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    if (typeof window === 'undefined') {
      return { x: 12, y: 120 };
    }

    return {
      x: Math.max(window.innerWidth - 248, 12),
      y: Math.max(window.innerHeight - 124, 84),
    };
  });
  const [dragging, setDragging] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [assistantContext, setAssistantContext] = useState<DibrahAssistantContext | null>(null);
  const [messages, setMessages] = useState<DibrahMessage[]>(() => buildSeedMessages(null));
  const [draft, setDraft] = useState('');

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
    if (!dragStateRef.current.active) return;

    const handleMove = (event: PointerEvent) => {
      const deltaX = Math.abs(event.clientX - dragStateRef.current.startX);
      const deltaY = Math.abs(event.clientY - dragStateRef.current.startY);

      if (!dragStateRef.current.moved && deltaX + deltaY > 5) {
        dragStateRef.current.moved = true;
        setDragging(true);
      }

      if (!dragStateRef.current.moved) {
        return;
      }

      setPosition(clampPosition(event.clientX - pointerOffsetRef.current.x, event.clientY - pointerOffsetRef.current.y));
    };

    const handleUp = () => {
      dragStateRef.current.active = false;

      if (!dragStateRef.current.moved) {
        return;
      }

      setDragging(false);
      setPosition((previous) => {
        if (!controlRef.current) return previous;

        const width = controlRef.current.offsetWidth;
        const snapToRight = previous.x + width / 2 > window.innerWidth / 2;
        const snappedX = snapToRight ? window.innerWidth - width - 12 : 12;
        return clampPosition(snappedX, previous.y);
      });

      window.setTimeout(() => {
        dragStateRef.current.moved = false;
      }, 0);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [clampPosition]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!controlRef.current) return;

    const rect = controlRef.current.getBoundingClientRect();
    dragStateRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    };
    pointerOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const isPanelOnLeft = position.x > (typeof window === 'undefined' ? 0 : window.innerWidth * 0.55);

  const panelPositionClass = isPanelOnLeft
    ? 'right-0 translate-x-[-104%] sm:translate-x-[-108%]'
    : 'left-0 translate-x-[0%] sm:translate-x-[108%]';

  const quickLinks = useMemo(() => assistantContext?.topServices.slice(0, 3) ?? [], [assistantContext]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.45, ease: subtleEasing }}
      whileHover={{ y: -2 }}
      ref={controlRef}
      id="dibrah"
      className={`group fixed z-50 select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{ left: position.x, top: position.y }}
    >
      <span className="pointer-events-none absolute -top-12 right-0 hidden whitespace-nowrap rounded-full border border-[var(--color-gold)]/25 bg-[var(--color-navy)] px-3 py-2 text-xs font-medium text-[var(--color-light)] shadow-[0_10px_30px_rgba(13,27,42,0.3)] group-hover:block group-focus-within:block">
        اسحب للتحريك - اسأل الدبرة
      </span>

      {panelOpen ? (
        <div className={`absolute top-0 w-[min(86vw,360px)] ${panelPositionClass}`}>
          <div className="overflow-hidden rounded-[24px] border border-[var(--color-gold)]/25 bg-[var(--color-shell)]/95 shadow-[0_30px_70px_rgba(13,27,42,0.26)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-4 py-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-[var(--color-gold)]">DIBRAH ASSISTANT</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-navy)]">الدبرة</p>
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

            <div className="max-h-[62vh] overflow-y-auto px-4 py-3">
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/10 px-3 py-1.5 text-[var(--color-navy)]">
                  {assistantContext?.hasRealData ? 'Live Marketplace' : 'Fallback Mode'}
                </span>
                <span className="rounded-full border border-[color:var(--color-border)] bg-white/70 px-3 py-1.5 text-[var(--color-muted)]">
                  {assistantContext?.totalServices ?? 0} خدمة
                </span>
              </div>

              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-[16px] px-3 py-2 text-sm leading-7 ${
                      message.role === 'assistant'
                        ? 'border border-[color:var(--color-border)] bg-white/75 text-[var(--color-navy)]'
                        : 'bg-[var(--color-navy)] text-[var(--color-light)]'
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
            </div>

            <div className="border-t border-[color:var(--color-border)] px-4 py-3">
              <div className="flex items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-white/70 px-3 py-2">
                <FiMessageCircle className="text-[var(--color-gold)]" />
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="اكتب سؤالك... (واجهة جاهزة لربط LLM)"
                  className="w-full bg-transparent text-sm text-[var(--color-navy)] outline-none"
                />
                <button
                  type="button"
                  aria-label="إرسال"
                  onClick={() => {
                    if (!draft.trim()) return;

                    const userMessage: DibrahMessage = {
                      id: `user-${Date.now()}`,
                      role: 'user',
                      content: draft.trim(),
                    };

                    const assistantReply: DibrahMessage = {
                      id: `assistant-${Date.now()}`,
                      role: 'assistant',
                      content:
                        'تم تسجيل سؤالك. في DEV-020 سنربط هذه الواجهة بمحرك LLM فعلي مع سياق السوق المباشر.',
                    };

                    setMessages((previous) => [...previous, userMessage, assistantReply]);
                    setDraft('');
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-navy)] text-[var(--color-light)] transition hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)]"
                >
                  <FiSend size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        title="اسأل الدبرة"
        aria-label="الدبرة"
        onPointerDown={handlePointerDown}
        onClick={(event) => {
          event.stopPropagation();
          if (dragStateRef.current.moved) return;
          setPanelOpen((previous) => !previous);
        }}
        className="group relative flex min-h-14 items-center gap-3 overflow-hidden rounded-full border border-[var(--color-gold)]/40 bg-[linear-gradient(150deg,#0d1b2a_0%,#163149_100%)] px-3 py-3 text-right text-[var(--color-light)] shadow-[0_26px_56px_rgba(13,27,42,0.3)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45"
      >
        <span className="pointer-events-none absolute -right-4 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-[var(--color-gold)]/20 blur-2xl" />
        <span className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(180deg,#f7e9c0_0%,#d4af37_100%)]">
          <span className="absolute top-1 h-3 w-9 rounded-full bg-[#9B1C31] opacity-85" />
          <span className="absolute top-3 h-5 w-10 rounded-b-[14px] rounded-t-sm bg-white/85" />
          <span className="absolute bottom-1 h-5 w-5 rounded-full bg-[#F5D8BF]" />
        </span>
        <span className="hidden flex-col sm:flex">
          <span className="inline-flex items-center gap-2 text-xs text-[var(--color-gold)]">
            <HiSparkles /> مساعد السفر الودود
          </span>
          <span className="text-sm font-semibold">الدبرة</span>
          <span className="text-[11px] text-[var(--color-light)]/70">اسأل الدبرة</span>
        </span>
      </button>
    </motion.div>
  );
}

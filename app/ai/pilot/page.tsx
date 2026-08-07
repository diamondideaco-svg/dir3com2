import DabraJourneyPanel from '@/components/ai2/DabraJourneyPanel';
import { PilotChatPanel } from '@/components/ai2/PilotChatPanel';
import { requirePilotPageAccess } from '@/lib/auth/pilot';
import { FiMessageSquare, FiShield } from 'react-icons/fi';

export default async function AiPilotPage() {
  await requirePilotPageAccess('/ai/pilot');

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(160deg,rgba(13,27,42,0.96)_0%,rgba(22,44,65,0.95)_100%)] px-6 py-8 text-[var(--color-light)] shadow-[0_28px_70px_rgba(13,27,42,0.28)] sm:px-8 lg:px-10">
        <div className="flex flex-wrap items-center gap-3 text-sm text-white/72">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-gold)]/25 bg-[var(--color-gold)]/12 px-4 py-2 text-[var(--color-gold)]">
            <FiShield /> Safe pilot
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">Read-only assistant surface</span>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">Arabic-first, English-ready</span>
        </div>

        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold tracking-[0.24em] text-[var(--color-gold)]" translate="no">
              DABRA JOURNEY
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">من الترحيب حتى التأكيد، في مسار واحد واضح</h1>
            <p className="mt-4 text-sm leading-8 text-white/72 sm:text-base">
              هذه الصفحة تعرض رحلة DABRA التشغيلية الثابتة مع الحالات اللازمة للتحميل، الانقطاع، انتهاء الجلسة، عدم وجود نتائج، وتعذر التحديد، من دون تنفيذ كتابة أو دفع.
            </p>
          </div>

          <a
            href="#pilot-chat"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/14 px-5 text-sm font-semibold text-[var(--color-light)] transition hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:bg-[var(--color-gold)]/20"
          >
            <FiMessageSquare />
            افتح الدبرة
          </a>
        </div>
      </section>

      <DabraJourneyPanel />

      <section id="pilot-chat">
        <PilotChatPanel />
      </section>
    </div>
  );
}

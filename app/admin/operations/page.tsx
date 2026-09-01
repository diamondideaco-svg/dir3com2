import { OperationSummaryCards } from '@/components/admin/OperationSummaryCards';
import { NotificationTable } from '@/components/admin/NotificationTable';
import { AuditTable } from '@/components/admin/AuditTable';
import { Timeline } from '@/components/admin/Timeline';
import { EventLogTable } from '@/components/admin/EventLogTable';
import { MarketplaceRequestOperationsTable } from '@/components/admin/MarketplaceRequestOperationsTable';
import { AdminText } from '@/components/admin/AdminLocale';

export const metadata = {
  title: 'Operations Engine | DIR3COM',
};

const resultMessages: Record<string, string> = {
  notification_sent: 'تم إرسال الإشعار بنجاح.',
  audit_created: 'تم إنشاء سجل التدقيق بنجاح.',
};

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const params = await searchParams;
  const resultMessage = params?.result ? resultMessages[params.result] : null;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
        <p className="text-sm uppercase tracking-[0.3em] text-gold-400"><AdminText ar="محرك عمليات DIR3" en="DIR3 Operations Engine" /></p>
        <h1 className="mt-2 text-3xl font-semibold"><AdminText ar="الإشعارات والتدقيق والخط الزمني وأحداث النظام" en="Notifications, audit, timeline, and system events" /></h1>
        <p className="mt-3 max-w-3xl text-[var(--color-muted)]"><AdminText ar="كل إجراء مهم قابل للتتبع عبر العمود التشغيلي الموحّد للمنصة." en="Every important action in the platform is traceable through one operational backbone." /></p>
        </div>

        {resultMessage ? (
          <div className="rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">{resultMessage}</div>
        ) : null}

        <OperationSummaryCards />
        <MarketplaceRequestOperationsTable />

        <div className="grid gap-6 lg:grid-cols-2">
          <NotificationTable />
          <AuditTable />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Timeline />
          <EventLogTable />
        </div>
      </div>
    </main>
  );
}

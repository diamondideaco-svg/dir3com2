import { NotificationTable } from '@/components/admin/NotificationTable';
import { AdminText } from '@/components/admin/AdminLocale';

export const metadata = {
  title: 'Notifications | DIR3COM',
};

export default function NotificationsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-[var(--color-navy)]">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-semibold"><AdminText ar="الإشعارات" en="Notifications" /></h1>
        <p className="mt-2 text-[var(--color-muted)]"><AdminText ar="راجع الرسائل عبر البريد والرسائل النصية وواتساب والإشعارات الفورية." en="Dispatch and review messages across email, SMS, WhatsApp, and push channels." /></p>
        <div className="mt-6">
          <NotificationTable />
        </div>
      </div>
    </main>
  );
}

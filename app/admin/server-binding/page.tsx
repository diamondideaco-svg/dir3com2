import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import { readServerBindingDiagnostic } from '@/lib/admin/server-binding-diagnostic';

export const metadata: Metadata = {
  title: 'ربط قاعدة الخادم | Server database binding',
  robots: { index: false, follow: false },
};

export default async function ServerBindingPage() {
  await connection();
  const result = await readServerBindingDiagnostic();
  if (result.status === 'anonymous') {
    const destination = encodeURIComponent('/admin/server-binding');
    redirect('/login?redirect=' + destination + '&next=' + destination);
  }
  if (result.status === 'forbidden') notFound();
  if (result.status !== 'verified') {
    return <section className="p-6"><h1>تعذّر إثبات الربط / Binding unavailable</h1>
      <p>هوية النشر أو تهيئة الخادم غير متاحة. / Deployment identity or server configuration is unavailable.</p></section>;
  }

  const rows = [
    ['قاعدة الخادم / Server database', result.hostname],
    ['النشر / Deployment', result.deployment.deploymentId],
    ['عنوان النشر / Deployment URL', result.deployment.deploymentUrl],
    ['Commit SHA', result.deployment.sha],
    ['وقت القراءة / Observed at', result.observedAt],
  ];
  return <section className="space-y-4 p-6">
    <h1 className="text-xl font-semibold">ربط قاعدة الخادم / Server database binding</h1>
    <dl className="space-y-3">{rows.map(([label, value]) => <div key={label}>
      <dt className="font-medium">{label}</dt>
      <dd dir="ltr" className="break-all">{value}</dd>
    </div>)}</dl>
  </section>;
}

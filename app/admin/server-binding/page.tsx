import type { Metadata } from 'next';
import { connection } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import { readServerBindingDiagnostic } from '@/lib/admin/server-binding-diagnostic';
import { readWorkerBindingSetup } from '@/lib/admin/drive-worker-binding-setup';
import { isBindingApprovalId } from '@/lib/admin/drive-worker-binding-ui';
import DriveWorkerBindingSetup from '@/components/admin/DriveWorkerBindingSetup';

export const metadata: Metadata = {
  title: 'ربط قاعدة الخادم | Server database binding',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function ServerBindingPage({ searchParams }: {
  searchParams: Promise<{ setup?: string | string[] }>;
}) {
  await connection();
  const setupId = (await searchParams).setup;
  const result = await readServerBindingDiagnostic();
  if (result.status === 'anonymous') {
    const returnPath = '/admin/server-binding' + (isBindingApprovalId(setupId) ? '?setup=' + setupId : '');
    const destination = encodeURIComponent(returnPath);
    redirect('/login?redirect=' + destination + '&next=' + destination);
  }
  if (result.status === 'forbidden') notFound();
  if (result.status !== 'verified') {
    return <section className="p-6"><h1>تعذّر إثبات الربط / Binding unavailable</h1>
      <p>هوية النشر أو تهيئة الخادم غير متاحة. / Deployment identity or server configuration is unavailable.</p></section>;
  }

  const setup = await readWorkerBindingSetup(setupId);
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
    <DriveWorkerBindingSetup key={setup.approvalId ?? 'unavailable'} {...setup} />
  </section>;
}

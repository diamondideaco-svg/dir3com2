import { connection } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isCeoActor } from '@/lib/auth/team-access';
import { TrialControls } from './controls';

export const metadata = { title: 'Task199 | One trial', robots: { index: false, follow: false } };
export default async function Task199TrialPage() {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/login?redirect=%2Fadmin%2Ftask199-trial&next=%2Fadmin%2Ftask199-trial');
  if (!(await isCeoActor(supabase, user))) notFound();
  return <section className="space-y-6 p-6">
    <h1>Task199: تجربة واحدة / One trial</h1>
    <p dir="ltr">REQ-2B9F59690ED6D0A57098</p>
    <p>تشغيل مؤقت ومحدد لهذا الطلب فقط. / Temporary operation for this request only.</p>
    <p>فتح النافذة لا يفعّل إعداد الإرسال في قاعدة البيانات. / Opening the window does not enable the database send setting.</p>
    <TrialControls />
  </section>;
}

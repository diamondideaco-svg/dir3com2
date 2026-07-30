'use client';

import { useState } from 'react';
import { FiCheckCircle, FiMail, FiMessageSquare, FiPhoneCall, FiSend, FiUser } from 'react-icons/fi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PublicHero from '@/components/public/PublicHero';
import PublicRouteIndex from '@/components/public/PublicRouteIndex';
import PublicStats from '@/components/public/PublicStats';

type ContactStatus = {
  type: 'success' | 'error' | null;
  message: string;
};

export default function ContactPublicPage() {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<ContactStatus>({ type: null, message: '' });

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: null, message: '' });

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'حدث خطأ غير متوقع');
      }

      setStatus({ type: 'success', message: 'تم إرسال رسالتك بنجاح. سيتواصل معك فريق dir3com قريباً.' });
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'تعذر إرسال الرسالة حالياً.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pb-24">
      <PublicHero
        eyebrow="CONTACT DIR3COM"
        title="تواصل معنا"
        description="قنوات التواصل مصممة ضمن نفس الهوية الراقية، مع نموذج واضح ومسارات جاهزة للتكامل المستقبلي دون تغيير في الواجهة العامة."
        highlight="الفريق حاضر، والواجهة واضحة، والدبرة يبقى عنصراً بصرياً فقط في هذه المرحلة."
        chips={['0532867009', 'dir3com.com', 'Response Ready']}
      />
      <PublicStats
        stats={[
          { label: 'الهاتف الرسمي', value: '0532867009' },
          { label: 'زمن الاستجابة', value: '24h' },
          { label: 'لغة التجربة', value: 'Arabic RTL' },
        ]}
      />

      <section className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="bg-white/84">
            <CardHeader>
              <CardTitle className="text-3xl">أرسل رسالتك</CardTitle>
            </CardHeader>
            <CardContent>
              {status.type && (
                <div className={`mb-5 rounded-[22px] border px-4 py-4 text-sm ${status.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                  {status.message}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 inline-flex items-center gap-2 text-sm text-[var(--color-muted)]"><FiUser /> الاسم الكامل</span>
                    <input name="name" required value={formData.name} onChange={handleChange} className="w-full rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3 text-[var(--color-navy)] outline-none transition focus:border-[var(--color-gold)]" />
                  </label>
                  <label className="block">
                    <span className="mb-2 inline-flex items-center gap-2 text-sm text-[var(--color-muted)]"><FiMail /> البريد الإلكتروني</span>
                    <input type="email" name="email" required value={formData.email} onChange={handleChange} className="w-full rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3 text-[var(--color-navy)] outline-none transition focus:border-[var(--color-gold)]" />
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 inline-flex items-center gap-2 text-sm text-[var(--color-muted)]"><FiPhoneCall /> الهاتف</span>
                    <input name="phone" value={formData.phone} onChange={handleChange} className="w-full rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3 text-[var(--color-navy)] outline-none transition focus:border-[var(--color-gold)]" />
                  </label>
                  <label className="block">
                    <span className="mb-2 inline-flex items-center gap-2 text-sm text-[var(--color-muted)]"><FiMessageSquare /> الموضوع</span>
                    <select name="subject" required value={formData.subject} onChange={handleChange} className="w-full rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3 text-[var(--color-navy)] outline-none transition focus:border-[var(--color-gold)]">
                      <option value="">اختر الموضوع</option>
                      <option value="booking">استفسار عن حجز</option>
                      <option value="service">استفسار عن خدمة</option>
                      <option value="partnership">طلب شراكة</option>
                      <option value="other">أخرى</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 inline-flex items-center gap-2 text-sm text-[var(--color-muted)]"><FiMessageSquare /> الرسالة</span>
                  <textarea name="message" required rows={6} value={formData.message} onChange={handleChange} className="w-full rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3 text-[var(--color-navy)] outline-none transition focus:border-[var(--color-gold)]" />
                </label>

                <Button type="submit" variant="gold" size="lg" disabled={isSubmitting} className="w-full sm:w-auto">
                  <FiSend />
                  {isSubmitting ? 'جاري الإرسال...' : 'إرسال الرسالة'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-5">
            {[
              { title: 'الهاتف', value: '0532867009', hint: 'متاح للرد والمتابعة', icon: FiPhoneCall },
              { title: 'البريد', value: 'hello@dir3com.com', hint: 'تواصل منظم واستجابة واضحة', icon: FiMail },
              { title: 'ضمان الدرع', value: 'الخدمة أولاً', hint: 'فلوسك محفوظة لين تقول: تم.', icon: FiCheckCircle },
            ].map(({ title, value, hint, icon: Icon }) => (
              <Card key={title} className="bg-white/84">
                <CardContent className="flex items-center gap-4 p-6">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-surface)] text-[var(--color-gold)]">
                    <Icon size={22} />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-[var(--color-navy)]">{title}</p>
                    <p className="mt-1 text-sm font-medium text-[var(--color-navy)]">{value}</p>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{hint}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <PublicRouteIndex />
    </div>
  );
}
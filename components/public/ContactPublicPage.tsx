'use client';

import { useState } from 'react';
import { FiCheckCircle, FiMail, FiPhoneCall, FiSend } from 'react-icons/fi';
import { ContentContainer, SectionContainer, SelectField, TextAreaField, TextField } from '@/components/design-system';
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

      <SectionContainer className="py-8 lg:py-10">
        <ContentContainer className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
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
                  <TextField
                    label="الاسم الكامل"
                    required
                    value={formData.name}
                    onChange={(value) => setFormData((prev) => ({ ...prev, name: value }))}
                    placeholder="اكتب اسمك"
                  />
                  <TextField
                    label="البريد الإلكتروني"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(value) => setFormData((prev) => ({ ...prev, email: value }))}
                    placeholder="name@example.com"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    label="الهاتف"
                    type="tel"
                    value={formData.phone}
                    onChange={(value) => setFormData((prev) => ({ ...prev, phone: value }))}
                    placeholder="05xxxxxxxx"
                  />
                  <SelectField
                    label="الموضوع"
                    required
                    value={formData.subject}
                    onChange={(value) => setFormData((prev) => ({ ...prev, subject: value }))}
                    options={[
                      { value: '', label: 'اختر الموضوع' },
                      { value: 'booking', label: 'استفسار عن حجز' },
                      { value: 'service', label: 'استفسار عن خدمة' },
                      { value: 'partnership', label: 'طلب شراكة' },
                      { value: 'other', label: 'أخرى' },
                    ]}
                  />
                </div>

                <TextAreaField
                  label="الرسالة"
                  required
                  value={formData.message}
                  onChange={(value) => setFormData((prev) => ({ ...prev, message: value }))}
                  rows={6}
                  placeholder="اكتب تفاصيل طلبك"
                />

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
        </ContentContainer>
      </SectionContainer>

      <PublicRouteIndex />
    </div>
  );
}
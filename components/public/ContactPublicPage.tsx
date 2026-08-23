'use client';

import { useState } from 'react';
import { FiCheckCircle, FiMail, FiPhoneCall, FiSend } from 'react-icons/fi';
import { ContentContainer, SectionContainer, SelectField, TextAreaField, TextField } from '@/components/design-system';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PublicHero from '@/components/public/PublicHero';
import PublicStats from '@/components/public/PublicStats';
import { useLanguage } from '@/components/i18n/LanguageProvider';

type ContactStatus = {
  type: 'success' | 'error' | null;
  message: string;
};

const contactCopy = {
  ar: { eyebrow: 'تواصل مع dir3com', chips: ['0532867009', 'dir3com.com', 'جاهزون للرد'], stats: [{ label: 'الهاتف الرسمي', value: '0532867009' }, { label: 'زمن الاستجابة', value: '24 ساعة' }, { label: 'لغة التجربة', value: 'العربية' }], formTitle: 'أرسل رسالتك', name: 'الاسم الكامل', namePlaceholder: 'اكتب اسمك', email: 'البريد الإلكتروني', phone: 'الهاتف', subject: 'الموضوع', message: 'الرسالة', messagePlaceholder: 'اكتب تفاصيل طلبك', send: 'إرسال الرسالة', sending: 'جاري الإرسال...', success: 'تم إرسال رسالتك بنجاح. سيتواصل معك فريق dir3com قريباً.', error: 'تعذر إرسال الرسالة حالياً.', subjectOptions: [{ value: '', label: 'اختر الموضوع' }, { value: 'booking', label: 'استفسار عن حجز' }, { value: 'service', label: 'استفسار عن خدمة' }, { value: 'partnership', label: 'طلب شراكة' }, { value: 'other', label: 'أخرى' }], cards: [{ title: 'الهاتف', value: '0532867009', hint: 'متاح للرد والمتابعة' }, { title: 'البريد', value: 'hello@dir3com.com', hint: 'تواصل منظم واستجابة واضحة' }, { title: 'ضمان الدرع', value: 'الخدمة أولاً', hint: 'فلوسك محفوظة لين تقول: تم.' }] },
  en: { eyebrow: 'Contact dir3com', chips: ['0532867009', 'dir3com.com', 'Ready to respond'], stats: [{ label: 'Official phone', value: '0532867009' }, { label: 'Response time', value: '24 hours' }, { label: 'Experience language', value: 'Arabic and English' }], formTitle: 'Send your message', name: 'Full name', namePlaceholder: 'Write your name', email: 'Email', phone: 'Phone', subject: 'Subject', message: 'Message', messagePlaceholder: 'Write the details of your request', send: 'Send message', sending: 'Sending...', success: 'Your message was sent successfully. The dir3com team will contact you soon.', error: 'Your message could not be sent right now.', subjectOptions: [{ value: '', label: 'Choose a subject' }, { value: 'booking', label: 'Booking question' }, { value: 'service', label: 'Service question' }, { value: 'partnership', label: 'Partnership request' }, { value: 'other', label: 'Other' }], cards: [{ title: 'Phone', value: '0532867009', hint: 'Available for replies and follow-up' }, { title: 'Email', value: 'hello@dir3com.com', hint: 'Organized contact with a clear response' }, { title: 'Shield assurance', value: 'Service first', hint: 'Your money stays protected until you are satisfied.' }] },
} as const;

const contactCards = [
  { title: 'الهاتف', value: '0532867009', hint: 'متاح للرد والمتابعة', icon: FiPhoneCall },
  { title: 'البريد', value: 'hello@dir3com.com', hint: 'تواصل منظم واستجابة واضحة', icon: FiMail },
  { title: 'ضمان الدرع', value: 'الخدمة أولاً', hint: 'فلوسك محفوظة لين تقول: تم.', icon: FiCheckCircle },
];

export default function ContactPublicPage() {
  const { language } = useLanguage();
  const t = contactCopy[language];
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
        throw new Error(data.error || t.error);
      }

      setStatus({ type: 'success', message: t.success });
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : t.error,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-stack-shell">
      <PublicHero
        eyebrow={t.eyebrow}
        title={language === 'ar' ? 'تواصل معنا' : 'Contact us'}
        description=""
        highlight=""
        chips={[...t.chips]}
      />
      <PublicStats stats={[...t.stats]} />

      <SectionContainer className="py-8 lg:py-10">
        <ContentContainer className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Card className="bg-white/84">
            <CardHeader>
              <CardTitle className="text-3xl">{t.formTitle}</CardTitle>
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
                    label={t.name}
                    required
                    value={formData.name}
                    onChange={(value) => setFormData((prev) => ({ ...prev, name: value }))}
                    placeholder={t.namePlaceholder}
                  />
                  <TextField
                    label={t.email}
                    type="email"
                    required
                    value={formData.email}
                    onChange={(value) => setFormData((prev) => ({ ...prev, email: value }))}
                    placeholder="name@example.com"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    label={t.phone}
                    type="tel"
                    value={formData.phone}
                    onChange={(value) => setFormData((prev) => ({ ...prev, phone: value }))}
                    placeholder="05xxxxxxxx"
                  />
                  <SelectField
                    label={t.subject}
                    required
                    value={formData.subject}
                    onChange={(value) => setFormData((prev) => ({ ...prev, subject: value }))}
                    options={[...t.subjectOptions]}
                  />
                </div>

                <TextAreaField
                  label={t.message}
                  required
                  value={formData.message}
                  onChange={(value) => setFormData((prev) => ({ ...prev, message: value }))}
                  rows={6}
                  placeholder={t.messagePlaceholder}
                />

                <Button type="submit" variant="gold" size="lg" disabled={isSubmitting} className="w-full sm:w-auto">
                  <FiSend />
                  {isSubmitting ? t.sending : t.send}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-5">
            {contactCards.map(({ icon: Icon }, index) => {
              const card = t.cards[index];
              return (
                <Card key={card.title} className="bg-white/84">
                <CardContent className="flex items-center gap-4 p-6">
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-surface)] text-[var(--color-gold)]">
                    <Icon size={22} />
                  </span>
                  <div>
                    <p className="text-lg font-semibold text-[var(--color-navy)]">{card.title}</p>
                    <p className="mt-1 text-sm font-medium text-[var(--color-navy)]">{card.value}</p>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{card.hint}</p>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        </ContentContainer>
      </SectionContainer>

    </div>
  );
}

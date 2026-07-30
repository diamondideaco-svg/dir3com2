'use client';

import { motion } from 'framer-motion';
import { FiCalendar, FiMapPin, FiSearch, FiShield, FiUsers } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import SectionHeading from '@/components/home/SectionHeading';
import { quickFilters, searchFields, smartPrompts } from '@/components/home/dir3-home-data';
import { fadeUpItem, revealViewport, sectionStagger, subtleEasing } from '@/components/shared/motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const icons = [FiMapPin, FiShield, FiCalendar, FiUsers];

export default function SmartSearch() {
  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="SMART SEARCH"
          title="بحث ذكي جاهز لعرض الرحلات والخدمات بوضوح أنيق."
          description="اسأل الدبرة. واجهة بحث مرنة تجهز أنواع الخدمات والبيانات المطلوبة وتضع الدبرة في موضع المساعد، من دون تنفيذ منطق فعلي حتى الآن."
        />

        <motion.div variants={sectionStagger} initial="hidden" whileInView="visible" viewport={revealViewport} className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <motion.div variants={fadeUpItem}>
          <Card className="overflow-hidden border-[var(--color-gold)]/14 bg-white/86 shadow-[0_22px_50px_rgba(13,27,42,0.08)]">
            <CardContent className="p-6 sm:p-8">
              <div className="flex flex-wrap gap-2">
                {quickFilters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className="min-h-10 rounded-full border border-[color:var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-navy)] transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {searchFields.map((field, index) => {
                  const Icon = icons[index];

                  return (
                    <div key={field.label} className="rounded-[24px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-4 shadow-[0_10px_24px_rgba(13,27,42,0.05)]">
                      <p className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--color-surface)] text-[var(--color-gold)]">
                        <Icon size={18} />
                      </p>
                      <p className="text-sm text-[var(--color-muted)]">{field.label}</p>
                      <p className="mt-2 text-base font-semibold text-[var(--color-navy)]">{field.value}</p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button variant="gold" size="lg">
                  <FiSearch />
                  ابدأ البحث
                </Button>
                <Button variant="outline" size="lg">
                  حفظ المعايير
                </Button>
              </div>
            </CardContent>
          </Card>
          </motion.div>

          <motion.div variants={fadeUpItem} whileHover={{ y: -3, transition: { duration: 0.22, ease: subtleEasing } }}>
            <Card className="h-full border-[var(--color-gold)]/20 bg-[linear-gradient(165deg,#0d1b2a_0%,#172f45_75%,#244863_130%)] text-[var(--color-light)]">
              <CardContent className="flex h-full flex-col p-6 sm:p-8">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-gold)]/30 bg-[var(--color-gold)]/12 px-4 py-2 text-sm text-[var(--color-gold)]">
                  <HiSparkles /> اسأل الدبرة
                </div>
                <h3 className="mt-5 text-3xl font-semibold">الدبرة</h3>
                <p className="mt-4 text-base leading-8 text-white/72">
                  هذه الواجهة مهيأة لمستقبل يستطيع فيه الدبرة اقتراح رحلات وخيارات حسب الوجهة، أسلوب الضيافة، ونوع الخدمة المفضل.
                </p>

                <div className="mt-4 rounded-[24px] border border-[var(--color-gold)]/20 bg-[var(--color-gold)]/10 px-4 py-4 text-sm leading-8 text-white/85">
                  ياهلا والله 👋
                  <br />
                  أنا الدبرة...
                  <br />
                  مستشارك الشخصي في dir3com.
                  <br />
                  وش ودك ندبر لك اليوم؟
                </div>

                <div className="mt-6 space-y-3">
                  {smartPrompts.map((prompt) => (
                    <div key={prompt} className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-4 text-sm leading-7 text-white/82 backdrop-blur-sm">
                      {prompt}
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-6 text-sm text-white/60">واجهة فقط. لا يوجد منطق ذكاء اصطناعي مفعّل في هذه المرحلة.</div>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
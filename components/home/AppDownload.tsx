'use client';

import { motion } from 'framer-motion';
import { FiBell, FiDownload, FiSmartphone } from 'react-icons/fi';
import { HiSparkles } from 'react-icons/hi2';
import SectionHeading from '@/components/home/SectionHeading';
import { appFeatures } from '@/components/home/dir3-home-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function AppDownload() {
  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.5 }}>
            <Card className="overflow-hidden bg-[var(--color-navy)] text-[var(--color-light)]">
              <CardContent className="p-6 sm:p-8">
                <div className="mx-auto w-full max-w-[320px] rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,#102334_0%,#09131d_100%)] p-4 shadow-[0_20px_45px_rgba(0,0,0,0.35)]">
                  <div className="rounded-[28px] bg-[linear-gradient(180deg,rgba(212,175,55,0.18)_0%,rgba(255,255,255,0.04)_100%)] p-5">
                    <div className="mx-auto h-2.5 w-16 rounded-full bg-white/18" />
                    <div className="mt-6 rounded-[24px] bg-white/8 p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-gold)] text-[var(--color-navy)]">
                          <HiSparkles />
                        </span>
                        <div>
                          <p className="font-semibold">الدِّبرة</p>
                          <p className="text-sm text-white/65">قريباً في التطبيق</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">حجوزاتي</div>
                      <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">العروض المفضلة</div>
                      <div className="rounded-[20px] border border-white/10 bg-white/6 p-4">تنبيهات الوصول</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div>
            <SectionHeading
              eyebrow="APP DOWNLOAD"
              title="حمّل تطبيق dir3com حين يصبح جاهزاً، والواجهة مستعدة من الآن."
              description="قسم تنزيل التطبيق مبني ليعرض مزايا التطبيق، الأزرار، والمعاينات المستقبلية من دون الحاجة إلى ربط أي متجر أو خدمة حالياً."
            />

            <div className="mt-6 grid gap-3">
              {appFeatures.map((feature) => (
                <div key={feature} className="rounded-[24px] border border-[color:var(--color-border)] bg-white/76 px-4 py-4 text-base font-medium text-[var(--color-navy)] shadow-[0_16px_35px_rgba(13,27,42,0.06)]">
                  {feature}
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button variant="gold" size="lg">
                <FiDownload />
                App Store
              </Button>
              <Button variant="outline" size="lg">
                <FiSmartphone />
                Google Play
              </Button>
              <Button variant="outline" size="lg">
                <FiBell />
                نبّهني عند الإطلاق
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
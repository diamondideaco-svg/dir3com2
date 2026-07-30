'use client';

import { motion } from 'framer-motion';
import { FiArrowLeft } from 'react-icons/fi';
import SectionHeading from '@/components/home/SectionHeading';
import { articleCards } from '@/components/home/dir3-home-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fadeUpItem, revealViewport, sectionStagger, subtleEasing } from '@/components/shared/motion';

export default function ArticlesGrid() {
  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="ARTICLES"
          title="محتوى تحريري يشرح التجربة بنفس رقي المنتج."
          description="مساحة مقالات ودلائل جاهزة لربطها مستقبلاً بواجهة إدارة محتوى أو مصدر بيانات ديناميكي مع الاحتفاظ بنفس بنية البطاقات."
        />

        <motion.div variants={sectionStagger} initial="hidden" whileInView="visible" viewport={revealViewport} className="mt-8 grid gap-5 lg:grid-cols-3">
          {articleCards.map((article, index) => (
            <motion.div
              key={article.title}
              variants={fadeUpItem}
              transition={{ delay: index * 0.05 }}
              whileHover={{ y: -6, transition: { duration: 0.24, ease: subtleEasing } }}
            >
              <Card className="group h-full overflow-hidden border-[var(--color-gold)]/15 bg-white/86 shadow-[0_20px_45px_rgba(13,27,42,0.08)]">
                <div className="relative h-44 overflow-hidden rounded-b-[24px] border-b border-[var(--color-gold)]/15 bg-[linear-gradient(145deg,#0d1b2a_0%,#244360_60%,#d4af37_150%)] p-5 text-[var(--color-light)] sm:h-52">
                  <div className="absolute -left-8 top-4 h-20 w-20 rounded-full bg-[var(--color-gold)]/24 blur-3xl" />
                  <div className="absolute -right-7 bottom-3 h-20 w-20 rounded-full bg-white/12 blur-3xl" />
                  <div className="relative flex h-full flex-col justify-between">
                    <span className="inline-flex w-fit rounded-full border border-white/20 bg-white/12 px-3 py-1 text-xs">{article.category}</span>
                    <p className="max-w-[90%] font-[var(--font-display)] text-2xl leading-tight">{article.readTime}</p>
                  </div>
                </div>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
                    <span>{article.category}</span>
                    <span>{article.readTime}</span>
                  </div>
                  <CardTitle className="mt-4 leading-9">{article.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base leading-8 text-[var(--color-muted)]">{article.description}</p>
                  <button type="button" className="mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[var(--color-gold)] transition group-hover:gap-3">
                    اقرأ لاحقاً
                    <FiArrowLeft />
                  </button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
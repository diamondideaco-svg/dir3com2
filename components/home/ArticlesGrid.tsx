'use client';

import { motion } from 'framer-motion';
import { FiArrowLeft } from 'react-icons/fi';
import SectionHeading from '@/components/home/SectionHeading';
import { articleCards } from '@/components/home/dir3-home-data';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ArticlesGrid() {
  return (
    <section className="px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="ARTICLES"
          title="محتوى تحريري يشرح التجربة بنفس رقي المنتج."
          description="مساحة مقالات ودلائل جاهزة لربطها مستقبلاً بواجهة إدارة محتوى أو مصدر بيانات ديناميكي مع الاحتفاظ بنفس بنية البطاقات."
        />

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {articleCards.map((article, index) => (
            <motion.div
              key={article.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45, delay: index * 0.05 }}
            >
              <Card className="h-full bg-white/82">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3 text-sm text-[var(--color-muted)]">
                    <span>{article.category}</span>
                    <span>{article.readTime}</span>
                  </div>
                  <CardTitle className="mt-4 leading-9">{article.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base leading-8 text-[var(--color-muted)]">{article.description}</p>
                  <button type="button" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-gold)] transition hover:gap-3">
                    اقرأ لاحقاً
                    <FiArrowLeft />
                  </button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
'use client';

import { useEffect, useState } from 'react';
import Reveal from '../shared/Reveal';

const stats = [
  { value: 24, label: 'ساعة دعم مستمر', suffix: '/7' },
  { value: 98, label: 'نسبة رضا العملاء', suffix: '%' },
  { value: 150, label: 'وجهة مميزة', suffix: '+' },
  { value: 4.9, label: 'متوسط التقييم', suffix: '/5' },
];

function AnimatedCounter({ value, suffix }: { value: number; suffix: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let frame = 0;
    const duration = 1400;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Number((value * eased).toFixed(value % 1 === 0 ? 0 : 1)));

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span>
      {count}
      {suffix}
    </span>
  );
}

export default function StatsStrip() {
  return (
    <section className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.16)] md:grid-cols-2 xl:grid-cols-4 lg:p-6">
        {stats.map((stat, index) => (
          <Reveal key={stat.label} delay={index * 120} className="rounded-[1.25rem] border border-white/10 bg-[#0D1B2A]/70 p-5 text-right">
            <p className="text-3xl font-semibold text-[#D4AF37] sm:text-4xl">
              <AnimatedCounter value={stat.value} suffix={stat.suffix} />
            </p>
            <p className="mt-2 text-sm text-slate-300">{stat.label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

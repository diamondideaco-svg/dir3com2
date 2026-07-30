import type { Variants } from 'framer-motion';

export const subtleEasing: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const sectionStagger: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.09,
      delayChildren: 0.04,
    },
  },
};

export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: subtleEasing,
    },
  },
};

export const softScaleItem: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.58,
      ease: subtleEasing,
    },
  },
};

export const revealViewport = {
  once: true,
  amount: 0.2,
};

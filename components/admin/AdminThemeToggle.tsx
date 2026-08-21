'use client';

import { useEffect, useState } from 'react';
import { FiMoon, FiSun } from 'react-icons/fi';

export default function AdminThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setDark(document.documentElement.dataset.theme === 'dark'));
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    document.body.dataset.theme = next ? 'dark' : 'light';
    window.localStorage.setItem('dir3com-theme', next ? 'dark' : 'light');
  }

  return (
    <button type="button" onClick={toggleTheme} aria-label="تبديل المظهر" aria-pressed={dark} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#D4AF37]/35 bg-[var(--color-card-strong)] text-[var(--color-navy)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/45">
      {dark ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}
    </button>
  );
}

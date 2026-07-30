import Link from 'next/link';
import { FaFacebookF, FaInstagram, FaTiktok, FaWhatsapp, FaXTwitter } from 'react-icons/fa6';
import { FiArrowUpLeft, FiDownload, FiPhoneCall, FiShield, FiSmartphone } from 'react-icons/fi';

const footerLinks = [
  { label: 'الرئيسية', href: '/#home' },
  { label: 'خدماتنا', href: '/services' },
  { label: 'العروض', href: '/offers' },
  { label: 'من نحن', href: '/about' },
  { label: 'تواصل', href: '/contact' },
];

const socialLinks = [
  { href: 'https://wa.me/966532867009', label: 'WhatsApp', icon: FaWhatsapp },
  { href: 'https://instagram.com', label: 'Instagram', icon: FaInstagram },
  { href: 'https://tiktok.com', label: 'TikTok', icon: FaTiktok },
  { href: 'https://x.com', label: 'X', icon: FaXTwitter },
  { href: 'https://facebook.com', label: 'Facebook', icon: FaFacebookF },
];

const footerCollections = [
  { title: 'الاستكشاف', links: footerLinks },
  {
    title: 'الخدمات',
    links: [
      { label: 'السيارات', href: '/cars' },
      { label: 'الفنادق', href: '/hotels' },
      { label: 'التجارب', href: '/experiences' },
      { label: 'الكونسيرج', href: '/concierge' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[var(--color-navy)] text-[var(--color-light)]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.7fr_0.7fr_0.9fr]">
          <div className="max-w-lg">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/8 text-[var(--color-gold)]">
                <FiShield size={22} />
              </span>
              <div>
                <p className="font-[var(--font-display)] text-3xl font-semibold">dir3com</p>
                <p className="text-sm text-[var(--color-light)]/65">رحلتكم محمية بضمان الدرع.</p>
              </div>
            </div>
            <p className="mt-5 text-sm leading-8 text-[var(--color-light)]/72">
              واجهة ضيافة وسفر عربية بروح فاخرة، مصممة لتخدم العميل أولاً وتجهز الدبرة لتكاملات المساعدة الذكية لاحقاً.
            </p>
            <div className="mt-6 rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm leading-8 text-[var(--color-light)]/78">
              الدبرة — مستشارك الشخصي في dir3com
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <a href="https://dir3com.com" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
                dir3com.com <FiArrowUpLeft />
              </a>
              <a href="https://dir3com.net" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
                dir3com.net <FiArrowUpLeft />
              </a>
            </div>
          </div>

          {footerCollections.map((collection) => (
            <div key={collection.title}>
              <h3 className="text-lg font-semibold">{collection.title}</h3>
              <div className="mt-5 grid gap-3 text-sm text-[var(--color-light)]/75">
                {collection.links.map((item) => (
                  <Link key={item.href} href={item.href} className="rounded-md transition hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <div>
            <h3 className="text-lg font-semibold">تواصل وتنزيل</h3>
            <div className="mt-5 flex items-center gap-2 text-sm text-[var(--color-light)]/75">
              <FiPhoneCall />
              <a href="tel:0532867009" className="rounded-md transition hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
                0532867009
              </a>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-2 lg:grid-cols-1 lg:gap-3">
              <button type="button" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
                <FiDownload /> App Store
              </button>
              <button type="button" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium transition hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45">
                <FiSmartphone /> Google Play
              </button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {socialLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:-translate-y-0.5 hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/45"
                >
                  <Icon size={15} />
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-sm text-[var(--color-light)]/65 sm:flex sm:items-center sm:justify-between">
          <p>© 2026 dir3com. جميع الحقوق محفوظة.</p>
          <p className="mt-3 sm:mt-0">قيم الخدمة قبل نحاسب.</p>
        </div>
      </div>
    </footer>
  );
}

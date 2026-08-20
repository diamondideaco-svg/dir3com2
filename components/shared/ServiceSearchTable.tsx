'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiCalendar, FiMapPin, FiSearch, FiShield, FiUsers } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const services = [
  { key: 'drive', ar: 'dir3com Drive', en: 'dir3com Drive', fields: { ar: ['نقطة الانطلاق', 'الوجهة', 'تاريخ الرحلة', 'عدد الركاب'], en: ['Pickup', 'Destination', 'Travel date', 'Passengers'] } },
  { key: 'stay', ar: 'dir3com Stay', en: 'dir3com Stay', fields: { ar: ['المدينة', 'نوع الإقامة', 'تاريخ الوصول', 'عدد الضيوف'], en: ['City', 'Stay type', 'Check-in date', 'Guests'] } },
  { key: 'fly', ar: 'dir3com Fly', en: 'dir3com Fly', fields: { ar: ['من', 'إلى', 'تاريخ المغادرة', 'المسافرون'], en: ['From', 'To', 'Departure date', 'Travelers'] } },
  { key: 'concierge', ar: 'dir3com Concierge', en: 'dir3com Concierge', fields: { ar: ['الوجهة', 'نوع الطلب', 'تاريخ الخدمة', 'عدد الضيوف'], en: ['Destination', 'Request type', 'Service date', 'Guests'] } },
  { key: 'vip', ar: 'dir3com VIP', en: 'dir3com VIP', fields: { ar: ['الوجهة', 'التجربة', 'تاريخ الرحلة', 'عدد الضيوف'], en: ['Destination', 'Experience', 'Trip date', 'Guests'] } },
] as const;

const icons = [FiMapPin, FiShield, FiCalendar, FiUsers];

export default function ServiceSearchTable() {
  const { language, direction } = useLanguage();
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<(typeof services)[number]['key']>('drive');
  const selected = services.find((service) => service.key === selectedKey) ?? services[0];
  const labels = selected.fields[language];

  function submitSearch() {
    router.push(`/services?service=${selected.key}`);
  }

  return (
    <section id="service-search" className="service-search-table px-4 py-10 sm:px-6 lg:px-10" dir={direction}>
      <div className="mx-auto max-w-[1240px]">
        <div className="service-search-table__shell">
          <div className="service-search-table__tabs" role="tablist" aria-label={language === 'ar' ? 'اختيار الخدمة' : 'Choose a service'}>
            {services.map((service) => (
              <button
                key={service.key}
                type="button"
                role="tab"
                aria-selected={selectedKey === service.key}
                className={selectedKey === service.key ? 'service-search-table__tab service-search-table__tab--active' : 'service-search-table__tab'}
                onClick={() => setSelectedKey(service.key)}
              >
                {service[language]}
              </button>
            ))}
          </div>
          <div className="service-search-table__fields">
            {labels.map((label, index) => {
              const Icon = icons[index];
              return (
                <label key={label} className="service-search-table__field">
                  <span><Icon aria-hidden="true" />{label}</span>
                  <input aria-label={label} placeholder={language === 'ar' ? 'اختر من القائمة' : 'Choose from the list'} />
                </label>
              );
            })}
            <button type="button" className="service-search-table__submit" onClick={submitSearch}>
              <FiSearch aria-hidden="true" />
              {language === 'ar' ? 'ابحث الآن' : 'Search now'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

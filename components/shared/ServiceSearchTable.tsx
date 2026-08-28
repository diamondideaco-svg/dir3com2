'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiCalendar, FiChevronDown, FiChevronUp, FiFlag, FiMapPin, FiSearch, FiUsers } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { canonicalCountries, citiesForCountry, todayIsoDate } from '@/lib/services/coverage';

type FieldKind = 'country' | 'city' | 'date' | 'count';

type FieldDef = {
  name: string;
  kind: FieldKind;
  ar: string;
  en: string;
  /** For city fields: the country field that scopes the options. */
  countryField?: string;
  /** For date fields: the date this one must not precede. */
  notBefore?: string;
};

type ServiceDef = {
  key: 'drive' | 'stay' | 'fly' | 'concierge' | 'vip';
  ar: string;
  en: string;
  fields: FieldDef[];
};

const services: ServiceDef[] = [
  {
    key: 'drive',
    ar: 'dir3com Drive',
    en: 'dir3com Drive',
    fields: [
      { name: 'country', kind: 'country', ar: 'الدولة', en: 'Country' },
      { name: 'pickupCity', kind: 'city', countryField: 'country', ar: 'مدينة الانطلاق', en: 'Pickup city' },
      { name: 'dropoffCity', kind: 'city', countryField: 'country', ar: 'مدينة الوصول', en: 'Drop-off city' },
      { name: 'pickupDate', kind: 'date', ar: 'تاريخ الانطلاق', en: 'Pickup date' },
      { name: 'returnDate', kind: 'date', ar: 'تاريخ العودة', en: 'Return date', notBefore: 'pickupDate' },
      { name: 'passengers', kind: 'count', ar: 'عدد الركاب', en: 'Passengers' },
    ],
  },
  {
    key: 'stay',
    ar: 'dir3com Stay',
    en: 'dir3com Stay',
    fields: [
      { name: 'country', kind: 'country', ar: 'الدولة', en: 'Country' },
      { name: 'city', kind: 'city', countryField: 'country', ar: 'المدينة', en: 'City' },
      { name: 'checkIn', kind: 'date', ar: 'تاريخ الوصول', en: 'Check-in' },
      { name: 'checkOut', kind: 'date', ar: 'تاريخ المغادرة', en: 'Check-out', notBefore: 'checkIn' },
      { name: 'guests', kind: 'count', ar: 'عدد الضيوف', en: 'Guests' },
    ],
  },
  {
    key: 'fly',
    ar: 'dir3com Fly',
    en: 'dir3com Fly',
    fields: [
      { name: 'originCountry', kind: 'country', ar: 'دولة المغادرة', en: 'Origin country' },
      { name: 'originCity', kind: 'city', countryField: 'originCountry', ar: 'مدينة المغادرة', en: 'Origin city' },
      { name: 'destinationCountry', kind: 'country', ar: 'دولة الوصول', en: 'Destination country' },
      { name: 'destinationCity', kind: 'city', countryField: 'destinationCountry', ar: 'مدينة الوصول', en: 'Destination city' },
      { name: 'departureDate', kind: 'date', ar: 'تاريخ المغادرة', en: 'Departure' },
      { name: 'returnDate', kind: 'date', ar: 'تاريخ العودة', en: 'Return', notBefore: 'departureDate' },
      { name: 'passengers', kind: 'count', ar: 'المسافرون', en: 'Travelers' },
    ],
  },
  {
    key: 'concierge',
    ar: 'dir3com Concierge',
    en: 'dir3com Concierge',
    fields: [
      { name: 'country', kind: 'country', ar: 'الدولة', en: 'Country' },
      { name: 'city', kind: 'city', countryField: 'country', ar: 'المدينة', en: 'City' },
      { name: 'serviceDate', kind: 'date', ar: 'تاريخ الخدمة', en: 'Service date' },
      { name: 'guests', kind: 'count', ar: 'عدد الضيوف', en: 'Guests' },
    ],
  },
  {
    key: 'vip',
    ar: 'dir3com VIP',
    en: 'dir3com VIP',
    fields: [
      { name: 'country', kind: 'country', ar: 'الدولة', en: 'Country' },
      { name: 'city', kind: 'city', countryField: 'country', ar: 'المدينة', en: 'City' },
      { name: 'tripDate', kind: 'date', ar: 'تاريخ الرحلة', en: 'Trip date' },
      { name: 'guests', kind: 'count', ar: 'عدد الضيوف', en: 'Guests' },
    ],
  },
];

const copy = {
  ar: {
    choose: 'اختيار الخدمة',
    selectCountry: 'اختر الدولة',
    selectCity: 'اختر المدينة',
    pickCountryFirst: 'اختر الدولة أولاً',
    search: 'ابحث الآن',
    required: 'أكمل الحقول المطلوبة قبل البحث.',
    dateOrder: 'تاريخ العودة يجب أن يكون بعد تاريخ الذهاب.',
    pastDate: 'لا يمكن اختيار تاريخ في الماضي.',
    sameCity: 'اختر مدينتين مختلفتين.',
    hideSearch: 'إخفاء البحث',
    showSearch: 'ابحث عن رحلة أو خدمة',
  },
  en: {
    choose: 'Choose a service',
    selectCountry: 'Select country',
    selectCity: 'Select city',
    pickCountryFirst: 'Select a country first',
    search: 'Search now',
    required: 'Complete the required fields before searching.',
    dateOrder: 'The return date must be after the departure date.',
    pastDate: 'A past date cannot be selected.',
    sameCity: 'Choose two different cities.',
    hideSearch: 'Hide search',
    showSearch: 'Search travel & services',
  },
} as const;

function iconFor(kind: FieldKind) {
  if (kind === 'country') return FiFlag;
  if (kind === 'date') return FiCalendar;
  if (kind === 'count') return FiUsers;
  return FiMapPin;
}

export default function ServiceSearchTable({ initialService = 'drive' }: { initialService?: ServiceDef['key'] }) {
  const { language, direction } = useLanguage();
  const router = useRouter();
  const t = copy[language];
  const today = useMemo(() => todayIsoDate(), []);
  const [selectedKey, setSelectedKey] = useState<ServiceDef['key']>(initialService);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState(true);

  useEffect(() => {
    queueMicrotask(() => {
      setMobileExpanded(window.sessionStorage.getItem('dir3com-search-collapsed') !== 'true');
    });
  }, []);

  function toggleMobileSearch() {
    setMobileExpanded((expanded) => {
      const next = !expanded;
      window.sessionStorage.setItem('dir3com-search-collapsed', next ? 'false' : 'true');
      return next;
    });
  }

  const selected = services.find((service) => service.key === selectedKey) ?? services[0];

  const setValue = (field: FieldDef, value: string) => {
    setValues((previous) => {
      const next = { ...previous, [field.name]: value };
      // Changing a country invalidates every city scoped to it.
      if (field.kind === 'country') {
        for (const dependent of selected.fields) {
          if (dependent.kind === 'city' && dependent.countryField === field.name) {
            next[dependent.name] = '';
          }
        }
      }
      return next;
    });
    setError(null);
  };

  function submitSearch() {
    if (selected.fields.some((field) => !values[field.name]?.trim())) {
      setError(t.required);
      return;
    }

    const cityValues = selected.fields.filter((field) => field.kind === 'city').map((field) => values[field.name]);
    if (cityValues.length === 2 && cityValues[0] === cityValues[1]) {
      setError(t.sameCity);
      return;
    }

    for (const field of selected.fields) {
      if (field.kind !== 'date') continue;
      if (values[field.name] < today) {
        setError(t.pastDate);
        return;
      }
      if (field.notBefore && values[field.name] < values[field.notBefore]) {
        setError(t.dateOrder);
        return;
      }
    }

    const params = new URLSearchParams({ service: selected.key });
    for (const field of selected.fields) params.set(field.name, values[field.name]);
    router.push(`/services/${selected.key}?${params.toString()}`);
  }

  return (
    <section id="service-search" className="service-search-table px-4 py-10 sm:px-6 lg:px-10" dir={direction}>
      <div className="mx-auto max-w-[1240px]">
        <div className="service-search-table__shell">
          <button
            type="button"
            className="service-search-table__mobile-toggle"
            onClick={toggleMobileSearch}
            aria-expanded={mobileExpanded}
            aria-controls="service-search-content"
          >
            {mobileExpanded ? <FiChevronUp aria-hidden="true" /> : <FiSearch aria-hidden="true" />}
            <span>{mobileExpanded ? t.hideSearch : t.showSearch}</span>
            {!mobileExpanded ? <FiChevronDown aria-hidden="true" /> : null}
          </button>
          <div id="service-search-content" className={mobileExpanded ? 'service-search-table__content' : 'service-search-table__content service-search-table__content--collapsed'}>
          <div className="service-search-table__tabs" role="tablist" aria-label={t.choose}>
            {services.map((service) => (
              <button
                key={service.key}
                type="button"
                role="tab"
                aria-selected={selectedKey === service.key}
                className={selectedKey === service.key ? 'service-search-table__tab service-search-table__tab--active' : 'service-search-table__tab'}
                onClick={() => {
                  setSelectedKey(service.key);
                  setValues({});
                  setError(null);
                }}
              >
                {service[language]}
              </button>
            ))}
          </div>
          <div className="service-search-table__fields">
            {selected.fields.map((field) => {
              const Icon = iconFor(field.kind);
              const label = field[language];
              const parentCountry = field.countryField ? values[field.countryField] : '';
              const cityOptions = field.kind === 'city' ? citiesForCountry(parentCountry) : [];
              return (
                <label key={`${selected.key}-${field.name}`} className="service-search-table__field">
                  <span><Icon aria-hidden="true" />{label}</span>
                  {field.kind === 'country' ? (
                    <select aria-label={label} value={values[field.name] ?? ''} onChange={(event) => setValue(field, event.target.value)}>
                      <option value="">{t.selectCountry}</option>
                      {canonicalCountries.map((country) => (
                        <option key={country.code} value={country.code}>{country[language]}</option>
                      ))}
                    </select>
                  ) : field.kind === 'city' ? (
                    <select aria-label={label} value={values[field.name] ?? ''} disabled={!parentCountry} onChange={(event) => setValue(field, event.target.value)}>
                      <option value="">{parentCountry ? t.selectCity : t.pickCountryFirst}</option>
                      {cityOptions.map((city) => (
                        <option key={city.slug} value={city.slug}>{city[language]}</option>
                      ))}
                    </select>
                  ) : field.kind === 'date' ? (
                    <input
                      type="date"
                      aria-label={label}
                      min={field.notBefore ? values[field.notBefore] || today : today}
                      value={values[field.name] ?? ''}
                      onChange={(event) => setValue(field, event.target.value)}
                    />
                  ) : (
                    <input
                      type="number"
                      inputMode="numeric"
                      aria-label={label}
                      min={1}
                      max={12}
                      placeholder="1"
                      value={values[field.name] ?? ''}
                      onChange={(event) => setValue(field, event.target.value)}
                    />
                  )}
                </label>
              );
            })}
            <button type="button" className="service-search-table__submit" onClick={submitSearch}>
              <FiSearch aria-hidden="true" />
              {t.search}
            </button>
          </div>
          {error ? <p role="alert" className="px-4 pb-3 text-xs font-semibold text-[#b91c1c]">{error}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

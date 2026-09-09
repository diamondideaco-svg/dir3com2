'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FiCalendar, FiChevronDown, FiChevronUp, FiFlag, FiMapPin, FiSearch, FiUsers } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { canonicalCountries, citiesForCountry, todayIsoDate } from '@/lib/services/coverage';
import { normalizeStayRooms } from '@/lib/services/search-state';

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
      { name: 'rooms', kind: 'count', ar: 'عدد الغرف', en: 'Rooms' },
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

function defaultValuesForService(service: ServiceDef['key']): Record<string, string> {
  return service === 'stay' ? { rooms: '1' } : {};
}

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

export default function ServiceSearchTable({ initialService = 'drive', driveMarketplace = false, familyMarketplace = false }: { initialService?: ServiceDef['key']; driveMarketplace?: boolean; familyMarketplace?: boolean }) {
  const directDrive = driveMarketplace && initialService === 'drive';
  const directMarketplace = directDrive || familyMarketplace;
  const FieldsContainer = directMarketplace ? 'form' : 'div';
  const { language, direction } = useLanguage();
  const router = useRouter();
  const t = copy[language];
  const today = useMemo(() => todayIsoDate(), []);
  const [selectedKey, setSelectedKey] = useState<ServiceDef['key']>(initialService);
  const [values, setValues] = useState<Record<string, string>>(() => defaultValuesForService(initialService));
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
    const submissionValues = { ...values };
    if (selected.key === 'stay') submissionValues.rooms = String(normalizeStayRooms(values.rooms));

    if (selected.fields.some((field) => !submissionValues[field.name]?.trim())) {
      setError(t.required);
      return;
    }

    const cityValues = selected.fields.filter((field) => field.kind === 'city').map((field) => submissionValues[field.name]);
    if (cityValues.length === 2 && cityValues[0] === cityValues[1]) {
      setError(t.sameCity);
      return;
    }

    for (const field of selected.fields) {
      if (field.kind !== 'date') continue;
      if (submissionValues[field.name] < today) {
        setError(t.pastDate);
        return;
      }
      if (field.notBefore && submissionValues[field.name] < submissionValues[field.notBefore]) {
        setError(t.dateOrder);
        return;
      }
    }

    const params = new URLSearchParams({ service: selected.key });
    for (const field of selected.fields) params.set(field.name, submissionValues[field.name]);
    if (directDrive) {
      params.set('family', 'dir3-drive');
      // Preserve the existing inputs as URL context, not proof of live availability.
      router.push(`/marketplace?${params.toString()}`);
      return;
    }
    if (familyMarketplace) {
      params.set('family', `dir3-${selected.key}`);
      // Family inputs remain URL context; the catalog consumes the family filter.
      router.push(`/marketplace?${params.toString()}`);
      return;
    }
    router.push(`/services/${selected.key}?${params.toString()}`);
  }

  return (
    <section id="service-search" className="service-search-table px-4 py-10 sm:px-6 lg:px-10" dir={direction} data-drive-search={directDrive || undefined} data-family-search={familyMarketplace ? initialService : undefined} data-dabra-avoid={directMarketplace || undefined}>
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
          {directMarketplace ? <h2 className="service-search-table__tab service-search-table__tab--active">{selected[language]}</h2> : <div className="service-search-table__tabs" role="tablist" aria-label={t.choose}>
            {services.map((service) => (
              <button
                key={service.key}
                type="button"
                role="tab"
                aria-selected={selectedKey === service.key}
                className={selectedKey === service.key ? 'service-search-table__tab service-search-table__tab--active' : 'service-search-table__tab'}
                onClick={() => {
                  setSelectedKey(service.key);
                  setValues(defaultValuesForService(service.key));
                  setError(null);
                }}
              >
                {service[language]}
              </button>
            ))}
          </div>}
          <FieldsContainer className="service-search-table__fields" noValidate={directMarketplace && selected.key === 'stay' ? true : undefined} onSubmit={directMarketplace ? (event) => {
            event.preventDefault();
            // Stay rooms deliberately use the existing normalization (empty/invalid => 1).
            // Validate all other controls natively, without blocking that contract first.
            if (selected.key === 'stay') {
              const controls = event.currentTarget.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([data-normalized-rooms]), select');
              for (const control of controls) if (!control.reportValidity()) return;
            }
            submitSearch();
          } : undefined}>
            {selected.fields.map((field) => {
              const Icon = iconFor(field.kind);
              const label = field[language];
              const parentCountry = field.countryField ? values[field.countryField] : '';
              const cityOptions = field.kind === 'city' ? citiesForCountry(parentCountry) : [];
              return (
                <label key={`${selected.key}-${field.name}`} className="service-search-table__field">
                  <span><Icon aria-hidden="true" />{label}</span>
                  {field.kind === 'country' ? (
                    <select required={directMarketplace || undefined} aria-label={label} value={values[field.name] ?? ''} onChange={(event) => setValue(field, event.target.value)}>
                      <option value="">{t.selectCountry}</option>
                      {canonicalCountries.map((country) => (
                        <option key={country.code} value={country.code}>{country[language]}</option>
                      ))}
                    </select>
                  ) : field.kind === 'city' ? (
                    <select required={directMarketplace || undefined} aria-label={label} value={values[field.name] ?? ''} disabled={!parentCountry} onChange={(event) => setValue(field, event.target.value)}>
                      <option value="">{parentCountry ? t.selectCity : t.pickCountryFirst}</option>
                      {cityOptions.map((city) => (
                        <option key={city.slug} value={city.slug}>{city[language]}</option>
                      ))}
                    </select>
                  ) : field.kind === 'date' ? (
                    <input
                      type="date"
                      required={directMarketplace || undefined}
                      aria-label={label}
                      min={field.notBefore ? values[field.notBefore] || today : today}
                      value={values[field.name] ?? ''}
                      onChange={(event) => setValue(field, event.target.value)}
                    />
                  ) : (
                    <input
                      type="number"
                      required={directMarketplace || undefined}
                      data-normalized-rooms={selected.key === 'stay' && field.name === 'rooms' ? true : undefined}
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
            <button type={directMarketplace ? 'submit' : 'button'} className="service-search-table__submit" onClick={directMarketplace ? undefined : submitSearch}>
              <FiSearch aria-hidden="true" />
              {t.search}
            </button>
          </FieldsContainer>
          {error ? <p role="alert" className="px-4 pb-3 text-xs font-semibold text-[#b91c1c]">{error}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

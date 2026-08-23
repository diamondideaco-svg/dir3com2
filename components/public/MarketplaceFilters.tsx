import { SelectField } from '@/components/design-system';
import { useLanguage } from '@/components/i18n/LanguageProvider';

type MarketplaceOption = {
  value: string;
  label: string;
};

type MarketplaceFiltersValue = {
  destination: string;
  serviceType: string;
  budget: string;
  checkIn: string;
  checkOut: string;
  travelers: string;
};

type MarketplaceFiltersProps = {
  value: MarketplaceFiltersValue;
  destinationOptions: MarketplaceOption[];
  serviceTypeOptions: MarketplaceOption[];
  onChange: (next: MarketplaceFiltersValue) => void;
};

export default function MarketplaceFilters({ value, destinationOptions, serviceTypeOptions, onChange }: MarketplaceFiltersProps) {
  const { language } = useLanguage();
  const budgetOptions: MarketplaceOption[] = language === 'ar'
    ? [{ value: 'all', label: 'كل الميزانيات' }, { value: '0-2000', label: 'حتى 2,000 ر.س' }, { value: '2000-5000', label: '2,000 - 5,000 ر.س' }, { value: '5000+', label: '5,000+ ر.س' }]
    : [{ value: 'all', label: 'All budgets' }, { value: '0-2000', label: 'Up to SAR 2,000' }, { value: '2000-5000', label: 'SAR 2,000 - 5,000' }, { value: '5000+', label: 'SAR 5,000+' }];
  const travelersOptions: MarketplaceOption[] = language === 'ar'
    ? [{ value: 'all', label: 'أي عدد' }, { value: '1', label: 'مسافر 1' }, { value: '2', label: 'مسافران' }, { value: '3+', label: '3+ مسافرين' }]
    : [{ value: 'all', label: 'Any number' }, { value: '1', label: '1 traveller' }, { value: '2', label: '2 travellers' }, { value: '3+', label: '3+ travellers' }];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <SelectField
        label={language === 'ar' ? 'الوجهة' : 'Destination'}
        value={value.destination}
        options={destinationOptions}
        onChange={(destination) => onChange({ ...value, destination })}
      />

      <SelectField
        label={language === 'ar' ? 'نوع الخدمة' : 'Service type'}
        value={value.serviceType}
        options={serviceTypeOptions}
        onChange={(serviceType) => onChange({ ...value, serviceType })}
      />

      <SelectField
        label={language === 'ar' ? 'الميزانية' : 'Budget'}
        value={value.budget}
        options={budgetOptions}
        onChange={(budget) => onChange({ ...value, budget })}
      />

      <label className="block">
        <span className="mb-2 block text-xs font-semibold tracking-[0.12em] text-[var(--color-muted)] sm:text-sm">{language === 'ar' ? 'التواريخ' : 'Dates'}</span>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={value.checkIn}
            onChange={(event) => onChange({ ...value, checkIn: event.target.value })}
            className="min-h-11 rounded-[18px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-3 py-2 text-sm text-[var(--color-navy)] outline-none transition focus:border-[var(--color-gold)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35"
          />
          <input
            type="date"
            value={value.checkOut}
            onChange={(event) => onChange({ ...value, checkOut: event.target.value })}
            className="min-h-11 rounded-[18px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-3 py-2 text-sm text-[var(--color-navy)] outline-none transition focus:border-[var(--color-gold)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35"
          />
        </div>
      </label>

      <SelectField
        label={language === 'ar' ? 'المسافرون' : 'Travellers'}
        value={value.travelers}
        options={travelersOptions}
        onChange={(travelers) => onChange({ ...value, travelers })}
      />
    </div>
  );
}

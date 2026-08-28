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
  const en = language === 'en';
  const budgetOptions = [
    { value: 'all', label: en ? 'All budgets' : 'كل الميزانيات' }, { value: '0-2000', label: en ? 'Up to SAR 2,000' : 'حتى 2,000 ر.س' }, { value: '2000-5000', label: en ? 'SAR 2,000–5,000' : '2,000 - 5,000 ر.س' }, { value: '5000+', label: en ? 'SAR 5,000+' : '5,000+ ر.س' },
  ];
  const travelersOptions = [
    { value: 'all', label: en ? 'Any number' : 'أي عدد' }, { value: '1', label: en ? '1 traveller' : 'مسافر 1' }, { value: '2', label: en ? '2 travellers' : 'مسافران' }, { value: '3+', label: en ? '3+ travellers' : '3+ مسافرين' },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <SelectField
        label={en ? 'Destination' : 'الوجهة'}
        value={value.destination}
        options={destinationOptions}
        onChange={(destination) => onChange({ ...value, destination })}
      />

      <SelectField
        label={en ? 'Service type' : 'نوع الخدمة'}
        value={value.serviceType}
        options={serviceTypeOptions}
        onChange={(serviceType) => onChange({ ...value, serviceType })}
      />

      <SelectField
        label={en ? 'Budget' : 'الميزانية'}
        value={value.budget}
        options={budgetOptions}
        onChange={(budget) => onChange({ ...value, budget })}
      />

      <label className="block">
        <span className="mb-2 block text-xs font-semibold tracking-[0.12em] text-[var(--color-muted)] sm:text-sm">{en ? 'Dates' : 'التواريخ'}</span>
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
        label={en ? 'Travellers' : 'المسافرون'}
        value={value.travelers}
        options={travelersOptions}
        onChange={(travelers) => onChange({ ...value, travelers })}
      />
    </div>
  );
}

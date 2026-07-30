import { SelectField } from '@/components/design-system';

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

const budgetOptions: MarketplaceOption[] = [
  { value: 'all', label: 'كل الميزانيات' },
  { value: '0-2000', label: 'حتى 2,000 ر.س' },
  { value: '2000-5000', label: '2,000 - 5,000 ر.س' },
  { value: '5000+', label: '5,000+ ر.س' },
];

const travelersOptions: MarketplaceOption[] = [
  { value: 'all', label: 'أي عدد' },
  { value: '1', label: 'مسافر 1' },
  { value: '2', label: 'مسافران' },
  { value: '3+', label: '3+ مسافرين' },
];

export default function MarketplaceFilters({ value, destinationOptions, serviceTypeOptions, onChange }: MarketplaceFiltersProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <SelectField
        label="الوجهة"
        value={value.destination}
        options={destinationOptions}
        onChange={(destination) => onChange({ ...value, destination })}
      />

      <SelectField
        label="نوع الخدمة"
        value={value.serviceType}
        options={serviceTypeOptions}
        onChange={(serviceType) => onChange({ ...value, serviceType })}
      />

      <SelectField
        label="الميزانية"
        value={value.budget}
        options={budgetOptions}
        onChange={(budget) => onChange({ ...value, budget })}
      />

      <label className="block">
        <span className="mb-2 block text-xs font-semibold tracking-[0.12em] text-[var(--color-muted)] sm:text-sm">التواريخ</span>
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
        label="المسافرون"
        value={value.travelers}
        options={travelersOptions}
        onChange={(travelers) => onChange({ ...value, travelers })}
      />
    </div>
  );
}

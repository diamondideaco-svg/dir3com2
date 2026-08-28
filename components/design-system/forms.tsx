import { FiSearch } from 'react-icons/fi';
import { cn } from '@/lib/utils';

type FieldBaseProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  placeholder?: string;
  type?: 'text' | 'email' | 'tel';
};

export function TextField({
  label,
  value,
  onChange,
  className,
  required,
  placeholder,
  type = 'text',
}: FieldBaseProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-2 block text-sm font-medium text-[var(--color-muted)]">{label}</span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-11 w-full rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3 text-sm text-[var(--color-navy)] outline-none transition focus:border-[var(--color-gold)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35"
      />
    </label>
  );
}

type TextAreaFieldProps = Omit<FieldBaseProps, 'type'> & {
  rows?: number;
};

export function TextAreaField({
  label,
  value,
  onChange,
  className,
  required,
  placeholder,
  rows = 6,
}: TextAreaFieldProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-2 block text-sm font-medium text-[var(--color-muted)]">{label}</span>
      <textarea
        required={required}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3 text-sm text-[var(--color-navy)] outline-none transition focus:border-[var(--color-gold)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35"
      />
    </label>
  );
}

type SearchFieldProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
};

export function SearchField({ label = 'البحث', value, onChange, placeholder, className }: SearchFieldProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-2 block text-sm font-medium text-[var(--color-muted)]">{label}</span>
      <span className="flex min-h-11 items-center gap-3 rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3">
        <FiSearch className="text-[var(--color-gold)]" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm text-[var(--color-navy)] outline-none placeholder:text-[var(--color-muted)]/70 focus-visible:ring-0"
        />
      </span>
    </label>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  required?: boolean;
};

export function SelectField({ label, value, onChange, options, className, required }: SelectFieldProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-2 block text-sm font-medium text-[var(--color-muted)]">{label}</span>
      <select
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-[22px] border border-[color:var(--color-border)] bg-[var(--color-shell)] px-4 py-3 text-sm text-[var(--color-navy)] outline-none transition focus:border-[var(--color-gold)] focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]/35"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

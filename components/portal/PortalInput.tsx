import type { InputHTMLAttributes } from 'react';

export default function PortalInput({ operational, ...props }: InputHTMLAttributes<HTMLInputElement> & { operational: boolean }) {
  if (!operational) return <input {...props} />;
  const label = props['aria-label'] || props.placeholder;
  if (!label) return <input {...props} />;
  return <label className="flex min-w-0 flex-col gap-1 text-sm">
    {label ? <span>{label}</span> : null}
    <input {...props} />
  </label>;
}

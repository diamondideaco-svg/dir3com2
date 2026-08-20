type SectionTitleProps = {
  eyebrow: string;
  title: string;
  description: string;
  centered?: boolean;
};

export default function SectionTitle({
  eyebrow,
  title,
  description,
  centered = false,
}: SectionTitleProps) {
  return (
    <div className={centered ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl text-right'}>
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.35em] text-[#D4AF37]">
        {eyebrow}
      </p>
      <h2 className="text-3xl font-semibold text-white sm:text-4xl">{title}</h2>
      <p className="mt-4 text-lg leading-8 text-[var(--color-muted)]">{description}</p>
    </div>
  );
}

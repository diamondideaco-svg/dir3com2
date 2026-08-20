type ReviewCardProps = {
  review: { id: string; rating: number; title?: string | null; comment?: string | null; created_at: string };
};

export default function ReviewCard({ review }: ReviewCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="text-lg font-semibold text-white">{review.title || 'تقييم المستخدم'}</h3>
      <p className="mt-2 text-sm text-[var(--color-muted)]">التقييم: {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
      <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{review.comment || 'لا يوجد تعليق.'}</p>
      <p className="mt-3 text-xs text-[var(--color-muted)]">{new Date(review.created_at).toLocaleString('ar-SA')}</p>
    </div>
  );
}

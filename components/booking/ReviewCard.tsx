import { AdminDateTime, AdminText } from '@/components/admin/AdminLocale';

type ReviewCardProps = {
  review: { id: string; rating: number; title?: string | null; comment?: string | null; created_at: string };
};

export default function ReviewCard({ review }: ReviewCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-6">
      <h3 className="text-lg font-semibold text-white">{review.title || <AdminText ar="تقييم المستخدم" en="Customer review" />}</h3>
      <p className="mt-2 text-sm text-[var(--color-muted)]"><AdminText ar="التقييم" en="Rating" />: {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
      <p className="mt-3 text-sm leading-7 text-[var(--color-muted)]">{review.comment || <AdminText ar="لا يوجد تعليق." en="No comment." />}</p>
      <p className="mt-3 text-xs text-[var(--color-muted)]"><AdminDateTime value={review.created_at} /></p>
    </div>
  );
}

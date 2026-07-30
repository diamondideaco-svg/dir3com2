type ReviewCardProps = {
  review: { id: string; rating: number; title?: string | null; comment?: string | null; created_at: string };
};

export default function ReviewCard({ review }: ReviewCardProps) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold text-white">{review.title || 'تقييم المستخدم'}</h3>
      <p className="mt-2 text-sm text-slate-300">التقييم: {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
      <p className="mt-3 text-sm leading-7 text-slate-300">{review.comment || 'لا يوجد تعليق.'}</p>
      <p className="mt-3 text-xs text-slate-400">{new Date(review.created_at).toLocaleString('ar-SA')}</p>
    </div>
  );
}

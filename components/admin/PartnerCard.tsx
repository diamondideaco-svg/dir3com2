import type { PartnerRecord } from '@/lib/supabase/types';
import PartnerStatusBadge from './PartnerStatusBadge';
import ShieldLevelBadge from './ShieldLevelBadge';

type PartnerCardProps = {
  partner: PartnerRecord;
};

export default function PartnerCard({ partner }: PartnerCardProps) {
  return (
    <div className="rounded-[1.25rem] border border-[color:var(--color-border)] bg-[var(--color-surface)] p-5 text-right">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{partner.company_name}</h3>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{partner.contact_person}</p>
        </div>
        <div className="flex flex-col gap-2">
          <PartnerStatusBadge status={partner.status} />
          <ShieldLevelBadge level={partner.shield_level} />
        </div>
      </div>
      <div className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
        <p>{partner.email}</p>
        <p>{partner.country} / {partner.city}</p>
      </div>
    </div>
  );
}

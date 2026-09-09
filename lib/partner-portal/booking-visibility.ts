type Assignment = { partner_id: string; assignment_status: string; assigned_at: string };

// Input is the two latest assignments across ALL partners, newest first.
// A tie is ambiguous; never infer current ownership from an older own row.
export function isCurrentPartnerAssignment(assignments: Assignment[] | null, actorId: string) {
  const latest = assignments?.[0];
  if (!latest || latest.partner_id !== actorId || !['assigned', 'accepted'].includes(latest.assignment_status)) return false;
  const date = Date.parse(latest.assigned_at);
  if (!Number.isFinite(date)) return false;
  const previous = assignments?.[1];
  return !previous || (Number.isFinite(Date.parse(previous.assigned_at)) && date > Date.parse(previous.assigned_at));
}

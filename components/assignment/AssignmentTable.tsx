import AssignmentCard from './AssignmentCard';

type AssignmentTableProps = {
  assignments: Array<{
    id: string;
    booking_id: string;
    partner_id?: string | null;
    assignment_status?: string | null;
    notes?: string | null;
    assigned_at: string;
    booking_reference?: string;
    partner_name?: string;
    score?: number;
  }>;
};

export default function AssignmentTable({ assignments }: AssignmentTableProps) {
  if (!assignments.length) {
    return <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-slate-300">لا توجد Assignments حتى الآن.</div>;
  }

  return (
    <div className="space-y-4">
      {assignments.map((assignment) => (
        <AssignmentCard key={assignment.id} assignment={assignment} />
      ))}
    </div>
  );
}

// Row tint once the PM has acted on a task, shared by the task tables
// (Tasks Assigned, Tasks Overview). "No Action Taken" (or blank) has no entry on
// purpose — those rows keep their normal look.
const PM_ROW_TINTS: Record<string, { bg: string; border: string }> = {
  'changes':             { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.14)' },
  'approved':            { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.14)' },
  'submitted to client': { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.14)' },
  'ticketclosed':        { bg: 'rgba(168,85,247,0.09)', border: 'rgba(168,85,247,0.15)' },
};

export function pmRowTint(pmStatus: string | undefined | null) {
  return PM_ROW_TINTS[String(pmStatus ?? '').trim().toLowerCase()];
}

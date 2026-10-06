// Statuses that need attention: Paused by Client / Cybernext, Escalated,
// On Hold, and any Closed: ... outcome. Rows with one of these are marked
// with a red border — on screen in Generate Report, and in the copied table
// and the Excel downloads.
export const isFlaggedStatus = (status: string): boolean => {
  const v = status.trim().toLowerCase();
  return v === 'paused by client' || v === 'paused by cybernext' || v === 'escalated' || v === 'on hold' || v.startsWith('closed');
};

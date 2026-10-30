// The Help tab: anyone can send the team a help request, suggestion or complaint
// about the dashboard (the Apply form, lib/forms.ts 'help'), and sees only their own
// in the table; the Super Admin sees everyone's and sets the status.

export const HELP_TYPES = ['Help', 'Suggestion', 'Complaint'] as const;
export type HelpType = (typeof HELP_TYPES)[number];

export const HELP_STATUSES = ['New', 'In Review', 'In Progress', 'Resolved', 'Closed'] as const;
export type HelpStatus = (typeof HELP_STATUSES)[number];

// Where in the dashboard the request is about
export const HELP_AREAS = [
  'General', 'Login / Account', 'Web', 'Marketing', 'PM Projects', 'Leave Status', 'Cybernext InHouse', 'Tools', 'Admin Portal',
];

export interface HelpRequest {
  id: number;
  when: string;       // the form's timestamp, as stored
  name: string;
  username: string;
  role: string;
  type: string;
  subject: string;
  area: string;
  details: string;
  status: string;
  comment: string;     // the Super Admin's comment, shown to the person who sent the request
  commentedAt: string;
}

export const MAX_COMMENT = 1000;

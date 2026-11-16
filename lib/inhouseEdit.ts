import { INHOUSE_IMPORT } from './inhouseImport';
import { TOOLS_SHEET_ID, TAB_AI_TOOLS, TAB_HOLIDAY } from './config';

// Editing one entry of Cybernext InHouse (Websites, Case Studies, Brand Kit, Documentations) or of the two Tools
// lists (AI Tools, Holiday Calendar): which dataset each is, and the fields its edit form shows. Used by the form
// (components/EntryEditModal) and re-checked by /api/inhouse/edit. Super Admin and HM only (canEditInHouseEntries).

export type EditKind = 'websites' | 'case-studies' | 'brand-kit' | 'documentations' | 'ai-tools' | 'holidays';

export interface EditField {
  header: string;                         // the dataset's column
  kind?: 'text' | 'long' | 'url' | 'choice';
  options?: string[];                     // the choices of a 'choice' field
  required?: boolean;
  hint?: string;
}

export interface EditDef {
  label: string;
  sheetId: string;
  tab: string;
  fields: EditField[];
}

const STATUS_CHOICES = ['Live', 'Not working', 'Development Server', 'Review', 'Expired'];

export const EDIT_KINDS: Record<EditKind, EditDef> = {
  'websites': {
    label: 'Website', sheetId: INHOUSE_IMPORT['websites'].sheetId, tab: INHOUSE_IMPORT['websites'].tab,
    fields: [
      { header: 'Website Name', required: true },
      { header: 'Website Link', kind: 'url' },
      { header: 'Platform' },
      { header: 'Status', kind: 'choice', options: STATUS_CHOICES },
      { header: 'Industry' },
    ],
  },
  'case-studies': {
    label: 'Case Study', sheetId: INHOUSE_IMPORT['case-studies'].sheetId, tab: INHOUSE_IMPORT['case-studies'].tab,
    fields: [
      { header: 'Website Name', required: true },
      { header: 'Website Link', kind: 'url' },
      { header: 'Platform' },
      { header: 'Category' },
      { header: 'Status', kind: 'choice', options: STATUS_CHOICES },
      { header: 'URL', kind: 'url', hint: 'The case study page' },
      { header: 'Industry' },
    ],
  },
  'brand-kit': {
    label: 'Brand Kit item', sheetId: INHOUSE_IMPORT['brand-kit'].sheetId, tab: INHOUSE_IMPORT['brand-kit'].tab,
    fields: [{ header: 'Name', required: true }, { header: 'Destination', hint: 'Where the link goes, e.g. Google Drive' }, { header: 'URL', kind: 'url' }],
  },
  'documentations': {
    label: 'Document', sheetId: INHOUSE_IMPORT['documentations'].sheetId, tab: INHOUSE_IMPORT['documentations'].tab,
    fields: [{ header: 'Name', required: true }, { header: 'Destination', hint: 'Where the link goes, e.g. Google Drive' }, { header: 'URL', kind: 'url' }],
  },
  'ai-tools': {
    label: 'AI Tool', sheetId: TOOLS_SHEET_ID, tab: TAB_AI_TOOLS,
    fields: [
      { header: 'Tool Name', required: true },
      { header: 'Short Description', kind: 'long' },
      { header: 'Price', kind: 'choice', options: ['Free', 'Freemium', 'Premium'] },
      { header: 'Categories', hint: 'Separate several with commas, e.g. LLMs, Writing' },
      { header: 'URL', kind: 'url', required: true },
      { header: 'PM Focus', kind: 'choice', options: ['Yes', 'No'] },
      { header: 'Resource Focus', kind: 'choice', options: ['Yes', 'No'] },
    ],
  },
  'holidays': {
    label: 'Holiday', sheetId: TOOLS_SHEET_ID, tab: TAB_HOLIDAY,
    fields: [
      { header: 'Name', required: true },
      { header: 'Date', required: true, hint: 'DD/MM/YYYY' },
      { header: 'Day', hint: 'e.g. Monday' },
    ],
  },
};

// A link cell: empty, or a real web address (a bare domain gets https://). Anything else (javascript:, data:, ...) is
// refused. Returns null when it is not acceptable.
export function normalizeLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'http:' || u.protocol === 'https:' ? withScheme : null;
  } catch {
    return null;
  }
}

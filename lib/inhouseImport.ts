import { INHOUSE_SHEET_ID } from './config';

// The Excel upload on the Cybernext InHouse tabs: which dataset each sub-tab
// writes to, the columns its sheet should have, and the column that tells two rows
// are the same entry (so a re-uploaded sheet doesn't add everything twice).
export type InHouseImportTab = 'websites' | 'case-studies' | 'brand-kit' | 'documentations';

export interface InHouseImportDef {
  label: string;
  sheetId: string;
  tab: string;        // the dataset's tab (lib/data/datasets.ts)
  key: string;        // rows with the same value here (ignoring case) are the same entry
  headers: string[];  // columns the Excel sheet may have, in the order of the template
  example: string[];  // the template's sample row
}

export const INHOUSE_IMPORT: Record<InHouseImportTab, InHouseImportDef> = {
  'websites': {
    label: 'Websites', sheetId: INHOUSE_SHEET_ID, tab: 'Websites Details', key: 'Website Name',
    headers: ['Website Name', 'Website Link', 'Platform', 'Status', 'Industry'],
    example: ['Example Co', 'https://example.com', 'Wordpress', 'Live', 'Retail'],
  },
  'case-studies': {
    label: 'Case Studies', sheetId: INHOUSE_SHEET_ID, tab: 'Live Portfolio links', key: 'Website Name',
    headers: ['Website Name', 'Website Link', 'Platform', 'Category', 'Status', 'URL', 'Industry'],
    example: ['Example Co', 'https://example.com', 'Wordpress', 'Web Development', 'Live', 'https://cybernext.io/portfolio/example', 'Retail'],
  },
  'brand-kit': {
    label: 'Brand Kit', sheetId: INHOUSE_SHEET_ID, tab: 'Brand Kit', key: 'Name',
    headers: ['Name', 'Destination', 'URL'],
    example: ['Logo pack', 'Google Drive link', 'https://drive.google.com/example'],
  },
  'documentations': {
    label: 'Documentations', sheetId: INHOUSE_SHEET_ID, tab: 'Documentations', key: 'Name',
    headers: ['Name', 'Destination', 'URL'],
    example: ['Onboarding guide', 'Google Doc', 'https://docs.google.com/example'],
  },
};

export const MAX_IMPORT_ROWS = 2000;
export const MAX_CELL = 2000;

export const normHeader = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export interface ImportSummary {
  newRows: number;
  existingRows: number;        // already in the table (same key)
  changedExisting: number;     // ...of which the sheet has different values for
  unchanged: number;
  skipped: { row: number; reason: string }[];
  ignoredColumns: string[];
  sampleNew: Record<string, string>[];
  sampleChanged: { key: string; changes: { column: string; from: string; to: string }[] }[];
}

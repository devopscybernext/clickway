// Files that can be uploaded as a project document or template. Google Drive converts each one to a
// Google Doc or Google Sheet. Shared by the upload field (accept list) and the server (checks).
export const GOOGLE_DOC = 'application/vnd.google-apps.document';
export const GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet';
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const UPLOAD_FORMATS: Record<string, { source: string; target: string }> = {
  doc: { source: 'application/msword', target: GOOGLE_DOC },
  docx: { source: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', target: GOOGLE_DOC },
  odt: { source: 'application/vnd.oasis.opendocument.text', target: GOOGLE_DOC },
  rtf: { source: 'application/rtf', target: GOOGLE_DOC },
  txt: { source: 'text/plain', target: GOOGLE_DOC },
  html: { source: 'text/html', target: GOOGLE_DOC },
  htm: { source: 'text/html', target: GOOGLE_DOC },
  pdf: { source: 'application/pdf', target: GOOGLE_DOC },
  xls: { source: 'application/vnd.ms-excel', target: GOOGLE_SHEET },
  xlsx: { source: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', target: GOOGLE_SHEET },
  ods: { source: 'application/vnd.oasis.opendocument.spreadsheet', target: GOOGLE_SHEET },
  csv: { source: 'text/csv', target: GOOGLE_SHEET },
  tsv: { source: 'text/tab-separated-values', target: GOOGLE_SHEET },
};

export const UPLOAD_ACCEPT = Object.keys(UPLOAD_FORMATS).map(e => '.' + e).join(',');

export function uploadFormat(name: string) {
  return UPLOAD_FORMATS[name.split('.').pop()?.toLowerCase() || ''];
}

import { createHash } from 'crypto';
import { driveClient, DriveAuth, DriveError, httpStatus } from './google';
import { GOOGLE_DOC, GOOGLE_SHEET, MAX_UPLOAD_BYTES, uploadFormat } from './formats';

// Google Drive work for Projects: project folders, document files (template copy, upload, or a copy of a
// pasted link), and per-person sharing. Every folder and file this dashboard makes is tagged with
// appProperties.application = APP_TAG, so a retried request finds what an earlier attempt created, and
// deleting a document only ever trashes files this dashboard made.
//
// Folders (.env.local):
//   PROJECT_ROOT_DRIVE_FOLDER_ID  one folder per project, for "anyone with the link" documents
//   PRIVATE_ROOT_DRIVE_FOLDER_ID  one owner-only folder per project, for restricted documents (My Drive if unset)
//   ADMIN_ROOT_DRIVE_FOLDER_ID    uploaded templates

const API = 'https://www.googleapis.com/drive/v3/files';
const FOLDER = 'application/vnd.google-apps.folder';
export const APP_TAG = 'clickway-projects';
const FILE_FIELDS = 'id,name,mimeType,parents,trashed,appProperties,capabilities(canCopy,canAddChildren)';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  trashed?: boolean;
  ownedByMe?: boolean;
  appProperties?: Record<string, string>;
  capabilities?: { canCopy?: boolean; canAddChildren?: boolean };
}
export interface SavedFile { id: string; url: string; mimeType: string }
export interface ProjectFolder { id: string; url: string }
type Permission = { id: string; type: string; role: string; emailAddress?: string };
export type DriveRole = 'reader' | 'writer';

const validId = (id: string | undefined): id is string => !!id && /^[A-Za-z0-9_-]+$/.test(id);

// Turns a Google error into a message a person can act on. DriveErrors pass through.
export function friendlyDriveError(error: unknown): Error {
  if (error instanceof DriveError) return error;
  const status = httpStatus(error);
  if (status === 401) return new DriveError('Google authorization expired. Reconnect the workspace Google account.');
  if (status === 403 || status === 404) return new DriveError('Google Drive could not reach this file or folder. Check that the workspace Google account has access to it.');
  if (status === 400) return new DriveError('Google could not use this file. Check that it is a supported, unencrypted document or spreadsheet.');
  return new DriveError('Google Drive could not finish this. Please try again; anything already created for this request will be reused.');
}

// ─── Folders ─────────────────────────────────────────────────────────────────

// The project's folder for link-shared documents. Found again by its creation key, so a retry reuses it.
export async function ensureProjectFolder(name: string, creationKey: string, auth: DriveAuth = driveClient()): Promise<ProjectFolder> {
  const parent = process.env.PROJECT_ROOT_DRIVE_FOLDER_ID;
  if (!validId(parent)) throw new DriveError('The Projects Drive folder (PROJECT_ROOT_DRIVE_FOLDER_ID) is not set on the server.');
  try {
    const { data: root } = await auth.request<DriveFile>({ url: `${API}/${parent}`, params: { fields: 'id,mimeType,trashed,capabilities(canAddChildren)', supportsAllDrives: true } });
    if (root.mimeType !== FOLDER || root.trashed || !root.capabilities?.canAddChildren) {
      throw new DriveError('The workspace Google account cannot add folders to the Projects Drive folder.');
    }
    const { data: found } = await auth.request<{ files: DriveFile[] }>({
      url: API,
      params: {
        q: `'${parent}' in parents and trashed = false and mimeType = '${FOLDER}' and appProperties has { key='projectCreationKey' and value='${creationKey}' }`,
        fields: 'files(id,name,mimeType,parents)', pageSize: 2, supportsAllDrives: true, includeItemsFromAllDrives: true,
      },
    });
    let folder = found.files?.[0];
    if (folder) {
      if (folder.name !== name) await auth.request({ url: `${API}/${folder.id}`, method: 'PATCH', params: { supportsAllDrives: true }, data: { name } });
    } else {
      folder = (await auth.request<DriveFile>({
        url: API, method: 'POST', params: { fields: 'id,name,mimeType,parents', supportsAllDrives: true },
        data: { name, mimeType: FOLDER, parents: [parent], appProperties: { projectCreationKey: creationKey, application: APP_TAG } },
      })).data;
    }
    if (!folder?.id || folder.mimeType !== FOLDER || !folder.parents?.includes(parent)) {
      throw new DriveError('Google Drive did not confirm the project folder. Please try again.');
    }
    return { id: folder.id, url: `https://drive.google.com/drive/folders/${folder.id}` };
  } catch (error) {
    throw friendlyDriveError(error);
  }
}

function privateRoot(): string {
  const id = process.env.PRIVATE_ROOT_DRIVE_FOLDER_ID;
  if (id && !validId(id)) throw new DriveError('The private documents folder (PRIVATE_ROOT_DRIVE_FOLDER_ID) is not set correctly.');
  return id || 'root';
}

// The project's owner-only folder for restricted documents. Checked to still be owner-only each time.
export async function ensurePrivateFolder(projectId: number, name: string, existing: string | null, auth: DriveAuth = driveClient()): Promise<string> {
  try {
    let id = existing || undefined;
    const key = `${APP_TAG}-${projectId}`;
    if (!id) {
      const { data } = await auth.request<{ files: { id: string }[] }>({
        url: API,
        params: { q: `trashed=false and mimeType='${FOLDER}' and appProperties has { key='privateProject' and value='${key}' }`, fields: 'files(id)', pageSize: 2 },
      });
      if (data.files.length > 1) throw new DriveError('More than one private folder exists for this project. Ask an administrator to check Drive.');
      id = data.files[0]?.id;
      if (!id) {
        id = (await auth.request<{ id: string }>({
          url: API, method: 'POST', params: { fields: 'id' },
          data: { name: `${name} · Private documents`, mimeType: FOLDER, parents: [privateRoot()], appProperties: { privateProject: key, application: APP_TAG } },
        })).data.id;
      }
    }
    const { data: folder } = await auth.request<DriveFile>({ url: `${API}/${id}`, params: { fields: 'mimeType,trashed,ownedByMe' } });
    const grants = await permissions(id, auth);
    if (folder.trashed || folder.mimeType !== FOLDER || !folder.ownedByMe || !grants.length || grants.some(p => p.role !== 'owner')) {
      throw new DriveError('The private Drive folder has unexpected sharing. Make it owner-only again before adding restricted documents.');
    }
    return id;
  } catch (error) {
    throw friendlyDriveError(error);
  }
}

// ─── Document files ──────────────────────────────────────────────────────────

export function fileUrl(file: { id: string; mimeType: string }): string {
  return file.mimeType === GOOGLE_SHEET
    ? `https://docs.google.com/spreadsheets/d/${file.id}/edit`
    : `https://docs.google.com/document/d/${file.id}/edit`;
}

export function driveIdFromUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['docs.google.com', 'drive.google.com'].includes(url.hostname) || url.username || url.password) throw new Error();
    const id = url.pathname.match(/\/d\/([A-Za-z0-9_-]+)/)?.[1] || url.searchParams.get('id');
    if (!validId(id ?? undefined)) throw new Error();
    return id!;
  } catch {
    throw new DriveError('Use a Google Docs or Google Sheets file link.');
  }
}

function nativeOnly(file: DriveFile): DriveFile {
  if (file.trashed || ![GOOGLE_DOC, GOOGLE_SHEET].includes(file.mimeType)) {
    throw new DriveError('Choose a Google Docs or Google Sheets file, not a folder, shortcut or other file.');
  }
  if (file.capabilities?.canCopy === false) throw new DriveError('The workspace Google account is not allowed to copy this file.');
  return file;
}

export async function readNativeFile(url: string, auth: DriveAuth = driveClient()): Promise<DriveFile> {
  try {
    const id = driveIdFromUrl(url);
    return nativeOnly((await auth.request<DriveFile>({ url: `${API}/${id}`, params: { fields: FILE_FIELDS, supportsAllDrives: true } })).data);
  } catch (error) {
    throw friendlyDriveError(error);
  }
}

export interface Upload { name: string; bytes: Uint8Array; source: string; target: string; hash: string }

// Checks an uploaded file: size, a supported type, and contents that match the extension.
export async function readUpload(file: File): Promise<Upload> {
  if (!file || !file.name || file.size === 0) throw new DriveError('Choose a non-empty file to upload.');
  if (file.size > MAX_UPLOAD_BYTES) throw new DriveError('Choose a file no larger than 10 MB.');
  const format = uploadFormat(file.name);
  if (!format) throw new DriveError('Unsupported file type. Upload Word, PDF, text, Excel, CSV or OpenDocument files.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop()!.toLowerCase();
  const zip = ['docx', 'xlsx', 'odt', 'ods'].includes(ext);
  if (
    (zip && bytes.subarray(0, 2).toString() !== 'PK') ||
    (ext === 'pdf' && !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) ||
    (['doc', 'xls'].includes(ext) && bytes.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1') ||
    (['txt', 'csv', 'tsv', 'html', 'htm'].includes(ext) && bytes.includes(0))
  ) {
    throw new DriveError('The file contents do not match its extension. Choose the original document file.');
  }
  return { name: file.name, bytes, ...format, hash: createHash('sha256').update(bytes).digest('hex') };
}

// Makes a Google Doc / Sheet in `parent`: a copy of sourceUrl (template or pasted link), or the
// converted upload. `key` identifies the request: a retry finds and reuses the file it already made.
export async function createNativeFile(
  options: { parent: string; name: string; key: string; sourceUrl?: string; upload?: Upload },
  auth: DriveAuth = driveClient(),
): Promise<SavedFile> {
  const { parent, name, key } = options;
  if (!validId(parent) || !/^(document|template):[0-9a-f-]{36}$/.test(key)) throw new DriveError('Invalid document destination or request.');
  try {
    const upload = options.upload ?? null;
    const source = options.sourceUrl ? await readNativeFile(options.sourceUrl, auth) : null;
    if (!upload && !source) throw new DriveError('Choose a template, a file to upload, or a link.');
    const expected = upload?.target || source!.mimeType;
    const fingerprint = createHash('sha256').update(JSON.stringify({ parent, name, source: source?.id, hash: upload?.hash })).digest('hex');

    const { data: root } = await auth.request<DriveFile>({ url: `${API}/${parent}`, params: { fields: FILE_FIELDS, supportsAllDrives: true } });
    if (root.trashed || root.mimeType !== FOLDER || !root.capabilities?.canAddChildren) {
      throw new DriveError('The workspace Google account cannot add files to the destination folder.');
    }
    const { data: found } = await auth.request<{ files: DriveFile[] }>({
      url: API,
      params: {
        q: `'${parent}' in parents and trashed=false and appProperties has { key='documentCreationKey' and value='${key}' }`,
        fields: `files(${FILE_FIELDS})`, supportsAllDrives: true, includeItemsFromAllDrives: true, pageSize: 2,
      },
    });
    let file = found.files?.[0];
    if (file && file.appProperties?.fingerprint !== fingerprint) {
      throw new DriveError('This request already created a different file. Close the form and open it again to change its content.');
    }
    if (!file) {
      const metadata = { name, parents: [parent], appProperties: { documentCreationKey: key, fingerprint, application: APP_TAG } };
      if (source) {
        file = (await auth.request<DriveFile>({ url: `${API}/${source.id}/copy`, method: 'POST', params: { fields: FILE_FIELDS, supportsAllDrives: true }, data: metadata, timeout: 90_000 })).data;
        if (file.id === source.id) throw new DriveError('Google did not make a separate copy of the file.');
      } else {
        const { data: about } = await auth.request<{ importFormats: Record<string, string[]> }>({ url: 'https://www.googleapis.com/drive/v3/about', params: { fields: 'importFormats' } });
        if (!about.importFormats[upload!.source]?.includes(expected)) throw new DriveError('Google Drive does not currently convert this file type.');
        const session = await auth.request({
          url: 'https://www.googleapis.com/upload/drive/v3/files', method: 'POST',
          params: { uploadType: 'resumable', fields: FILE_FIELDS, supportsAllDrives: true },
          headers: { 'X-Upload-Content-Type': upload!.source, 'X-Upload-Content-Length': String(upload!.bytes.length) },
          data: { ...metadata, mimeType: expected },
        });
        const location = session.headers.get('location');
        if (!location || new URL(location).origin !== 'https://www.googleapis.com') throw new DriveError('Google did not provide a valid upload session.');
        file = (await auth.request<DriveFile>({ url: location, method: 'PUT', headers: { 'Content-Type': upload!.source }, data: upload!.bytes, timeout: 90_000 })).data;
      }
    }
    nativeOnly(file);
    if (file.mimeType !== expected || !file.parents?.includes(parent)) throw new DriveError('Google did not confirm the new file in the right folder.');
    return { id: file.id, url: fileUrl(file), mimeType: file.mimeType };
  } catch (error) {
    throw friendlyDriveError(error);
  }
}

// ─── Sharing ─────────────────────────────────────────────────────────────────

export async function permissions(fileId: string, auth: DriveAuth = driveClient()): Promise<Permission[]> {
  const result: Permission[] = [];
  let pageToken: string | undefined;
  do {
    const { data } = await auth.request<{ permissions?: Permission[]; nextPageToken?: string }>({
      url: `${API}/${fileId}/permissions`,
      params: { fields: 'nextPageToken,permissions(id,type,role,emailAddress)', pageSize: 100, pageToken, supportsAllDrives: true },
    });
    result.push(...(data.permissions || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return result;
}

// A new restricted file must be owner-only, and editors may not re-share it.
export async function protectPrivateFile(id: string, auth: DriveAuth = driveClient()): Promise<void> {
  const grants = await permissions(id, auth);
  if (!grants.length || grants.some(p => p.role !== 'owner')) throw new DriveError('Drive did not create a private copy. Nobody was given access.');
  await auth.request({ url: `${API}/${id}`, method: 'PATCH', data: { writersCanShare: false } });
}

// "Anyone with the link" documents: viewable by link, not discoverable.
export async function makePublic(id: string, auth: DriveAuth = driveClient()): Promise<void> {
  if ((await permissions(id, auth)).some(p => p.type === 'anyone' && ['reader', 'writer'].includes(p.role))) return;
  await auth.request({ url: `${API}/${id}/permissions`, method: 'POST', params: { supportsAllDrives: true }, data: { type: 'anyone', role: 'reader', allowFileDiscovery: false } });
}

// Gives one person reader or writer access; an existing grant is moved to the requested role either way.
// Returns the permission id (null if the person owns the file).
export async function grantDocument(id: string, email: string, role: DriveRole, auth: DriveAuth = driveClient()): Promise<string | null> {
  const found = (await permissions(id, auth)).find(p => p.type === 'user' && p.emailAddress?.toLowerCase() === email.toLowerCase());
  if (found) {
    if (found.role === 'owner') return null;
    if (found.role !== role) {
      const { data } = await auth.request<{ id: string; role: string }>({
        url: `${API}/${id}/permissions/${found.id}`, method: 'PATCH', params: { fields: 'id,role', supportsAllDrives: true }, data: { role },
      });
      if (data.id !== found.id || data.role !== role) throw new DriveError('Drive did not confirm the access change. Please try again.');
    }
    return found.id;
  }
  const { data } = await auth.request<{ id: string }>({
    url: `${API}/${id}/permissions`, method: 'POST', params: { fields: 'id', supportsAllDrives: true, sendNotificationEmail: true },
    data: { type: 'user', role, emailAddress: email },
  });
  if (!data.id) throw new DriveError('Drive did not confirm access. Please try again.');
  return data.id;
}

export async function revokeDocument(id: string, permissionId: string, auth: DriveAuth = driveClient()): Promise<void> {
  try {
    await auth.request({ url: `${API}/${id}/permissions/${permissionId}`, method: 'DELETE', params: { supportsAllDrives: true } });
  } catch (error) {
    if (httpStatus(error) !== 404) throw error;
  }
}

// Removes one person's access by email (whatever permission id they hold now).
export async function revokeEmail(fileId: string, email: string, auth: DriveAuth = driveClient()): Promise<void> {
  try {
    const found = (await permissions(fileId, auth)).find(p => p.type === 'user' && p.emailAddress?.toLowerCase() === email.toLowerCase());
    if (found && found.role !== 'owner') await revokeDocument(fileId, found.id, auth);
  } catch (error) {
    if (httpStatus(error) !== 404) throw error; // the file is gone: nothing left to revoke
  }
}

// Deleting a document: remove every non-owner permission, then move the file to Drive Trash. Only files
// this dashboard created are touched; a pasted link's original is never trashed.
export async function trashDocumentFile(id: string, auth: DriveAuth = driveClient()): Promise<'missing' | 'kept' | 'trashed'> {
  let file: DriveFile;
  try {
    file = (await auth.request<DriveFile>({ url: `${API}/${id}`, params: { fields: 'id,mimeType,trashed,ownedByMe,appProperties', supportsAllDrives: true } })).data;
  } catch (error) {
    if (httpStatus(error) === 404) return 'missing';
    throw error;
  }
  if (file.appProperties?.application !== APP_TAG || !file.ownedByMe) return 'kept';
  for (const p of await permissions(id, auth)) if (p.role !== 'owner') await revokeDocument(id, p.id, auth);
  if (!file.trashed) await auth.request({ url: `${API}/${id}`, method: 'PATCH', params: { supportsAllDrives: true }, data: { trashed: true } });
  return 'trashed';
}

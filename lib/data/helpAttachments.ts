import mysql from 'mysql2/promise';
import { getPool } from './mysql';

// Screenshots sent with a Help request (the Apply form). Kept in MySQL next to the request, so
// they survive deploys and are served only through /api/help/attachments (never as public files).

export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

// The type of an image from its first bytes — the browser's own claim isn't trusted.
export function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.length > 6 && buf.subarray(0, 4).toString('ascii') === 'GIF8') return { mime: 'image/gif', ext: 'gif' };
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

export async function countAttachments(helpId: number): Promise<number> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>('SELECT COUNT(*) AS n FROM `help_attachments` WHERE help_id = ?', [helpId]);
  return Number(rows[0].n);
}

export async function addAttachment(helpId: number, name: string, mime: string, data: Buffer): Promise<number> {
  const [res] = await getPool().query<mysql.ResultSetHeader>(
    'INSERT INTO `help_attachments` (help_id, file_name, mime, size, data) VALUES (?, ?, ?, ?, ?)',
    [helpId, name.slice(0, 255), mime, data.length, data]
  );
  return res.insertId;
}

// id + name of the screenshots of several requests (no image data)
export async function listAttachments(helpIds: number[]): Promise<Map<number, { id: number; name: string }[]>> {
  const out = new Map<number, { id: number; name: string }[]>();
  if (helpIds.length === 0) return out;
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    'SELECT id, help_id, file_name FROM `help_attachments` WHERE help_id IN (?) ORDER BY id', [helpIds]
  );
  for (const r of rows) {
    const list = out.get(Number(r.help_id)) ?? [];
    list.push({ id: Number(r.id), name: String(r.file_name) });
    out.set(Number(r.help_id), list);
  }
  return out;
}

export async function getAttachment(id: number): Promise<{ helpId: number; mime: string; name: string; data: Buffer } | null> {
  const [rows] = await getPool().query<mysql.RowDataPacket[]>(
    'SELECT help_id, mime, file_name, data FROM `help_attachments` WHERE id = ?', [id]
  );
  if (rows.length === 0) return null;
  return { helpId: Number(rows[0].help_id), mime: String(rows[0].mime), name: String(rows[0].file_name), data: rows[0].data as Buffer };
}

export async function deleteAttachmentsOf(helpId: number): Promise<void> {
  await getPool().query('DELETE FROM `help_attachments` WHERE help_id = ?', [helpId]);
}

import type mysql from 'mysql2/promise';

// The Projects tables. `npm run db:migrate` (lib/data/mysql.ts → ensureSchema) creates them when
// missing, adds the Member level to older doc_project_members tables, and never drops anything. People are the dashboard's own accounts: user_id is the
// `users` table's id. There is deliberately no foreign key to `users`, so removing an account in the
// Admin Portal works exactly as before; the sharing ledger keeps the email each grant went to, so that
// person's Drive access can still be removed afterwards (Retry sharing on the project does it).

const OPTIONS = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

export const PROJECT_TABLES_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS \`doc_projects\` (
  \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`name\` VARCHAR(200) NOT NULL,
  \`client_name\` VARCHAR(200) NULL,
  \`platform\` VARCHAR(100) NULL,
  \`website_url\` VARCHAR(2048) NULL,
  \`description\` TEXT NULL,
  \`status\` ENUM('planning','in_progress','on_hold','completed') NOT NULL DEFAULT 'planning',
  \`is_archived\` TINYINT(1) NOT NULL DEFAULT 0,
  \`drive_folder_id\` VARCHAR(128) NULL,
  \`drive_folder_url\` VARCHAR(512) NULL,
  \`private_drive_folder_id\` VARCHAR(128) NULL,
  \`creation_key\` CHAR(36) NOT NULL,
  \`created_by\` INT UNSIGNED NULL,
  \`created_by_name\` VARCHAR(191) NULL,
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uniq_creation_key\` (\`creation_key\`)
) ${OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS \`doc_project_members\` (
  \`project_id\` INT UNSIGNED NOT NULL,
  \`user_id\` INT UNSIGNED NOT NULL,
  \`access_level\` ENUM('member','viewer','editor','manager') NOT NULL DEFAULT 'viewer',
  \`added_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`project_id\`, \`user_id\`),
  KEY \`idx_user\` (\`user_id\`),
  CONSTRAINT \`fk_doc_member_project\` FOREIGN KEY (\`project_id\`) REFERENCES \`doc_projects\` (\`id\`) ON DELETE CASCADE
) ${OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS \`doc_templates\` (
  \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`name\` VARCHAR(200) NOT NULL,
  \`category\` VARCHAR(100) NOT NULL,
  \`platform\` VARCHAR(100) NULL,
  \`description\` TEXT NULL,
  \`drive_file_id\` VARCHAR(128) NOT NULL,
  \`source_url\` VARCHAR(2048) NOT NULL,
  \`mime_type\` VARCHAR(100) NOT NULL,
  \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
  \`creation_key\` CHAR(36) NOT NULL,
  \`created_by\` INT UNSIGNED NULL,
  \`created_by_name\` VARCHAR(191) NULL,
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uniq_creation_key\` (\`creation_key\`)
) ${OPTIONS}`,

  `CREATE TABLE IF NOT EXISTS \`doc_documents\` (
  \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  \`project_id\` INT UNSIGNED NOT NULL,
  \`template_id\` INT UNSIGNED NULL,
  \`title\` VARCHAR(255) NOT NULL,
  \`drive_file_id\` VARCHAR(128) NULL,
  \`document_url\` VARCHAR(2048) NOT NULL,
  \`mime_type\` VARCHAR(100) NULL,
  \`source_type\` ENUM('template','upload','url') NOT NULL,
  \`visibility\` ENUM('public','invite') NOT NULL DEFAULT 'invite',
  \`link_role\` ENUM('reader','writer') NOT NULL DEFAULT 'reader',
  \`creation_key\` CHAR(36) NOT NULL,
  \`created_by\` INT UNSIGNED NULL,
  \`created_by_name\` VARCHAR(191) NULL,
  \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uniq_creation_key\` (\`creation_key\`),
  KEY \`idx_project\` (\`project_id\`),
  CONSTRAINT \`fk_doc_document_project\` FOREIGN KEY (\`project_id\`) REFERENCES \`doc_projects\` (\`id\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_doc_document_template\` FOREIGN KEY (\`template_id\`) REFERENCES \`doc_templates\` (\`id\`) ON DELETE SET NULL
) ${OPTIONS}`,

  // The Drive sharing ledger: one row per (restricted document, person). The intent is saved before
  // Google is called, so a removal can also take back a grant whose answer was lost.
  `CREATE TABLE IF NOT EXISTS \`doc_document_access\` (
  \`document_id\` INT UNSIGNED NOT NULL,
  \`user_id\` INT UNSIGNED NOT NULL,
  \`email\` VARCHAR(191) NOT NULL,
  \`status\` ENUM('pending','granted','revoked') NOT NULL DEFAULT 'pending',
  \`drive_role\` ENUM('reader','writer') NULL,
  \`drive_permission_id\` VARCHAR(128) NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`document_id\`, \`user_id\`),
  KEY \`idx_user\` (\`user_id\`),
  CONSTRAINT \`fk_doc_access_document\` FOREIGN KEY (\`document_id\`) REFERENCES \`doc_documents\` (\`id\`) ON DELETE CASCADE
) ${OPTIONS}`,

  // Admin Portal → Projects: who may use Projects, create projects, have full access, and is added
  // to new projects automatically. One row per department (scope_key = Web / Marketing / PM / None)
  // or per person (scope_key = users.id). A NULL column means "not set here" (see lib/projects/policy.ts).
  `CREATE TABLE IF NOT EXISTS \`doc_project_access\` (
  \`scope\` ENUM('department','user') NOT NULL,
  \`scope_key\` VARCHAR(64) NOT NULL,
  \`can_access\` TINYINT(1) NULL,
  \`can_create\` TINYINT(1) NULL,
  \`full_access\` TINYINT(1) NULL,
  \`auto_add\` ENUM('none','viewer','editor','manager') NULL,
  \`updated_by\` VARCHAR(191) NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`scope\`, \`scope_key\`)
) ${OPTIONS}`,

  // Pins: each person can pin projects and documents to the top of their own lists.
  `CREATE TABLE IF NOT EXISTS \`doc_pins\` (
  \`user_id\` INT UNSIGNED NOT NULL,
  \`kind\` ENUM('project','document') NOT NULL,
  \`item_id\` INT UNSIGNED NOT NULL,
  \`pinned_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`user_id\`, \`kind\`, \`item_id\`),
  KEY \`idx_item\` (\`kind\`, \`item_id\`)
) ${OPTIONS}`,

  // Admin Portal → Projects → Always editors: email addresses given Google editor access to every
  // "Project members only" document, whether or not they have a dashboard account or are members.
  `CREATE TABLE IF NOT EXISTS \`doc_always_editors\` (
  \`email\` VARCHAR(191) NOT NULL,
  \`added_by\` VARCHAR(191) NULL,
  \`added_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`email\`)
) ${OPTIONS}`,

  // Their sharing ledger, one row per (restricted document, email), like doc_document_access.
  `CREATE TABLE IF NOT EXISTS \`doc_document_email_access\` (
  \`document_id\` INT UNSIGNED NOT NULL,
  \`email\` VARCHAR(191) NOT NULL,
  \`status\` ENUM('pending','granted','revoked') NOT NULL DEFAULT 'pending',
  \`drive_permission_id\` VARCHAR(128) NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`document_id\`, \`email\`),
  CONSTRAINT \`fk_doc_email_access_document\` FOREIGN KEY (\`document_id\`) REFERENCES \`doc_documents\` (\`id\`) ON DELETE CASCADE
) ${OPTIONS}`,

  // A person's level on one "Project members only" document, when it differs from what their project
  // level gives them (lib/projects/rules.ts → defaultDocLevel). It wins over the project level.
  `CREATE TABLE IF NOT EXISTS \`doc_document_permissions\` (
  \`document_id\` INT UNSIGNED NOT NULL,
  \`user_id\` INT UNSIGNED NOT NULL,
  \`level\` ENUM('none','viewer','editor') NOT NULL,
  \`set_by\` VARCHAR(191) NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`document_id\`, \`user_id\`),
  KEY \`idx_user\` (\`user_id\`),
  CONSTRAINT \`fk_doc_permission_document\` FOREIGN KEY (\`document_id\`) REFERENCES \`doc_documents\` (\`id\`) ON DELETE CASCADE
) ${OPTIONS}`,

  // "Request Access" from All Projects: one open request per person and project, until they are added.
  `CREATE TABLE IF NOT EXISTS \`doc_access_requests\` (
  \`project_id\` INT UNSIGNED NOT NULL,
  \`user_id\` INT UNSIGNED NOT NULL,
  \`requested_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`project_id\`, \`user_id\`),
  CONSTRAINT \`fk_doc_request_project\` FOREIGN KEY (\`project_id\`) REFERENCES \`doc_projects\` (\`id\`) ON DELETE CASCADE
) ${OPTIONS}`,
];

// The first list of always editors. Added only when the table is first created, so removing someone
// in the Admin Portal is never undone by a later migration.
const FIRST_ALWAYS_EDITORS = [
  'vasu@cybernext.io',
  'vineet@cybernext.io',
  'noor@cybernext.io',
  'ai.ops@cybernext.io',
  'vcybernext@gmail.com',
];

export async function ensureProjectSchema(pool: mysql.Pool): Promise<void> {
  const [existing] = await pool.query<mysql.RowDataPacket[]>("SHOW TABLES LIKE 'doc_always_editors'");
  for (const sql of PROJECT_TABLES_SQL) await pool.query(sql);
  // The Member level (added later): tables created before it get it added to their list of levels.
  const [levels] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'doc_project_members' AND COLUMN_NAME = 'access_level'"
  );
  if (levels[0] && !String(levels[0].COLUMN_TYPE).includes("'member'")) {
    await pool.query("ALTER TABLE `doc_project_members` MODIFY `access_level` ENUM('member','viewer','editor','manager') NOT NULL DEFAULT 'viewer'");
  }
  // Link access for "Anyone with the link" documents (added later): older documents stay view-only.
  const [linkRole] = await pool.query<mysql.RowDataPacket[]>(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'doc_documents' AND COLUMN_NAME = 'link_role'"
  );
  if (!linkRole.length) {
    await pool.query("ALTER TABLE `doc_documents` ADD COLUMN `link_role` ENUM('reader','writer') NOT NULL DEFAULT 'reader' AFTER `visibility`");
  }
  // One Creator per project, the person who created it: anyone else who was made a Creator becomes an Editor.
  await pool.query(
    `UPDATE doc_project_members m JOIN doc_projects p ON p.id = m.project_id
        SET m.access_level = 'editor'
      WHERE m.access_level = 'manager' AND (p.created_by IS NULL OR m.user_id <> p.created_by)`
  );
  // Completed projects: the Completed status and the Completed list are the same thing.
  await pool.query("UPDATE doc_projects SET status = 'completed' WHERE is_archived = 1 AND status <> 'completed'");
  await pool.query("UPDATE doc_projects SET is_archived = 1 WHERE status = 'completed' AND is_archived = 0");
  if (!existing.length) {
    await pool.query('INSERT IGNORE INTO doc_always_editors (email, added_by) VALUES ?', [FIRST_ALWAYS_EDITORS.map(e => [e, 'setup'])]);
  }
}

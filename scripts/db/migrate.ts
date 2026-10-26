// Creates the MySQL tables (and adds any column a table is missing).
//   npm run db:migrate            apply to the database in .env.local
//   npm run db:migrate -- --print print the SQL instead (e.g. for phpMyAdmin)
import './env';
import { CHANGE_LOG_SQL, closePool, createTableSql, ensureSchema } from '../../lib/data/mysql';
import { DATASETS } from '../../lib/data/datasets';

async function main() {
  if (process.argv.includes('--print')) {
    console.log([CHANGE_LOG_SQL, ...DATASETS.map(createTableSql)].join(';\n\n') + ';');
    return;
  }
  const changes = await ensureSchema();
  console.log(`Schema ready in "${process.env.MYSQL_DATABASE}": ${DATASETS.length} tables + change_log.`);
  changes.forEach(c => console.log(`  ${c}`));
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(closePool);

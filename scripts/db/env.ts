// Loads .env.local (and friends) the same way `next dev` / `next start` do,
// so the scripts use the app's own MYSQL_* settings.
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

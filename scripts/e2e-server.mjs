import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const dbPath = resolve(process.cwd(), 'test-results/e2e-quest-forge.db');
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${dbPath}${suffix}`, { force: true });
}

process.env.NODE_ENV = 'production';
process.env.HOST = '127.0.0.1';
process.env.PORT = process.env.E2E_PORT || '3199';
process.env.DATABASE_PATH = dbPath;
process.env.RATE_LIMIT_MAX = '1000';
process.env.SEED_DEMOS = 'true';

await import('../apps/server/dist/index.js');

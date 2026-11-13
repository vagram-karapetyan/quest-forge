import { lt } from 'drizzle-orm';
import type { AppDatabase } from './client.js';
import { adminSessionsTable, gameSessionsTable } from './schema.js';

export function purgeExpiredGameSessions(db: AppDatabase, ttlMs: number, now = Date.now()): number {
  const cutoff = now - ttlMs;
  const res = db.delete(gameSessionsTable).where(lt(gameSessionsTable.updatedAt, cutoff)).run();
  return res.changes;
}

export function startSessionCleanupJob(
  db: AppDatabase,
  gameSessionTtlMs: number,
  intervalMs = 3_600_000,
): { runOnce: () => { gamesRemoved: number; adminsRemoved: number }; stop: () => void } {
  const runOnce = () => {
    const now = Date.now();
    const gamesRemoved = purgeExpiredGameSessions(db, gameSessionTtlMs, now);
    const adminsRemoved = db
      .delete(adminSessionsTable)
      .where(lt(adminSessionsTable.expiresAt, now))
      .run().changes;
    return { gamesRemoved, adminsRemoved };
  };

  const timer = setInterval(runOnce, intervalMs);
  timer.unref();

  return {
    runOnce,
    stop: () => {
      clearInterval(timer);
    },
  };
}

import { and, eq, gt, lt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../config.js';
import type { AppDatabase } from '../db/client.js';
import { adminSessionsTable } from '../db/schema.js';

export const ADMIN_COOKIE_NAME = 'qf_admin_session';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a, 'utf8').digest();
  const hashB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(hashA, hashB);
}

export function extractAuthToken(request: FastifyRequest): string | null {
  const cookieToken = request.cookies[ADMIN_COOKIE_NAME];
  if (cookieToken && cookieToken.trim().length > 0) {
    return cookieToken.trim();
  }

  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer.length > 0) {
      return bearer;
    }
  }

  return null;
}

export function createAdminSession(
  db: AppDatabase,
  username: string,
  ttlMs: number,
): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + ttlMs;
  db.insert(adminSessionsTable)
    .values({
      id: crypto.randomUUID(),
      tokenHash: sha256Hex(token),
      username,
      expiresAt,
      createdAt: now,
    })
    .run();
  return { token, expiresAt };
}

export function verifyAdminSession(
  db: AppDatabase,
  token: string,
): { username: string; expiresAt: number } | null {
  const now = Date.now();
  const row = db
    .select()
    .from(adminSessionsTable)
    .where(
      and(
        eq(adminSessionsTable.tokenHash, sha256Hex(token)),
        gt(adminSessionsTable.expiresAt, now),
      ),
    )
    .get();
  if (!row) {
    return null;
  }
  return { username: row.username, expiresAt: row.expiresAt };
}

export function revokeAdminSession(db: AppDatabase, token: string): void {
  db.delete(adminSessionsTable)
    .where(eq(adminSessionsTable.tokenHash, sha256Hex(token)))
    .run();
}

export function purgeExpiredAdminSessions(db: AppDatabase, now = Date.now()): number {
  const res = db.delete(adminSessionsTable).where(lt(adminSessionsTable.expiresAt, now)).run();
  return res.changes;
}

export function makeRequireAuthorAuth(config: AppConfig, db: AppDatabase) {
  return async function requireAuthorAuth(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!config.authEnabled) {
      return;
    }

    const token = extractAuthToken(request);
    if (!token) {
      return reply.code(401).send({ code: 'ERR_AUTH_REQUIRED', params: {} });
    }

    const session = verifyAdminSession(db, token);
    if (!session) {
      return reply.code(401).send({ code: 'ERR_AUTH_REQUIRED', params: {} });
    }
  };
}

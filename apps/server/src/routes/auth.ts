import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { AppDatabase } from '../db/client.js';
import {
  ADMIN_COOKIE_NAME,
  createAdminSession,
  extractAuthToken,
  revokeAdminSession,
  timingSafeEqualStrings,
  verifyAdminSession,
} from '../middleware/auth.js';

const LoginBodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig, db: AppDatabase): void {
  app.get('/api/auth/status', (request) => {
    if (!config.authEnabled) {
      return {
        authEnabled: false,
        authenticated: true,
        username: config.adminUsername,
      };
    }

    const token = extractAuthToken(request);
    if (!token) {
      return {
        authEnabled: true,
        authenticated: false,
        username: null,
      };
    }

    const session = verifyAdminSession(db, token);
    if (!session) {
      return {
        authEnabled: true,
        authenticated: false,
        username: null,
      };
    }

    return {
      authEnabled: true,
      authenticated: true,
      username: session.username,
    };
  });

  app.post('/api/auth/login', (request, reply) => {
    if (!config.authEnabled) {
      return {
        ok: true,
        authEnabled: false,
        authenticated: true,
        username: config.adminUsername,
        token: null,
      };
    }

    const parsed = LoginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'ERR_VALIDATION',
        params: { field: 'credentials' },
      });
    }

    const validUser = timingSafeEqualStrings(parsed.data.username, config.adminUsername);
    const validPass = timingSafeEqualStrings(parsed.data.password, config.adminPassword);

    if (!validUser || !validPass) {
      return reply.code(401).send({
        code: 'ERR_INVALID_CREDENTIALS',
        params: {},
      });
    }

    const session = createAdminSession(db, config.adminUsername, config.adminSessionTtlMs);
    const forwardedProto = request.headers['x-forwarded-proto'];
    const isHttps =
      request.protocol === 'https' ||
      (typeof forwardedProto === 'string' && forwardedProto.split(',')[0]?.trim() === 'https');

    void reply.setCookie(ADMIN_COOKIE_NAME, session.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isHttps,
      maxAge: Math.floor(config.adminSessionTtlMs / 1000),
    });

    return {
      ok: true,
      authEnabled: true,
      authenticated: true,
      username: config.adminUsername,
      token: session.token,
    };
  });

  app.post('/api/auth/logout', (request, reply) => {
    const token = extractAuthToken(request);
    if (token) {
      revokeAdminSession(db, token);
    }
    void reply.clearCookie(ADMIN_COOKIE_NAME, { path: '/' });
    return { ok: true };
  });
}

import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import type Database from 'better-sqlite3';
import Fastify, { type FastifyInstance } from 'fastify';
import { loadConfig, type AppConfig } from './config.js';
import { openDatabase, type AppDatabase } from './db/client.js';
import { QuestRepository } from './db/quest-repo.js';
import { startSessionCleanupJob } from './db/session-cleanup.js';
import { ApiError } from './errors.js';
import { makeRequireAuthorAuth } from './middleware/auth.js';
import { makeRateLimitHook, RateLimiter } from './middleware/rate-limit.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerChoiceRoutes } from './routes/choices.js';
import { registerGameRoutes } from './routes/games.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerQuestRoutes } from './routes/quests.js';
import { registerSceneRoutes } from './routes/scenes.js';
import { seedDemosIfEmpty } from './seed/demos.js';

export type BuiltApp = {
  app: FastifyInstance;
  config: AppConfig;
  db: AppDatabase;
  sqlite: Database.Database;
  repo: QuestRepository;
  rateLimiter: RateLimiter;
  cleanup: ReturnType<typeof startSessionCleanupJob>;
};

export async function buildApp(
  envOverrides: Partial<Record<string, string>> = {},
): Promise<BuiltApp> {
  const config = loadConfig(envOverrides);
  const { sqlite, db } = openDatabase(config.databasePath);
  const repo = new QuestRepository(db);

  if (config.seedDemos) {
    seedDemosIfEmpty(repo);
  }

  const cleanup = startSessionCleanupJob(db, config.gameSessionTtlMs);
  cleanup.runOnce();

  const app = Fastify({
    logger: config.nodeEnv !== 'test',
  });

  await app.register(fastifyCookie);

  const rateLimiter = new RateLimiter({
    max: config.rateLimitMax,
    windowMs: config.rateLimitWindowMs,
    trustedProxies: config.trustedProxies,
  });

  app.addHook('onRequest', makeRateLimitHook(rateLimiter));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({
        code: error.code,
        params: error.params,
      });
    }
    app.log.error(error);
    return reply.code(500).send({
      code: 'ERR_INTERNAL_SERVER',
      params: {},
    });
  });

  const requireAuthorAuth = makeRequireAuthorAuth(config, db);

  registerHealthRoutes(app, config);
  registerAuthRoutes(app, config, db);
  registerQuestRoutes(app, config, repo, requireAuthorAuth);
  registerSceneRoutes(app, repo, requireAuthorAuth);
  registerChoiceRoutes(app, repo, requireAuthorAuth);
  registerGameRoutes(app, db, repo);

  if (config.staticDir) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      prefix: '/',
      wildcard: false,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ code: 'ERR_NOT_FOUND', params: {} });
      }
      return reply.sendFile('index.html');
    });
  }

  app.addHook('onClose', () => {
    cleanup.stop();
    rateLimiter.dispose();
    sqlite.close();
  });

  return { app, config, db, sqlite, repo, rateLimiter, cleanup };
}

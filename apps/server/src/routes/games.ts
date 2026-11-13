import {
  APP_LOCALES,
  applyChoice,
  createInitialState,
  getGameView,
  undoStep,
  type GameState,
} from '@quest-forge/engine';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppDatabase } from '../db/client.js';
import type { QuestRepository } from '../db/quest-repo.js';
import { gameSessionsTable } from '../db/schema.js';

const StartGameSchema = z.object({
  questId: z.string().min(1),
  locale: z.enum(APP_LOCALES).default('ru'),
});

const LocaleQuerySchema = z.object({
  locale: z.enum(APP_LOCALES).default('ru'),
});

const ChoiceActionSchema = z.object({
  choiceId: z.string().min(1),
  locale: z.enum(APP_LOCALES).default('ru'),
});

const UndoActionSchema = z.object({
  locale: z.enum(APP_LOCALES).default('ru'),
});

function rowToState(row: typeof gameSessionsTable.$inferSelect): GameState {
  return {
    currentSceneId: row.currentSceneId,
    inventory: row.inventory,
    variables: row.variables,
    visitedSceneIds: row.visitedSceneIds,
    log: row.log,
    steps: row.steps,
    undoStack: row.undoStack,
  };
}

export function registerGameRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  repo: QuestRepository,
): void {
  app.post('/api/games/start', (request, reply) => {
    const parsed = StartGameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'ERR_VALIDATION',
        params: { detail: 'invalid_start_payload' },
      });
    }

    const quest = repo.getQuestById(parsed.data.questId);
    if (!quest) {
      return reply
        .code(404)
        .send({ code: 'ERR_QUEST_NOT_FOUND', params: { id: parsed.data.questId } });
    }

    const startRes = createInitialState(quest);
    if (!startRes.ok) {
      return reply.code(409).send({ code: startRes.code, params: startRes.params });
    }

    const now = Date.now();
    const sessionId = crypto.randomUUID();
    db.insert(gameSessionsTable)
      .values({
        id: sessionId,
        questId: quest.id,
        currentSceneId: startRes.state.currentSceneId,
        inventory: startRes.state.inventory,
        variables: startRes.state.variables,
        visitedSceneIds: startRes.state.visitedSceneIds,
        log: startRes.state.log,
        steps: startRes.state.steps,
        undoStack: startRes.state.undoStack,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return reply.code(201).send({
      sessionId,
      questId: quest.id,
      questTitle: quest.title,
      view: getGameView(quest, startRes.state, parsed.data.locale),
    });
  });

  app.get('/api/games/:sessionId', (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const parsedQuery = LocaleQuerySchema.safeParse(request.query);
    const locale = parsedQuery.success ? parsedQuery.data.locale : 'ru';

    const row = db
      .select()
      .from(gameSessionsTable)
      .where(eq(gameSessionsTable.id, sessionId))
      .get();
    if (!row) {
      return reply.code(404).send({ code: 'ERR_SESSION_NOT_FOUND', params: { sessionId } });
    }

    const quest = repo.getQuestById(row.questId);
    if (!quest) {
      return reply.code(404).send({ code: 'ERR_QUEST_NOT_FOUND', params: { id: row.questId } });
    }

    const state = rowToState(row);
    return {
      sessionId: row.id,
      questId: quest.id,
      questTitle: quest.title,
      view: getGameView(quest, state, locale),
    };
  });

  app.post('/api/games/:sessionId/choice', (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const parsed = ChoiceActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'ERR_VALIDATION',
        params: { detail: 'invalid_choice_action' },
      });
    }

    const row = db
      .select()
      .from(gameSessionsTable)
      .where(eq(gameSessionsTable.id, sessionId))
      .get();
    if (!row) {
      return reply.code(404).send({ code: 'ERR_SESSION_NOT_FOUND', params: { sessionId } });
    }

    const quest = repo.getQuestById(row.questId);
    if (!quest) {
      return reply.code(404).send({ code: 'ERR_QUEST_NOT_FOUND', params: { id: row.questId } });
    }

    const res = applyChoice(quest, rowToState(row), parsed.data.choiceId, parsed.data.locale);
    if (!res.ok) {
      return reply.code(409).send({
        code: res.code,
        params: res.params,
        lockReasons: res.lockReasons ?? [],
      });
    }

    db.update(gameSessionsTable)
      .set({
        currentSceneId: res.state.currentSceneId,
        inventory: res.state.inventory,
        variables: res.state.variables,
        visitedSceneIds: res.state.visitedSceneIds,
        log: res.state.log,
        steps: res.state.steps,
        undoStack: res.state.undoStack,
        updatedAt: Date.now(),
      })
      .where(eq(gameSessionsTable.id, sessionId))
      .run();

    return {
      sessionId,
      questId: quest.id,
      questTitle: quest.title,
      view: getGameView(quest, res.state, parsed.data.locale),
      newItems: res.newItems,
      removedItems: res.removedItems,
      notices: res.notices,
    };
  });

  app.post('/api/games/:sessionId/undo', (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const parsed = UndoActionSchema.safeParse(request.body ?? {});
    const locale = parsed.success ? parsed.data.locale : 'ru';

    const row = db
      .select()
      .from(gameSessionsTable)
      .where(eq(gameSessionsTable.id, sessionId))
      .get();
    if (!row) {
      return reply.code(404).send({ code: 'ERR_SESSION_NOT_FOUND', params: { sessionId } });
    }

    const quest = repo.getQuestById(row.questId);
    if (!quest) {
      return reply.code(404).send({ code: 'ERR_QUEST_NOT_FOUND', params: { id: row.questId } });
    }

    const res = undoStep(rowToState(row));
    if (!res.ok) {
      return reply.code(409).send({ code: res.code, params: res.params });
    }

    db.update(gameSessionsTable)
      .set({
        currentSceneId: res.state.currentSceneId,
        inventory: res.state.inventory,
        variables: res.state.variables,
        visitedSceneIds: res.state.visitedSceneIds,
        log: res.state.log,
        steps: res.state.steps,
        undoStack: res.state.undoStack,
        updatedAt: Date.now(),
      })
      .where(eq(gameSessionsTable.id, sessionId))
      .run();

    return {
      sessionId,
      questId: quest.id,
      questTitle: quest.title,
      view: getGameView(quest, res.state, locale),
    };
  });
}

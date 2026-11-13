import {
  analyzeQuest,
  APP_LOCALES,
  APP_THEMES,
  compileStandaloneHtml,
  computeAutoLayout,
  exportQuestToPortable,
  VariableValueSchema,
} from '@quest-forge/engine';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { QuestRepository } from '../db/quest-repo.js';

const CreateQuestSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional(),
  initialVariables: z.record(z.string().min(1), VariableValueSchema).optional(),
  initialSceneTitle: z.string().optional(),
});

const UpdateQuestSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  startSceneId: z.string().min(1).nullable().optional(),
  initialVariables: z.record(z.string().min(1), VariableValueSchema).optional(),
});

const LayoutUpdateSchema = z.union([
  z.object({
    mode: z.literal('bfs'),
  }),
  z.object({
    positions: z.array(
      z.object({
        sceneId: z.string().min(1),
        posX: z.number().finite(),
        posY: z.number().finite(),
      }),
    ),
  }),
]);

const ExportHtmlQuerySchema = z.object({
  locale: z.enum(APP_LOCALES).default('ru'),
  theme: z.enum(APP_THEMES).default('night'),
});

function sanitizeFilename(title: string): string {
  const cleaned = title
    .replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || 'quest';
}

export function registerQuestRoutes(
  app: FastifyInstance,
  config: AppConfig,
  repo: QuestRepository,
  requireAuthorAuth: preHandlerAsyncHookHandler,
): void {
  app.get('/api/quests', (request) => {
    const query = request.query as { q?: string };
    return { quests: repo.listQuests(query.q) };
  });

  app.get('/api/quests/:id', (request, reply) => {
    const { id } = request.params as { id: string };
    const quest = repo.getQuestById(id);
    if (!quest) {
      return reply.code(404).send({ code: 'ERR_QUEST_NOT_FOUND', params: { id } });
    }
    return { quest };
  });

  app.get('/api/quests/:id/analyze', (request, reply) => {
    const { id } = request.params as { id: string };
    const quest = repo.getQuestById(id);
    if (!quest) {
      return reply.code(404).send({ code: 'ERR_QUEST_NOT_FOUND', params: { id } });
    }
    return { analysis: analyzeQuest(quest) };
  });

  app.get('/api/quests/:id/export/json', (request, reply) => {
    const { id } = request.params as { id: string };
    const quest = repo.getQuestById(id);
    if (!quest) {
      return reply.code(404).send({ code: 'ERR_QUEST_NOT_FOUND', params: { id } });
    }
    const portable = exportQuestToPortable(quest);
    const filename = `${sanitizeFilename(quest.title)}.json`;
    void reply.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return portable;
  });

  app.get('/api/quests/:id/export/html', (request, reply) => {
    const { id } = request.params as { id: string };
    const quest = repo.getQuestById(id);
    if (!quest) {
      return reply.code(404).send({ code: 'ERR_QUEST_NOT_FOUND', params: { id } });
    }
    const parsedQuery = ExportHtmlQuerySchema.safeParse(request.query);
    const options = parsedQuery.success
      ? parsedQuery.data
      : { locale: 'ru' as const, theme: 'night' as const };
    const html = compileStandaloneHtml(quest, {
      locale: options.locale,
      theme: options.theme,
      appVersion: config.version,
    });
    const filename = `${sanitizeFilename(quest.title)}.html`;
    void reply.header('Content-Type', 'text/html; charset=utf-8');
    void reply.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    return html;
  });

  app.post('/api/quests', { preHandler: requireAuthorAuth }, (request, reply) => {
    const parsed = CreateQuestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'ERR_VALIDATION',
        params: { detail: parsed.error.issues[0]?.message ?? 'invalid_quest' },
      });
    }
    const quest = repo.createQuest(parsed.data);
    return reply.code(201).send({ quest });
  });

  app.post('/api/quests/import', { preHandler: requireAuthorAuth }, (request, reply) => {
    try {
      const quest = repo.importQuest(request.body);
      return reply.code(201).send({ quest });
    } catch (err) {
      return reply.code(400).send({
        code: 'ERR_INVALID_IMPORT_JSON',
        params: { detail: err instanceof Error ? err.message : 'invalid_json' },
      });
    }
  });

  app.patch('/api/quests/:id', { preHandler: requireAuthorAuth }, (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateQuestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'ERR_VALIDATION',
        params: { detail: parsed.error.issues[0]?.message ?? 'invalid_quest_patch' },
      });
    }
    const quest = repo.updateQuest(id, parsed.data);
    if (!quest) {
      return reply.code(404).send({ code: 'ERR_QUEST_NOT_FOUND', params: { id } });
    }
    return { quest };
  });

  app.delete('/api/quests/:id', { preHandler: requireAuthorAuth }, (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = repo.deleteQuest(id);
    if (!deleted) {
      return reply.code(404).send({ code: 'ERR_QUEST_NOT_FOUND', params: { id } });
    }
    return { ok: true };
  });

  app.post('/api/quests/:id/duplicate', { preHandler: requireAuthorAuth }, (request, reply) => {
    const { id } = request.params as { id: string };
    const quest = repo.duplicateQuest(id);
    if (!quest) {
      return reply.code(404).send({ code: 'ERR_QUEST_NOT_FOUND', params: { id } });
    }
    return reply.code(201).send({ quest });
  });

  app.post('/api/quests/:id/layout', { preHandler: requireAuthorAuth }, (request, reply) => {
    const { id } = request.params as { id: string };
    const quest = repo.getQuestById(id);
    if (!quest) {
      return reply.code(404).send({ code: 'ERR_QUEST_NOT_FOUND', params: { id } });
    }

    const parsed = LayoutUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'ERR_VALIDATION',
        params: { detail: parsed.error.issues[0]?.message ?? 'invalid_layout' },
      });
    }

    const positions = 'mode' in parsed.data ? computeAutoLayout(quest) : parsed.data.positions;
    repo.updateLayout(id, positions);
    const updated = repo.getQuestById(id);
    return { quest: updated };
  });
}

import { EndingTypeSchema } from '@quest-forge/engine';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import type { QuestRepository } from '../db/quest-repo.js';

const CreateSceneSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  ending: EndingTypeSchema.optional(),
  posX: z.number().finite().optional(),
  posY: z.number().finite().optional(),
  imageUrl: z.string().nullable().optional(),
  audioUrl: z.string().nullable().optional(),
});

const UpdateSceneSchema = CreateSceneSchema;

export function registerSceneRoutes(
  app: FastifyInstance,
  repo: QuestRepository,
  requireAuthorAuth: preHandlerAsyncHookHandler,
): void {
  app.post('/api/quests/:questId/scenes', { preHandler: requireAuthorAuth }, (request, reply) => {
    const { questId } = request.params as { questId: string };
    const parsed = CreateSceneSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'ERR_VALIDATION',
        params: { detail: parsed.error.issues[0]?.message ?? 'invalid_scene' },
      });
    }
    const scene = repo.createScene(questId, parsed.data);
    if (!scene) {
      return reply.code(404).send({ code: 'ERR_QUEST_NOT_FOUND', params: { id: questId } });
    }
    return reply.code(201).send({ scene });
  });

  app.patch('/api/scenes/:id', { preHandler: requireAuthorAuth }, (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateSceneSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'ERR_VALIDATION',
        params: { detail: parsed.error.issues[0]?.message ?? 'invalid_scene_patch' },
      });
    }
    const scene = repo.updateScene(id, parsed.data);
    if (!scene) {
      return reply.code(404).send({ code: 'ERR_SCENE_NOT_FOUND', params: { id } });
    }
    return { scene };
  });

  app.delete('/api/scenes/:id', { preHandler: requireAuthorAuth }, (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = repo.deleteScene(id);
    if (!deleted) {
      return reply.code(404).send({ code: 'ERR_SCENE_NOT_FOUND', params: { id } });
    }
    return { ok: true };
  });

  app.post('/api/scenes/:id/duplicate', { preHandler: requireAuthorAuth }, (request, reply) => {
    const { id } = request.params as { id: string };
    const scene = repo.duplicateScene(id);
    if (!scene) {
      return reply.code(404).send({ code: 'ERR_SCENE_NOT_FOUND', params: { id } });
    }
    return reply.code(201).send({ scene });
  });
}

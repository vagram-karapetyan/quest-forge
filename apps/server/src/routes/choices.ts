import { ConditionSchema, EffectSchema } from '@quest-forge/engine';
import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { z } from 'zod';
import type { QuestRepository } from '../db/quest-repo.js';

const CreateChoiceSchema = z.object({
  targetSceneId: z.string().min(1).nullable().optional(),
  text: z.string().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  conditions: z.array(ConditionSchema).optional(),
  effects: z.array(EffectSchema).optional(),
});

const UpdateChoiceSchema = CreateChoiceSchema;

const ReorderChoicesSchema = z.object({
  orderedIds: z.array(z.string().min(1)),
});

export function registerChoiceRoutes(
  app: FastifyInstance,
  repo: QuestRepository,
  requireAuthorAuth: preHandlerAsyncHookHandler,
): void {
  app.post('/api/scenes/:sceneId/choices', { preHandler: requireAuthorAuth }, (request, reply) => {
    const { sceneId } = request.params as { sceneId: string };
    const parsed = CreateChoiceSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'ERR_VALIDATION',
        params: { detail: parsed.error.issues[0]?.message ?? 'invalid_choice' },
      });
    }
    const choice = repo.createChoice(sceneId, parsed.data);
    if (!choice) {
      return reply.code(404).send({ code: 'ERR_SCENE_NOT_FOUND', params: { id: sceneId } });
    }
    return reply.code(201).send({ choice });
  });

  app.patch('/api/choices/:id', { preHandler: requireAuthorAuth }, (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = UpdateChoiceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: 'ERR_VALIDATION',
        params: { detail: parsed.error.issues[0]?.message ?? 'invalid_choice_patch' },
      });
    }
    const choice = repo.updateChoice(id, parsed.data);
    if (!choice) {
      return reply.code(404).send({ code: 'ERR_CHOICE_NOT_FOUND', params: { id } });
    }
    return { choice };
  });

  app.delete('/api/choices/:id', { preHandler: requireAuthorAuth }, (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = repo.deleteChoice(id);
    if (!deleted) {
      return reply.code(404).send({ code: 'ERR_CHOICE_NOT_FOUND', params: { id } });
    }
    return { ok: true };
  });

  app.put(
    '/api/scenes/:sceneId/choices/reorder',
    { preHandler: requireAuthorAuth },
    (request, reply) => {
      const { sceneId } = request.params as { sceneId: string };
      const parsed = ReorderChoicesSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          code: 'ERR_VALIDATION',
          params: { detail: 'invalid_reorder_payload' },
        });
      }
      const choices = repo.reorderChoices(sceneId, parsed.data.orderedIds);
      if (!choices) {
        return reply.code(404).send({ code: 'ERR_SCENE_NOT_FOUND', params: { id: sceneId } });
      }
      return { choices };
    },
  );
}

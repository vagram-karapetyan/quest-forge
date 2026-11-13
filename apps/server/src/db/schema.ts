import type {
  Condition,
  Effect,
  EndingType,
  GameLogEntry,
  GameSnapshot,
  VariableValue,
} from '@quest-forge/engine';
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const questsTable = sqliteTable('quests', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  startSceneId: text('start_scene_id'),
  initialVariables: text('initial_variables', { mode: 'json' })
    .$type<Record<string, VariableValue>>()
    .notNull()
    .default({}),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const scenesTable = sqliteTable(
  'scenes',
  {
    id: text('id').primaryKey(),
    questId: text('quest_id')
      .notNull()
      .references(() => questsTable.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    body: text('body').notNull().default(''),
    ending: text('ending').$type<EndingType>().notNull().default('none'),
    posX: real('pos_x').notNull().default(80),
    posY: real('pos_y').notNull().default(80),
    imageUrl: text('image_url'),
    audioUrl: text('audio_url'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('idx_scenes_quest_id').on(table.questId)],
);

export const choicesTable = sqliteTable(
  'choices',
  {
    id: text('id').primaryKey(),
    sceneId: text('scene_id')
      .notNull()
      .references(() => scenesTable.id, { onDelete: 'cascade' }),
    targetSceneId: text('target_scene_id').references(() => scenesTable.id, {
      onDelete: 'set null',
    }),
    text: text('text').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    conditions: text('conditions', { mode: 'json' }).$type<Condition[]>().notNull().default([]),
    effects: text('effects', { mode: 'json' }).$type<Effect[]>().notNull().default([]),
  },
  (table) => [index('idx_choices_scene_id').on(table.sceneId)],
);

export const gameSessionsTable = sqliteTable(
  'game_sessions',
  {
    id: text('id').primaryKey(),
    questId: text('quest_id')
      .notNull()
      .references(() => questsTable.id, { onDelete: 'cascade' }),
    currentSceneId: text('current_scene_id').notNull(),
    inventory: text('inventory', { mode: 'json' }).$type<string[]>().notNull().default([]),
    variables: text('variables', { mode: 'json' })
      .$type<Record<string, VariableValue>>()
      .notNull()
      .default({}),
    visitedSceneIds: text('visited_scene_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    log: text('log', { mode: 'json' }).$type<GameLogEntry[]>().notNull().default([]),
    steps: integer('steps').notNull().default(0),
    undoStack: text('undo_stack', { mode: 'json' }).$type<GameSnapshot[]>().notNull().default([]),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_game_sessions_quest_id').on(table.questId),
    index('idx_game_sessions_updated_at').on(table.updatedAt),
  ],
);

export const adminSessionsTable = sqliteTable(
  'admin_sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    username: text('username').notNull(),
    expiresAt: integer('expires_at').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_admin_sessions_expires_at').on(table.expiresAt)],
);

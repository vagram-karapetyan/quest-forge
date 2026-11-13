import {
  analyzeQuest,
  normalizeImportedQuest,
  type Choice,
  type Condition,
  type Effect,
  type EndingType,
  type Quest,
  type Scene,
  type VariableValue,
} from '@quest-forge/engine';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { ApiError } from '../errors.js';
import type { AppDatabase } from './client.js';
import { choicesTable, questsTable, scenesTable } from './schema.js';

export type QuestSummary = {
  id: string;
  title: string;
  description: string;
  startSceneId: string | null;
  sceneCount: number;
  winCount: number;
  loseCount: number;
  variableCount: number;
  playable: boolean;
  hasStartScene: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CreateQuestInput = {
  title: string;
  description?: string;
  initialVariables?: Record<string, VariableValue>;
  initialSceneTitle?: string;
};

export type UpdateQuestInput = {
  title?: string;
  description?: string;
  startSceneId?: string | null;
  initialVariables?: Record<string, VariableValue>;
};

export type CreateSceneInput = {
  title?: string;
  body?: string;
  ending?: EndingType;
  posX?: number;
  posY?: number;
  imageUrl?: string | null;
  audioUrl?: string | null;
};

export type UpdateSceneInput = Partial<CreateSceneInput>;

export type CreateChoiceInput = {
  targetSceneId?: string | null;
  text?: string;
  sortOrder?: number;
  conditions?: Condition[];
  effects?: Effect[];
};

export type UpdateChoiceInput = Partial<CreateChoiceInput>;

export class QuestRepository {
  constructor(private readonly db: AppDatabase) {}

  public listQuests(searchQuery?: string): QuestSummary[] {
    const quests = this.db.select().from(questsTable).orderBy(desc(questsTable.updatedAt)).all();
    const q = searchQuery?.trim().toLowerCase() ?? '';
    const filtered = q
      ? quests.filter(
          (item) =>
            item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q),
        )
      : quests;

    return filtered.map((questRow) => {
      const hydrated = this.getQuestById(questRow.id);
      if (!hydrated) {
        return {
          id: questRow.id,
          title: questRow.title,
          description: questRow.description,
          startSceneId: questRow.startSceneId,
          sceneCount: 0,
          winCount: 0,
          loseCount: 0,
          variableCount: 0,
          playable: false,
          hasStartScene: false,
          createdAt: questRow.createdAt,
          updatedAt: questRow.updatedAt,
        };
      }
      const analysis = analyzeQuest(hydrated);
      const hasStartScene = Boolean(
        hydrated.startSceneId && hydrated.scenes.some((s) => s.id === hydrated.startSceneId),
      );
      return {
        id: hydrated.id,
        title: hydrated.title,
        description: hydrated.description,
        startSceneId: hydrated.startSceneId,
        sceneCount: analysis.stats.sceneCount,
        winCount: analysis.stats.winCount,
        loseCount: analysis.stats.loseCount,
        variableCount: analysis.stats.variableCount,
        playable: analysis.playable,
        hasStartScene,
        createdAt: questRow.createdAt,
        updatedAt: questRow.updatedAt,
      };
    });
  }

  public getQuestByTitle(title: string): Quest | null {
    const row = this.db.select().from(questsTable).where(eq(questsTable.title, title)).get();
    if (!row) {
      return null;
    }
    return this.getQuestById(row.id);
  }

  public getQuestById(id: string): Quest | null {
    const questRow = this.db.select().from(questsTable).where(eq(questsTable.id, id)).get();
    if (!questRow) {
      return null;
    }

    const sceneRows = this.db
      .select()
      .from(scenesTable)
      .where(eq(scenesTable.questId, id))
      .orderBy(asc(scenesTable.createdAt), asc(scenesTable.id))
      .all();

    const sceneIds = sceneRows.map((s) => s.id);
    const choiceRows =
      sceneIds.length > 0
        ? this.db
            .select()
            .from(choicesTable)
            .where(inArray(choicesTable.sceneId, sceneIds))
            .orderBy(asc(choicesTable.sortOrder), asc(choicesTable.id))
            .all()
        : [];

    const choicesByScene = new Map<string, Choice[]>();
    for (const row of choiceRows) {
      const list = choicesByScene.get(row.sceneId) ?? [];
      list.push({
        id: row.id,
        sceneId: row.sceneId,
        targetSceneId: row.targetSceneId,
        text: row.text,
        sortOrder: row.sortOrder,
        conditions: row.conditions,
        effects: row.effects,
      });
      choicesByScene.set(row.sceneId, list);
    }

    const scenes: Scene[] = sceneRows.map((row) => ({
      id: row.id,
      questId: row.questId,
      title: row.title,
      body: row.body,
      ending: row.ending,
      posX: row.posX,
      posY: row.posY,
      imageUrl: row.imageUrl,
      audioUrl: row.audioUrl,
      choices: choicesByScene.get(row.id) ?? [],
    }));

    return {
      id: questRow.id,
      title: questRow.title,
      description: questRow.description,
      startSceneId: questRow.startSceneId,
      initialVariables: questRow.initialVariables,
      scenes,
    };
  }

  public createQuest(input: CreateQuestInput): Quest {
    const now = Date.now();
    const questId = crypto.randomUUID();
    const startSceneId = crypto.randomUUID();

    this.db.transaction((tx) => {
      tx.insert(questsTable)
        .values({
          id: questId,
          title: input.title.trim(),
          description: input.description ?? '',
          startSceneId: null,
          initialVariables: input.initialVariables ?? {},
          createdAt: now,
          updatedAt: now,
        })
        .run();

      tx.insert(scenesTable)
        .values({
          id: startSceneId,
          questId,
          title: input.initialSceneTitle ?? 'Начало истории',
          body: '',
          ending: 'none',
          posX: 120,
          posY: 160,
          imageUrl: null,
          audioUrl: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      tx.update(questsTable).set({ startSceneId }).where(eq(questsTable.id, questId)).run();
    });

    const created = this.getQuestById(questId);
    if (!created) {
      throw new Error('Failed to load created quest');
    }
    return created;
  }

  public updateQuest(id: string, patch: UpdateQuestInput): Quest | null {
    const existing = this.db.select().from(questsTable).where(eq(questsTable.id, id)).get();
    if (!existing) {
      return null;
    }

    if (patch.startSceneId !== undefined && patch.startSceneId !== null) {
      const targetScene = this.db
        .select()
        .from(scenesTable)
        .where(and(eq(scenesTable.id, patch.startSceneId), eq(scenesTable.questId, id)))
        .get();
      if (!targetScene) {
        throw new ApiError(409, 'ERR_SCENE_WRONG_QUEST', { sceneId: patch.startSceneId });
      }
    }

    this.db
      .update(questsTable)
      .set({
        title: patch.title !== undefined ? patch.title.trim() : existing.title,
        description: patch.description ?? existing.description,
        startSceneId: patch.startSceneId !== undefined ? patch.startSceneId : existing.startSceneId,
        initialVariables: patch.initialVariables ?? existing.initialVariables,
        updatedAt: Date.now(),
      })
      .where(eq(questsTable.id, id))
      .run();

    return this.getQuestById(id);
  }

  public deleteQuest(id: string): boolean {
    const res = this.db.delete(questsTable).where(eq(questsTable.id, id)).run();
    return res.changes > 0;
  }

  public duplicateQuest(id: string, copySuffix = ' (Копия)'): Quest | null {
    const source = this.getQuestById(id);
    if (!source) {
      return null;
    }

    const now = Date.now();
    const newQuestId = crypto.randomUUID();
    const sceneIdMap = new Map<string, string>();
    for (const scene of source.scenes) {
      sceneIdMap.set(scene.id, crypto.randomUUID());
    }

    const newStartSceneId = source.startSceneId
      ? (sceneIdMap.get(source.startSceneId) ?? null)
      : null;

    this.db.transaction((tx) => {
      tx.insert(questsTable)
        .values({
          id: newQuestId,
          title: `${source.title}${copySuffix}`,
          description: source.description,
          startSceneId: newStartSceneId,
          initialVariables: { ...source.initialVariables },
          createdAt: now,
          updatedAt: now,
        })
        .run();

      source.scenes.forEach((scene, idx) => {
        const newSceneId = sceneIdMap.get(scene.id) ?? crypto.randomUUID();
        tx.insert(scenesTable)
          .values({
            id: newSceneId,
            questId: newQuestId,
            title: scene.title,
            body: scene.body,
            ending: scene.ending,
            posX: scene.posX,
            posY: scene.posY,
            imageUrl: scene.imageUrl,
            audioUrl: scene.audioUrl,
            createdAt: now + idx,
            updatedAt: now + idx,
          })
          .run();
      });

      for (const scene of source.scenes) {
        const newSceneId = sceneIdMap.get(scene.id);
        if (!newSceneId) {
          continue;
        }
        for (const choice of scene.choices) {
          tx.insert(choicesTable)
            .values({
              id: crypto.randomUUID(),
              sceneId: newSceneId,
              targetSceneId: choice.targetSceneId
                ? (sceneIdMap.get(choice.targetSceneId) ?? null)
                : null,
              text: choice.text,
              sortOrder: choice.sortOrder,
              conditions: choice.conditions,
              effects: choice.effects,
            })
            .run();
        }
      }
    });

    return this.getQuestById(newQuestId);
  }

  public importQuest(rawJson: unknown): Quest {
    const normalized = normalizeImportedQuest(rawJson, () => crypto.randomUUID());
    const now = Date.now();

    this.db.transaction((tx) => {
      tx.insert(questsTable)
        .values({
          id: normalized.id,
          title: normalized.title,
          description: normalized.description,
          startSceneId: normalized.startSceneId,
          initialVariables: normalized.initialVariables,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      normalized.scenes.forEach((scene, idx) => {
        tx.insert(scenesTable)
          .values({
            id: scene.id,
            questId: normalized.id,
            title: scene.title,
            body: scene.body,
            ending: scene.ending,
            posX: scene.posX,
            posY: scene.posY,
            imageUrl: scene.imageUrl,
            audioUrl: scene.audioUrl,
            createdAt: now + idx,
            updatedAt: now + idx,
          })
          .run();
      });

      for (const scene of normalized.scenes) {
        for (const choice of scene.choices) {
          tx.insert(choicesTable)
            .values({
              id: choice.id,
              sceneId: scene.id,
              targetSceneId: choice.targetSceneId,
              text: choice.text,
              sortOrder: choice.sortOrder,
              conditions: choice.conditions,
              effects: choice.effects,
            })
            .run();
        }
      }
    });

    const created = this.getQuestById(normalized.id);
    if (!created) {
      throw new Error('Failed to load imported quest');
    }
    return created;
  }

  public createScene(questId: string, input: CreateSceneInput): Scene | null {
    const quest = this.db.select().from(questsTable).where(eq(questsTable.id, questId)).get();
    if (!quest) {
      return null;
    }

    const now = Date.now();
    const sceneId = crypto.randomUUID();
    const scene: Scene = {
      id: sceneId,
      questId,
      title: input.title ?? 'Новая сцена',
      body: input.body ?? '',
      ending: input.ending ?? 'none',
      posX: input.posX ?? 200,
      posY: input.posY ?? 200,
      imageUrl: input.imageUrl ?? null,
      audioUrl: input.audioUrl ?? null,
      choices: [],
    };

    this.db.transaction((tx) => {
      tx.insert(scenesTable)
        .values({
          id: scene.id,
          questId: scene.questId,
          title: scene.title,
          body: scene.body,
          ending: scene.ending,
          posX: scene.posX,
          posY: scene.posY,
          imageUrl: scene.imageUrl,
          audioUrl: scene.audioUrl,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      tx.update(questsTable).set({ updatedAt: now }).where(eq(questsTable.id, questId)).run();
    });

    return scene;
  }

  public updateScene(sceneId: string, patch: UpdateSceneInput): Scene | null {
    const existing = this.db.select().from(scenesTable).where(eq(scenesTable.id, sceneId)).get();
    if (!existing) {
      return null;
    }

    const now = Date.now();
    this.db.transaction((tx) => {
      tx.update(scenesTable)
        .set({
          title: patch.title ?? existing.title,
          body: patch.body ?? existing.body,
          ending: patch.ending ?? existing.ending,
          posX: patch.posX ?? existing.posX,
          posY: patch.posY ?? existing.posY,
          imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : existing.imageUrl,
          audioUrl: patch.audioUrl !== undefined ? patch.audioUrl : existing.audioUrl,
          updatedAt: now,
        })
        .where(eq(scenesTable.id, sceneId))
        .run();

      tx.update(questsTable)
        .set({ updatedAt: now })
        .where(eq(questsTable.id, existing.questId))
        .run();
    });

    return this.getSceneById(sceneId);
  }

  public getSceneById(sceneId: string): Scene | null {
    const row = this.db.select().from(scenesTable).where(eq(scenesTable.id, sceneId)).get();
    if (!row) {
      return null;
    }
    const choices = this.db
      .select()
      .from(choicesTable)
      .where(eq(choicesTable.sceneId, sceneId))
      .orderBy(asc(choicesTable.sortOrder), asc(choicesTable.id))
      .all();

    return {
      id: row.id,
      questId: row.questId,
      title: row.title,
      body: row.body,
      ending: row.ending,
      posX: row.posX,
      posY: row.posY,
      imageUrl: row.imageUrl,
      audioUrl: row.audioUrl,
      choices: choices.map((c) => ({
        id: c.id,
        sceneId: c.sceneId,
        targetSceneId: c.targetSceneId,
        text: c.text,
        sortOrder: c.sortOrder,
        conditions: c.conditions,
        effects: c.effects,
      })),
    };
  }

  public deleteScene(sceneId: string): boolean {
    const existing = this.db.select().from(scenesTable).where(eq(scenesTable.id, sceneId)).get();
    if (!existing) {
      return false;
    }

    const now = Date.now();
    this.db.transaction((tx) => {
      const quest = tx.select().from(questsTable).where(eq(questsTable.id, existing.questId)).get();
      if (quest && quest.startSceneId === sceneId) {
        tx.update(questsTable)
          .set({ startSceneId: null, updatedAt: now })
          .where(eq(questsTable.id, existing.questId))
          .run();
      } else {
        tx.update(questsTable)
          .set({ updatedAt: now })
          .where(eq(questsTable.id, existing.questId))
          .run();
      }
      tx.delete(scenesTable).where(eq(scenesTable.id, sceneId)).run();
    });
    return true;
  }

  public duplicateScene(sceneId: string, copySuffix = ' (Копия)'): Scene | null {
    const source = this.getSceneById(sceneId);
    if (!source) {
      return null;
    }

    const now = Date.now();
    const newSceneId = crypto.randomUUID();

    this.db.transaction((tx) => {
      tx.insert(scenesTable)
        .values({
          id: newSceneId,
          questId: source.questId,
          title: `${source.title}${copySuffix}`,
          body: source.body,
          ending: source.ending,
          posX: source.posX + 40,
          posY: source.posY + 40,
          imageUrl: source.imageUrl,
          audioUrl: source.audioUrl,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      for (const choice of source.choices) {
        tx.insert(choicesTable)
          .values({
            id: crypto.randomUUID(),
            sceneId: newSceneId,
            // Remap self-loops onto the new duplicated scene
            targetSceneId: choice.targetSceneId === source.id ? newSceneId : choice.targetSceneId,
            text: choice.text,
            sortOrder: choice.sortOrder,
            conditions: choice.conditions,
            effects: choice.effects,
          })
          .run();
      }

      tx.update(questsTable)
        .set({ updatedAt: now })
        .where(eq(questsTable.id, source.questId))
        .run();
    });

    return this.getSceneById(newSceneId);
  }

  public updateLayout(
    questId: string,
    positions: Array<{ sceneId: string; posX: number; posY: number }>,
  ): boolean {
    const quest = this.db.select().from(questsTable).where(eq(questsTable.id, questId)).get();
    if (!quest) {
      return false;
    }

    const now = Date.now();
    this.db.transaction((tx) => {
      const questScenes = tx
        .select({ id: scenesTable.id })
        .from(scenesTable)
        .where(eq(scenesTable.questId, questId))
        .all();
      const validIds = new Set(questScenes.map((s) => s.id));

      for (const pos of positions) {
        if (!validIds.has(pos.sceneId)) {
          throw new ApiError(409, 'ERR_SCENE_WRONG_QUEST', { sceneId: pos.sceneId });
        }
        tx.update(scenesTable)
          .set({ posX: pos.posX, posY: posYRounded(pos.posY), updatedAt: now })
          .where(eq(scenesTable.id, pos.sceneId))
          .run();
      }

      tx.update(questsTable).set({ updatedAt: now }).where(eq(questsTable.id, questId)).run();
    });

    return true;
  }

  public createChoice(sceneId: string, input: CreateChoiceInput): Choice | null {
    const scene = this.db.select().from(scenesTable).where(eq(scenesTable.id, sceneId)).get();
    if (!scene) {
      return null;
    }

    if (input.targetSceneId) {
      const target = this.db
        .select()
        .from(scenesTable)
        .where(and(eq(scenesTable.id, input.targetSceneId), eq(scenesTable.questId, scene.questId)))
        .get();
      if (!target) {
        throw new ApiError(409, 'ERR_SCENE_WRONG_QUEST', { sceneId: input.targetSceneId });
      }
    }

    const existingCount = this.db
      .select({ id: choicesTable.id })
      .from(choicesTable)
      .where(eq(choicesTable.sceneId, sceneId))
      .all().length;

    const choice: Choice = {
      id: crypto.randomUUID(),
      sceneId,
      targetSceneId: input.targetSceneId ?? null,
      text: input.text ?? 'Новый выбор',
      sortOrder: input.sortOrder ?? existingCount,
      conditions: input.conditions ?? [],
      effects: input.effects ?? [],
    };

    const now = Date.now();
    this.db.transaction((tx) => {
      tx.insert(choicesTable).values(choice).run();
      tx.update(questsTable).set({ updatedAt: now }).where(eq(questsTable.id, scene.questId)).run();
    });

    return choice;
  }

  public updateChoice(choiceId: string, patch: UpdateChoiceInput): Choice | null {
    const existing = this.db.select().from(choicesTable).where(eq(choicesTable.id, choiceId)).get();
    if (!existing) {
      return null;
    }

    const parentScene = this.db
      .select()
      .from(scenesTable)
      .where(eq(scenesTable.id, existing.sceneId))
      .get();
    if (!parentScene) {
      return null;
    }

    if (patch.targetSceneId !== undefined && patch.targetSceneId !== null) {
      const target = this.db
        .select()
        .from(scenesTable)
        .where(
          and(
            eq(scenesTable.id, patch.targetSceneId),
            eq(scenesTable.questId, parentScene.questId),
          ),
        )
        .get();
      if (!target) {
        throw new ApiError(409, 'ERR_SCENE_WRONG_QUEST', { sceneId: patch.targetSceneId });
      }
    }

    const updated: Choice = {
      id: existing.id,
      sceneId: existing.sceneId,
      targetSceneId:
        patch.targetSceneId !== undefined ? patch.targetSceneId : existing.targetSceneId,
      text: patch.text ?? existing.text,
      sortOrder: patch.sortOrder ?? existing.sortOrder,
      conditions: patch.conditions ?? existing.conditions,
      effects: patch.effects ?? existing.effects,
    };

    const now = Date.now();
    this.db.transaction((tx) => {
      tx.update(choicesTable)
        .set({
          targetSceneId: updated.targetSceneId,
          text: updated.text,
          sortOrder: updated.sortOrder,
          conditions: updated.conditions,
          effects: updated.effects,
        })
        .where(eq(choicesTable.id, choiceId))
        .run();

      tx.update(questsTable)
        .set({ updatedAt: now })
        .where(eq(questsTable.id, parentScene.questId))
        .run();
    });

    return updated;
  }

  public deleteChoice(choiceId: string): boolean {
    const existing = this.db.select().from(choicesTable).where(eq(choicesTable.id, choiceId)).get();
    if (!existing) {
      return false;
    }
    const parentScene = this.db
      .select()
      .from(scenesTable)
      .where(eq(scenesTable.id, existing.sceneId))
      .get();

    this.db.transaction((tx) => {
      tx.delete(choicesTable).where(eq(choicesTable.id, choiceId)).run();
      if (parentScene) {
        tx.update(questsTable)
          .set({ updatedAt: Date.now() })
          .where(eq(questsTable.id, parentScene.questId))
          .run();
      }
    });

    return true;
  }

  public reorderChoices(sceneId: string, orderedIds: string[]): Choice[] | null {
    const scene = this.db.select().from(scenesTable).where(eq(scenesTable.id, sceneId)).get();
    if (!scene) {
      return null;
    }

    const currentChoices = this.db
      .select()
      .from(choicesTable)
      .where(eq(choicesTable.sceneId, sceneId))
      .all();
    const byId = new Map(currentChoices.map((c) => [c.id, c]));

    const now = Date.now();
    this.db.transaction((tx) => {
      orderedIds.forEach((id, index) => {
        if (byId.has(id)) {
          tx.update(choicesTable).set({ sortOrder: index }).where(eq(choicesTable.id, id)).run();
        }
      });
      tx.update(questsTable).set({ updatedAt: now }).where(eq(questsTable.id, scene.questId)).run();
    });

    return this.getSceneById(sceneId)?.choices ?? [];
  }
}

function posYRounded(val: number): number {
  return Math.round(val * 100) / 100;
}

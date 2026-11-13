import { z } from 'zod';

export const MAX_UNDO_STEPS = 50;

export const APP_THEMES = ['night', 'parchment', 'cyber'] as const;
export type AppTheme = (typeof APP_THEMES)[number];

export const APP_LOCALES = ['ru', 'en'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

export const VariableValueSchema = z.union([z.number().finite(), z.boolean(), z.string()]);
export type VariableValue = z.infer<typeof VariableValueSchema>;

export const EndingTypeSchema = z.enum(['none', 'win', 'lose']);
export type EndingType = z.infer<typeof EndingTypeSchema>;

export const ConditionOpSchema = z.enum(['==', '!=', '>', '>=', '<', '<=']);
export type ConditionOp = z.infer<typeof ConditionOpSchema>;

export const ConditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('has_item'),
    item: z.string().trim().min(1),
    has: z.boolean(),
  }),
  z.object({
    type: z.literal('var'),
    key: z.string().trim().min(1),
    op: ConditionOpSchema,
    value: VariableValueSchema,
  }),
]);
export type Condition = z.infer<typeof ConditionSchema>;

export const EffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('give_item'),
    item: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('take_item'),
    item: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal('set_var'),
    key: z.string().trim().min(1),
    value: VariableValueSchema,
  }),
  z.object({
    type: z.literal('add_var'),
    key: z.string().trim().min(1),
    delta: z.number().finite(),
  }),
]);
export type Effect = z.infer<typeof EffectSchema>;

export const ChoiceSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  targetSceneId: z.string().min(1).nullable(),
  text: z.string(),
  sortOrder: z.number().int().nonnegative(),
  conditions: z.array(ConditionSchema),
  effects: z.array(EffectSchema),
});
export type Choice = z.infer<typeof ChoiceSchema>;

export const SceneSchema = z.object({
  id: z.string().min(1),
  questId: z.string().min(1),
  title: z.string(),
  body: z.string(),
  ending: EndingTypeSchema,
  posX: z.number().finite(),
  posY: z.number().finite(),
  imageUrl: z.string().nullable(),
  audioUrl: z.string().nullable(),
  choices: z.array(ChoiceSchema),
});
export type Scene = z.infer<typeof SceneSchema>;

export const QuestSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1),
  description: z.string(),
  startSceneId: z.string().min(1).nullable(),
  initialVariables: z.record(z.string().min(1), VariableValueSchema),
  scenes: z.array(SceneSchema),
});
export type Quest = z.infer<typeof QuestSchema>;

const PortableIdSchema = z.union([z.string().min(1), z.number().int()]);

export const PortableChoiceImportSchema = z.object({
  id: PortableIdSchema.optional(),
  targetSceneId: PortableIdSchema.nullable().optional(),
  text: z.string().default(''),
  sortOrder: z.number().int().nonnegative().optional(),
  conditions: z.array(ConditionSchema).default([]),
  effects: z.array(EffectSchema).default([]),
});

export const PortableSceneImportSchema = z.object({
  id: PortableIdSchema,
  title: z.string().default(''),
  body: z.string().default(''),
  ending: EndingTypeSchema.default('none'),
  posX: z.number().finite().nullable().optional(),
  posY: z.number().finite().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  audioUrl: z.string().nullable().optional(),
  choices: z.array(PortableChoiceImportSchema).default([]),
});

export const PortableQuestImportSchema = z.object({
  formatVersion: z.literal(2).optional(),
  title: z.string().trim().min(1),
  description: z.string().default(''),
  startSceneId: PortableIdSchema.nullable().optional(),
  initialVariables: z.record(z.string().min(1), VariableValueSchema).default({}),
  scenes: z.array(PortableSceneImportSchema).default([]),
});

export type PortableQuestExport = {
  formatVersion: 2;
  title: string;
  description: string;
  startSceneId: string | null;
  initialVariables: Record<string, VariableValue>;
  scenes: Array<{
    id: string;
    title: string;
    body: string;
    ending: EndingType;
    posX: number;
    posY: number;
    imageUrl: string | null;
    audioUrl: string | null;
    choices: Array<{
      id: string;
      targetSceneId: string | null;
      text: string;
      sortOrder: number;
      conditions: Condition[];
      effects: Effect[];
    }>;
  }>;
};

export function normalizeImportedQuest(
  rawInput: unknown,
  generateId: () => string = () => crypto.randomUUID(),
): Quest {
  const parsed = PortableQuestImportSchema.parse(rawInput);
  const questId = generateId();
  const sceneIdMap = new Map<string, string>();

  for (const scene of parsed.scenes) {
    const rawKey = String(scene.id);
    if (!sceneIdMap.has(rawKey)) {
      sceneIdMap.set(rawKey, generateId());
    }
  }

  let startSceneId: string | null = null;
  if (parsed.startSceneId !== undefined && parsed.startSceneId !== null) {
    startSceneId = sceneIdMap.get(String(parsed.startSceneId)) ?? null;
  }
  if (startSceneId === null && parsed.scenes.length > 0) {
    const firstScene = parsed.scenes[0];
    if (firstScene) {
      startSceneId = sceneIdMap.get(String(firstScene.id)) ?? null;
    }
  }

  const GRID_COLS = 4;
  const GRID_STEP_X = 320;
  const GRID_STEP_Y = 220;

  const scenes: Scene[] = parsed.scenes.map((scene, index) => {
    const newSceneId = sceneIdMap.get(String(scene.id)) ?? generateId();
    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);
    const posX = typeof scene.posX === 'number' ? scene.posX : 80 + col * GRID_STEP_X;
    const posY = typeof scene.posY === 'number' ? scene.posY : 80 + row * GRID_STEP_Y;

    const choices: Choice[] = scene.choices.map((choice, choiceIndex) => {
      let targetSceneId: string | null = null;
      if (choice.targetSceneId !== undefined && choice.targetSceneId !== null) {
        targetSceneId = sceneIdMap.get(String(choice.targetSceneId)) ?? null;
      }
      return {
        id: generateId(),
        sceneId: newSceneId,
        targetSceneId,
        text: choice.text,
        sortOrder: choice.sortOrder ?? choiceIndex,
        conditions: choice.conditions,
        effects: choice.effects,
      };
    });

    return {
      id: newSceneId,
      questId,
      title: scene.title,
      body: scene.body,
      ending: scene.ending,
      posX,
      posY,
      imageUrl: scene.imageUrl ?? null,
      audioUrl: scene.audioUrl ?? null,
      choices,
    };
  });

  return {
    id: questId,
    title: parsed.title,
    description: parsed.description,
    startSceneId,
    initialVariables: { ...parsed.initialVariables },
    scenes,
  };
}

export function exportQuestToPortable(quest: Quest): PortableQuestExport {
  return {
    formatVersion: 2,
    title: quest.title,
    description: quest.description,
    startSceneId: quest.startSceneId,
    initialVariables: { ...quest.initialVariables },
    scenes: quest.scenes.map((scene) => ({
      id: scene.id,
      title: scene.title,
      body: scene.body,
      ending: scene.ending,
      posX: scene.posX,
      posY: scene.posY,
      imageUrl: scene.imageUrl,
      audioUrl: scene.audioUrl,
      choices: [...scene.choices]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((choice) => ({
          id: choice.id,
          targetSceneId: choice.targetSceneId,
          text: choice.text,
          sortOrder: choice.sortOrder,
          conditions: choice.conditions,
          effects: choice.effects,
        })),
    })),
  };
}

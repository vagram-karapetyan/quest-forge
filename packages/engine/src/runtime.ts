import { renderMarkdown, sanitizeUrl } from './markdown.js';
import {
  MAX_UNDO_STEPS,
  type AppLocale,
  type Choice,
  type Condition,
  type EndingType,
  type Quest,
  type Scene,
  type VariableValue,
} from './schema.js';

export type StructuredMessage = {
  code: string;
  params: Record<string, string | number | boolean>;
};

export type GameStatus = 'playing' | 'win' | 'lose' | 'end';

export type GameLogEntry = {
  step: number;
  sceneId: string;
  sceneTitle: string;
  choiceText: string;
};

export type GameSnapshot = {
  currentSceneId: string;
  inventory: string[];
  variables: Record<string, VariableValue>;
  visitedSceneIds: string[];
  log: GameLogEntry[];
  steps: number;
};

export type GameState = GameSnapshot & {
  undoStack: GameSnapshot[];
};

export type GameChoiceView = {
  id: string;
  text: string;
  available: boolean;
  targetSceneId: string | null;
  lockReasons: StructuredMessage[];
};

export type GameView = {
  status: GameStatus;
  scene: {
    id: string;
    title: string;
    rawTitle: string;
    bodyMarkdown: string;
    bodyHtml: string;
    ending: EndingType;
    imageUrl: string | null;
    audioUrl: string | null;
  };
  choices: GameChoiceView[];
  inventory: string[];
  variables: Record<string, VariableValue>;
  visitedSceneIds: string[];
  log: GameLogEntry[];
  steps: number;
  canUndo: boolean;
  totalScenes: number;
};

export type StartGameResult =
  | { ok: true; state: GameState }
  | { ok: false; code: 'ERR_QUEST_NO_START_SCENE'; params: Record<string, never> };

export type ApplyChoiceResult =
  | {
      ok: true;
      state: GameState;
      newItems: string[];
      removedItems: string[];
      notices: StructuredMessage[];
    }
  | {
      ok: false;
      code:
        | 'ERR_SCENE_NOT_FOUND'
        | 'ERR_GAME_ALREADY_ENDED'
        | 'ERR_CHOICE_NOT_FOUND'
        | 'ERR_CHOICE_LOCKED'
        | 'ERR_TARGET_SCENE_NOT_FOUND';
      params: Record<string, string | number | boolean>;
      lockReasons?: StructuredMessage[];
    };

export type UndoResult =
  | { ok: true; state: GameState }
  | { ok: false; code: 'ERR_NOTHING_TO_UNDO'; params: Record<string, never> };

const INTERPOLATION_RE = /\{([A-Za-zА-Яа-яЁё0-9_]+)\}/g;

export function interpolateText(
  template: string,
  variables: Record<string, VariableValue>,
  locale: AppLocale = 'ru',
): string {
  return template.replace(INTERPOLATION_RE, (fullMatch, key: string) => {
    if (!Object.hasOwn(variables, key)) {
      return fullMatch;
    }
    const val = variables[key];
    if (typeof val === 'boolean') {
      if (locale === 'ru') {
        return val ? 'да' : 'нет';
      }
      return val ? 'yes' : 'no';
    }
    return String(val);
  });
}

function coerceToBool(value: VariableValue): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'да';
}

function toFiniteNumber(value: VariableValue): number | null {
  if (typeof value === 'boolean') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function fallbackForTarget(target: VariableValue): VariableValue {
  if (typeof target === 'boolean') {
    return false;
  }
  if (typeof target === 'number') {
    return 0;
  }
  return '';
}

function addWithFloatSafety(base: number, delta: number): number {
  const sum = base + delta;
  if (!Number.isFinite(sum)) {
    return base;
  }
  if (Math.abs(sum) < 1e14) {
    return Number(sum.toFixed(10));
  }
  return sum;
}

export function isChoiceVisible(
  choice: Choice,
  sceneId: string,
  inventory: readonly string[],
): boolean {
  const staysOnScene = choice.targetSceneId === null || choice.targetSceneId === sceneId;
  if (!staysOnScene) {
    return true;
  }

  if (choice.effects.length === 0) {
    return true;
  }

  const onlyGiveItem = choice.effects.every((effect) => effect.type === 'give_item');
  if (!onlyGiveItem) {
    return true;
  }

  const invSet = new Set(inventory);
  const allAlreadyOwned = choice.effects.every(
    (effect) => effect.type === 'give_item' && invSet.has(effect.item),
  );
  return !allAlreadyOwned;
}

export function evaluateCondition(
  condition: Condition,
  inventory: readonly string[],
  variables: Record<string, VariableValue>,
): { passed: boolean; reason?: StructuredMessage } {
  if (condition.type === 'has_item') {
    const owned = inventory.includes(condition.item);
    if (condition.has) {
      return owned
        ? { passed: true }
        : {
            passed: false,
            reason: { code: 'LOCK_REQUIRES_ITEM', params: { item: condition.item } },
          };
    }
    return !owned
      ? { passed: true }
      : {
          passed: false,
          reason: { code: 'LOCK_FORBIDS_ITEM', params: { item: condition.item } },
        };
  }

  const actual: VariableValue = Object.hasOwn(variables, condition.key)
    ? (variables[condition.key] as VariableValue)
    : fallbackForTarget(condition.value);
  const target = condition.value;

  let passed = false;
  if (condition.op === '==' || condition.op === '!=') {
    let equals = false;
    if (typeof actual === 'boolean' || typeof target === 'boolean') {
      equals = coerceToBool(actual) === coerceToBool(target);
    } else {
      const numA = toFiniteNumber(actual);
      const numB = toFiniteNumber(target);
      if (numA !== null && numB !== null) {
        equals = numA === numB;
      } else {
        equals = String(actual) === String(target);
      }
    }
    passed = condition.op === '==' ? equals : !equals;
  } else {
    const numA = toFiniteNumber(actual);
    const numB = toFiniteNumber(target);
    if (numA !== null && numB !== null) {
      switch (condition.op) {
        case '>':
          passed = numA > numB;
          break;
        case '>=':
          passed = numA >= numB;
          break;
        case '<':
          passed = numA < numB;
          break;
        case '<=':
          passed = numA <= numB;
          break;
      }
    }
  }

  if (passed) {
    return { passed: true };
  }

  return {
    passed: false,
    reason: {
      code: 'LOCK_VAR_CONDITION',
      params: {
        key: condition.key,
        op: condition.op,
        target,
        actual,
      },
    },
  };
}

export function evaluateConditions(
  conditions: readonly Condition[],
  inventory: readonly string[],
  variables: Record<string, VariableValue>,
): { passed: boolean; reasons: StructuredMessage[] } {
  const reasons: StructuredMessage[] = [];
  for (const condition of conditions) {
    const res = evaluateCondition(condition, inventory, variables);
    if (!res.passed && res.reason) {
      reasons.push(res.reason);
    }
  }
  return {
    passed: reasons.length === 0,
    reasons,
  };
}

function findScene(quest: Quest, sceneId: string): Scene | undefined {
  return quest.scenes.find((scene) => scene.id === sceneId);
}

function createSnapshot(state: GameSnapshot): GameSnapshot {
  return {
    currentSceneId: state.currentSceneId,
    inventory: [...state.inventory],
    variables: { ...state.variables },
    visitedSceneIds: [...state.visitedSceneIds],
    log: state.log.map((entry) => ({ ...entry })),
    steps: state.steps,
  };
}

export function createInitialState(quest: Quest): StartGameResult {
  if (!quest.startSceneId) {
    return { ok: false, code: 'ERR_QUEST_NO_START_SCENE', params: {} };
  }
  const startScene = findScene(quest, quest.startSceneId);
  if (!startScene) {
    return { ok: false, code: 'ERR_QUEST_NO_START_SCENE', params: {} };
  }

  return {
    ok: true,
    state: {
      currentSceneId: startScene.id,
      inventory: [],
      variables: { ...quest.initialVariables },
      visitedSceneIds: [startScene.id],
      log: [],
      steps: 0,
      undoStack: [],
    },
  };
}

export function getGameView(quest: Quest, state: GameState, locale: AppLocale = 'ru'): GameView {
  const scene = findScene(quest, state.currentSceneId);
  if (!scene) {
    return {
      status: 'end',
      scene: {
        id: state.currentSceneId,
        title: '',
        rawTitle: '',
        bodyMarkdown: '',
        bodyHtml: '',
        ending: 'none',
        imageUrl: null,
        audioUrl: null,
      },
      choices: [],
      inventory: [...state.inventory],
      variables: { ...state.variables },
      visitedSceneIds: [...state.visitedSceneIds],
      log: [...state.log],
      steps: state.steps,
      canUndo: state.undoStack.length > 0,
      totalScenes: quest.scenes.length,
    };
  }

  const sortedChoices = [...scene.choices].sort((a, b) => a.sortOrder - b.sortOrder);
  const visibleChoices: GameChoiceView[] =
    scene.ending !== 'none'
      ? []
      : sortedChoices
          .filter((choice) => isChoiceVisible(choice, scene.id, state.inventory))
          .map((choice) => {
            const evalResult = evaluateConditions(
              choice.conditions,
              state.inventory,
              state.variables,
            );
            return {
              id: choice.id,
              text: interpolateText(choice.text, state.variables, locale),
              available: evalResult.passed,
              targetSceneId: choice.targetSceneId,
              lockReasons: evalResult.reasons,
            };
          });

  let status: GameStatus = 'playing';
  if (scene.ending === 'win') {
    status = 'win';
  } else if (scene.ending === 'lose') {
    status = 'lose';
  } else if (visibleChoices.length === 0) {
    status = 'end';
  }

  const interpolatedTitle = interpolateText(scene.title, state.variables, locale);
  const interpolatedBody = interpolateText(scene.body, state.variables, locale);

  return {
    status,
    scene: {
      id: scene.id,
      title: interpolatedTitle,
      rawTitle: scene.title,
      bodyMarkdown: interpolatedBody,
      bodyHtml: renderMarkdown(interpolatedBody),
      ending: scene.ending,
      imageUrl: sanitizeUrl(scene.imageUrl),
      audioUrl: sanitizeUrl(scene.audioUrl),
    },
    choices: visibleChoices,
    inventory: [...state.inventory],
    variables: { ...state.variables },
    visitedSceneIds: [...state.visitedSceneIds],
    log: [...state.log],
    steps: state.steps,
    canUndo: state.undoStack.length > 0,
    totalScenes: quest.scenes.length,
  };
}

export function applyChoice(
  quest: Quest,
  state: GameState,
  choiceId: string,
  locale: AppLocale = 'ru',
): ApplyChoiceResult {
  const scene = findScene(quest, state.currentSceneId);
  if (!scene) {
    return {
      ok: false,
      code: 'ERR_SCENE_NOT_FOUND',
      params: { sceneId: state.currentSceneId },
    };
  }

  if (scene.ending !== 'none') {
    return {
      ok: false,
      code: 'ERR_GAME_ALREADY_ENDED',
      params: { ending: scene.ending },
    };
  }

  const choice = scene.choices.find((item) => item.id === choiceId);
  if (!choice || !isChoiceVisible(choice, scene.id, state.inventory)) {
    return {
      ok: false,
      code: 'ERR_CHOICE_NOT_FOUND',
      params: { choiceId },
    };
  }

  const conditionEval = evaluateConditions(choice.conditions, state.inventory, state.variables);
  if (!conditionEval.passed) {
    return {
      ok: false,
      code: 'ERR_CHOICE_LOCKED',
      params: { choiceId },
      lockReasons: conditionEval.reasons,
    };
  }

  const targetSceneId =
    choice.targetSceneId && choice.targetSceneId !== scene.id ? choice.targetSceneId : scene.id;
  if (targetSceneId !== scene.id && !findScene(quest, targetSceneId)) {
    return {
      ok: false,
      code: 'ERR_TARGET_SCENE_NOT_FOUND',
      params: { targetSceneId },
    };
  }

  const snapshot = createSnapshot(state);
  const nextUndoStack = [...state.undoStack, snapshot].slice(-MAX_UNDO_STEPS);

  const nextInventory = [...state.inventory];
  const nextVariables: Record<string, VariableValue> = { ...state.variables };
  const newItems: string[] = [];
  const removedItems: string[] = [];

  const interpolatedChoiceText = interpolateText(choice.text, state.variables, locale);
  const interpolatedSceneTitle = interpolateText(scene.title, state.variables, locale);

  for (const effect of choice.effects) {
    switch (effect.type) {
      case 'give_item': {
        if (!nextInventory.includes(effect.item)) {
          nextInventory.push(effect.item);
          newItems.push(effect.item);
        }
        break;
      }
      case 'take_item': {
        const idx = nextInventory.indexOf(effect.item);
        if (idx !== -1) {
          nextInventory.splice(idx, 1);
          removedItems.push(effect.item);
        }
        break;
      }
      case 'set_var': {
        nextVariables[effect.key] = effect.value;
        break;
      }
      case 'add_var': {
        const current = Object.hasOwn(nextVariables, effect.key)
          ? (nextVariables[effect.key] as VariableValue)
          : 0;
        const baseNum = toFiniteNumber(current) ?? 0;
        nextVariables[effect.key] = addWithFloatSafety(baseNum, effect.delta);
        break;
      }
    }
  }

  const nextVisited = [...state.visitedSceneIds];
  if (!nextVisited.includes(targetSceneId)) {
    nextVisited.push(targetSceneId);
  }

  const notices: StructuredMessage[] = [];
  if (targetSceneId === scene.id && newItems.length === 0) {
    notices.push({ code: 'NOTICE_ACTION_DONE', params: {} });
  }

  const nextSteps = state.steps + 1;
  const nextLog: GameLogEntry[] = [
    ...state.log,
    {
      step: nextSteps,
      sceneId: scene.id,
      sceneTitle: interpolatedSceneTitle,
      choiceText: interpolatedChoiceText,
    },
  ];

  return {
    ok: true,
    state: {
      currentSceneId: targetSceneId,
      inventory: nextInventory,
      variables: nextVariables,
      visitedSceneIds: nextVisited,
      log: nextLog,
      steps: nextSteps,
      undoStack: nextUndoStack,
    },
    newItems,
    removedItems,
    notices,
  };
}

export function undoStep(state: GameState): UndoResult {
  if (state.undoStack.length === 0) {
    return { ok: false, code: 'ERR_NOTHING_TO_UNDO', params: {} };
  }

  const nextStack = state.undoStack.slice(0, -1);
  const previous = state.undoStack[state.undoStack.length - 1];
  if (!previous) {
    return { ok: false, code: 'ERR_NOTHING_TO_UNDO', params: {} };
  }

  return {
    ok: true,
    state: {
      ...createSnapshot(previous),
      undoStack: nextStack,
    },
  };
}

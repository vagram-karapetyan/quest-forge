import type { StructuredMessage } from './runtime.js';
import { ConditionOpSchema, type Quest, type Scene } from './schema.js';

export type IssueSeverity = 'error' | 'warning' | 'info';

export type AnalysisIssue = StructuredMessage & {
  severity: IssueSeverity;
  sceneId?: string;
  choiceId?: string;
};

export type QuestAnalysis = {
  playable: boolean;
  issues: AnalysisIssue[];
  stats: {
    sceneCount: number;
    winCount: number;
    loseCount: number;
    variableCount: number;
    itemCount: number;
    reachableCount: number;
  };
  reachableSceneIds: string[];
  items: string[];
  variables: string[];
};

const VAR_INTERPOLATION_RE = /\{([A-Za-zА-Яа-яЁё0-9_]+)\}/g;

function extractInterpolatedVars(text: string): string[] {
  const vars: string[] = [];
  for (const match of text.matchAll(VAR_INTERPOLATION_RE)) {
    const key = match[1];
    if (key) {
      vars.push(key);
    }
  }
  return vars;
}

export function analyzeQuest(quest: Quest): QuestAnalysis {
  const issues: AnalysisIssue[] = [];
  const sceneMap = new Map<string, Scene>();
  for (const scene of quest.scenes) {
    sceneMap.set(scene.id, scene);
  }

  // Track declared variables (initialVariables + set_var / add_var effects)
  const declaredVariables = new Set<string>(Object.keys(quest.initialVariables));
  const allItems = new Set<string>();
  const givenItemsAllActive = new Set<string>();

  for (const scene of quest.scenes) {
    for (const choice of scene.choices) {
      for (const cond of choice.conditions) {
        if (cond.type === 'has_item') {
          allItems.add(cond.item);
        }
      }
      for (const effect of choice.effects) {
        if (effect.type === 'give_item' || effect.type === 'take_item') {
          allItems.add(effect.item);
          if (effect.type === 'give_item' && scene.ending === 'none') {
            givenItemsAllActive.add(effect.item);
          }
        } else {
          declaredVariables.add(effect.key);
        }
      }
    }
  }

  if (quest.scenes.length === 0) {
    issues.push({
      severity: 'error',
      code: 'ERR_NO_SCENES',
      params: {},
    });
  }

  const hasValidStart = Boolean(quest.startSceneId && sceneMap.has(quest.startSceneId));
  if (quest.scenes.length > 0 && !hasValidStart) {
    issues.push({
      severity: 'error',
      code: 'ERR_MISSING_START_SCENE',
      params: {},
    });
  }

  // BFS reachability from startSceneId (stopping at ending scenes)
  const reachable = new Set<string>();
  if (hasValidStart && quest.startSceneId) {
    const queue: string[] = [quest.startSceneId];
    reachable.add(quest.startSceneId);

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) {
        continue;
      }
      const scene = sceneMap.get(currentId);
      if (!scene || scene.ending !== 'none') {
        continue;
      }

      for (const choice of scene.choices) {
        if (choice.targetSceneId && sceneMap.has(choice.targetSceneId)) {
          if (!reachable.has(choice.targetSceneId)) {
            reachable.add(choice.targetSceneId);
            queue.push(choice.targetSceneId);
          }
        }
      }
    }
  }

  const givenItemsReachableActive = new Set<string>();
  for (const scene of quest.scenes) {
    if (!reachable.has(scene.id) || scene.ending !== 'none') {
      continue;
    }
    for (const choice of scene.choices) {
      for (const effect of choice.effects) {
        if (effect.type === 'give_item') {
          givenItemsReachableActive.add(effect.item);
        }
      }
    }
  }

  // Per-scene and per-choice checks
  const validOps = new Set<string>(ConditionOpSchema.options);
  let winCount = 0;
  let loseCount = 0;
  let hasReachableWin = false;

  for (const scene of quest.scenes) {
    if (scene.ending === 'win') {
      winCount += 1;
      if (reachable.has(scene.id)) {
        hasReachableWin = true;
      }
    } else if (scene.ending === 'lose') {
      loseCount += 1;
    }

    if (hasValidStart && !reachable.has(scene.id)) {
      issues.push({
        severity: 'warning',
        code: 'WARN_UNREACHABLE_SCENE',
        params: { sceneTitle: scene.title || scene.id },
        sceneId: scene.id,
      });
    }

    if (scene.body.trim().length === 0) {
      issues.push({
        severity: 'warning',
        code: 'WARN_EMPTY_SCENE_BODY',
        params: { sceneTitle: scene.title || scene.id },
        sceneId: scene.id,
      });
    }

    if (scene.ending !== 'none' && scene.choices.length > 0) {
      issues.push({
        severity: 'info',
        code: 'INFO_ENDING_HAS_CHOICES',
        params: { sceneTitle: scene.title || scene.id, count: scene.choices.length },
        sceneId: scene.id,
      });
    }

    // Dead-end check: active scene without any outgoing choice to another scene
    if (scene.ending === 'none') {
      const hasOutgoing = scene.choices.some(
        (c) =>
          c.targetSceneId !== null && c.targetSceneId !== scene.id && sceneMap.has(c.targetSceneId),
      );
      if (!hasOutgoing) {
        issues.push({
          severity: 'warning',
          code: 'WARN_DEAD_END_SCENE',
          params: { sceneTitle: scene.title || scene.id },
          sceneId: scene.id,
        });
      }
    }

    // Undeclared variables in scene title & body
    const seenUndeclaredInScene = new Set<string>();
    for (const varName of [
      ...extractInterpolatedVars(scene.title),
      ...extractInterpolatedVars(scene.body),
    ]) {
      if (!declaredVariables.has(varName) && !seenUndeclaredInScene.has(varName)) {
        seenUndeclaredInScene.add(varName);
        issues.push({
          severity: 'warning',
          code: 'WARN_UNDECLARED_VARIABLE',
          params: { variable: varName, sceneTitle: scene.title || scene.id },
          sceneId: scene.id,
        });
      }
    }

    for (const choice of scene.choices) {
      if (choice.targetSceneId !== null && !sceneMap.has(choice.targetSceneId)) {
        issues.push({
          severity: 'error',
          code: 'ERR_BROKEN_TARGET_SCENE',
          params: {
            sceneTitle: scene.title || scene.id,
            targetSceneId: choice.targetSceneId,
          },
          sceneId: scene.id,
          choiceId: choice.id,
        });
      }

      if (choice.text.trim().length === 0) {
        issues.push({
          severity: 'warning',
          code: 'WARN_EMPTY_CHOICE_TEXT',
          params: { sceneTitle: scene.title || scene.id },
          sceneId: scene.id,
          choiceId: choice.id,
        });
      }

      const staysOnScene = choice.targetSceneId === null || choice.targetSceneId === scene.id;
      if (staysOnScene && choice.effects.length === 0) {
        issues.push({
          severity: 'warning',
          code: 'WARN_NOOP_CHOICE',
          params: {
            sceneTitle: scene.title || scene.id,
            choiceText: choice.text || '—',
          },
          sceneId: scene.id,
          choiceId: choice.id,
        });
      }

      for (const varName of extractInterpolatedVars(choice.text)) {
        if (!declaredVariables.has(varName)) {
          issues.push({
            severity: 'warning',
            code: 'WARN_UNDECLARED_VARIABLE',
            params: { variable: varName, sceneTitle: scene.title || scene.id },
            sceneId: scene.id,
            choiceId: choice.id,
          });
        }
      }

      for (const cond of choice.conditions) {
        if (cond.type === 'has_item' && cond.has) {
          if (!givenItemsAllActive.has(cond.item)) {
            issues.push({
              severity: 'error',
              code: 'ERR_ITEM_NEVER_GIVEN',
              params: { item: cond.item, sceneTitle: scene.title || scene.id },
              sceneId: scene.id,
              choiceId: choice.id,
            });
          } else if (hasValidStart && !givenItemsReachableActive.has(cond.item)) {
            issues.push({
              severity: 'error',
              code: 'ERR_ITEM_UNREACHABLE',
              params: { item: cond.item, sceneTitle: scene.title || scene.id },
              sceneId: scene.id,
              choiceId: choice.id,
            });
          }
        } else if (cond.type === 'var') {
          if (!validOps.has(cond.op)) {
            issues.push({
              severity: 'warning',
              code: 'WARN_UNKNOWN_OPERATOR',
              params: { op: cond.op, sceneTitle: scene.title || scene.id },
              sceneId: scene.id,
              choiceId: choice.id,
            });
          }
          if (!declaredVariables.has(cond.key)) {
            issues.push({
              severity: 'warning',
              code: 'WARN_UNDECLARED_VARIABLE',
              params: { variable: cond.key, sceneTitle: scene.title || scene.id },
              sceneId: scene.id,
              choiceId: choice.id,
            });
          }
        }
      }
    }
  }

  if (quest.scenes.length > 0 && winCount === 0) {
    issues.push({
      severity: 'warning',
      code: 'WARN_NO_WIN_ENDING',
      params: {},
    });
  } else if (winCount > 0 && hasValidStart && !hasReachableWin) {
    issues.push({
      severity: 'warning',
      code: 'WARN_NO_REACHABLE_WIN',
      params: {},
    });
  }

  const hasError = issues.some((issue) => issue.severity === 'error');

  return {
    playable: !hasError,
    issues,
    stats: {
      sceneCount: quest.scenes.length,
      winCount,
      loseCount,
      variableCount: declaredVariables.size,
      itemCount: allItems.size,
      reachableCount: reachable.size,
    },
    reachableSceneIds: [...reachable],
    items: [...allItems].sort(),
    variables: [...declaredVariables].sort(),
  };
}

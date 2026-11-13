import type { Quest, Scene } from './schema.js';

export type ScenePositionUpdate = {
  sceneId: string;
  posX: number;
  posY: number;
};

export type AutoLayoutOptions = {
  originX?: number;
  originY?: number;
  columnGap?: number;
  rowGap?: number;
};

export function computeAutoLayout(
  quest: Quest,
  options: AutoLayoutOptions = {},
): ScenePositionUpdate[] {
  if (quest.scenes.length === 0) {
    return [];
  }

  const originX = options.originX ?? 80;
  const originY = options.originY ?? 80;
  const columnGap = options.columnGap ?? 340;
  const rowGap = options.rowGap ?? 210;

  const sceneMap = new Map<string, Scene>();
  for (const scene of quest.scenes) {
    sceneMap.set(scene.id, scene);
  }

  const rootId =
    quest.startSceneId && sceneMap.has(quest.startSceneId)
      ? quest.startSceneId
      : quest.scenes[0]?.id;

  const levelByScene = new Map<string, number>();
  let maxLevel = 0;

  if (rootId) {
    const queue: string[] = [rootId];
    levelByScene.set(rootId, 0);

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) {
        continue;
      }
      const currentLevel = levelByScene.get(currentId) ?? 0;
      const scene = sceneMap.get(currentId);
      if (!scene) {
        continue;
      }

      const sortedChoices = [...scene.choices].sort((a, b) => a.sortOrder - b.sortOrder);
      for (const choice of sortedChoices) {
        const targetId = choice.targetSceneId;
        if (targetId && sceneMap.has(targetId) && !levelByScene.has(targetId)) {
          const nextLevel = currentLevel + 1;
          levelByScene.set(targetId, nextLevel);
          if (nextLevel > maxLevel) {
            maxLevel = nextLevel;
          }
          queue.push(targetId);
        }
      }
    }
  }

  const unreachableLevel = levelByScene.size < quest.scenes.length ? maxLevel + 1 : maxLevel;
  const columns = new Map<number, Scene[]>();

  for (const scene of quest.scenes) {
    const level = levelByScene.get(scene.id) ?? unreachableLevel;
    const bucket = columns.get(level);
    if (bucket) {
      bucket.push(scene);
    } else {
      columns.set(level, [scene]);
    }
  }

  const updates: ScenePositionUpdate[] = [];
  const sortedLevels = [...columns.keys()].sort((a, b) => a - b);

  for (const level of sortedLevels) {
    const bucket = columns.get(level) ?? [];
    bucket.forEach((scene, rowIndex) => {
      updates.push({
        sceneId: scene.id,
        posX: originX + level * columnGap,
        posY: originY + rowIndex * rowGap,
      });
    });
  }

  return updates;
}

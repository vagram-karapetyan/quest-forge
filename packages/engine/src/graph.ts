import { analyzeQuest, type QuestAnalysis } from './analyzer.js';
import type { EndingType, Quest, Scene } from './schema.js';

export const SCENE_NODE_WIDTH = 240;
export const SCENE_NODE_HEIGHT = 116;

export type SceneGraphNode = {
  sceneId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isStart: boolean;
  reachable: boolean;
  ending: EndingType;
  isDeadEnd: boolean;
  hasBrokenEdge: boolean;
  incomingCount: number;
  outgoingCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
};

export type SceneGraphEdge = {
  id: string;
  choiceId: string;
  fromSceneId: string;
  toSceneId: string;
  label: string;
  choiceIndex: number;
  isSelfLoop: boolean;
  isConditional: boolean;
  hasEffects: boolean;
  path: string;
  labelX: number;
  labelY: number;
};

export type BrokenGraphChoice = {
  sceneId: string;
  choiceId: string;
  targetSceneId: string;
};

export type SceneGraphBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export type SceneGraphModel = {
  analysis: QuestAnalysis;
  nodes: SceneGraphNode[];
  edges: SceneGraphEdge[];
  brokenChoices: BrokenGraphChoice[];
  unreachableSceneIds: string[];
  deadEndSceneIds: string[];
  bounds: SceneGraphBounds;
};

export type ViewportState = {
  panX: number;
  panY: number;
  zoom: number;
};

export type FitViewportOptions = {
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
};

function computeEdgeGeometry(
  fromScene: Scene,
  toScene: Scene,
  parallelIndex: number,
  parallelTotal: number,
): { path: string; labelX: number; labelY: number } {
  const fromX = fromScene.posX;
  const fromY = fromScene.posY;
  const toX = toScene.posX;
  const toY = toScene.posY;

  if (fromScene.id === toScene.id) {
    // Self-loop above the top-right corner of the node
    const loopSpread = parallelIndex * 18;
    const startX = fromX + SCENE_NODE_WIDTH * 0.68;
    const startY = fromY;
    const endX = fromX + SCENE_NODE_WIDTH * 0.32;
    const endY = fromY;
    const ctrlHeight = 56 + loopSpread;
    const path = `M ${startX} ${startY} C ${startX + 42} ${startY - ctrlHeight}, ${endX - 42} ${endY - ctrlHeight}, ${endX} ${endY}`;
    return {
      path,
      labelX: fromX + SCENE_NODE_WIDTH * 0.5,
      labelY: fromY - ctrlHeight * 0.72,
    };
  }

  const fromCenterX = fromX + SCENE_NODE_WIDTH / 2;
  const fromCenterY = fromY + SCENE_NODE_HEIGHT / 2;
  const toCenterX = toX + SCENE_NODE_WIDTH / 2;
  const toCenterY = toY + SCENE_NODE_HEIGHT / 2;

  // Choose anchors based on horizontal direction
  const goingRight = toCenterX >= fromCenterX - 40;
  const startX = goingRight ? fromX + SCENE_NODE_WIDTH : fromX;
  const endX = goingRight ? toX : toX + SCENE_NODE_WIDTH;

  const spreadOffset = parallelTotal > 1 ? (parallelIndex - (parallelTotal - 1) / 2) * 26 : 0;
  const startY = fromCenterY + spreadOffset * 0.45;
  const endY = toCenterY + spreadOffset * 0.45;

  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  const curvePull = Math.max(64, Math.min(220, dx * 0.5 + dy * 0.2));
  const dir = goingRight ? 1 : -1;

  const c1x = startX + dir * curvePull;
  const c1y = startY + spreadOffset;
  const c2x = endX - dir * curvePull;
  const c2y = endY + spreadOffset;

  const path = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;

  // Midpoint of cubic Bezier at t = 0.5
  const labelX = 0.125 * startX + 0.375 * c1x + 0.375 * c2x + 0.125 * endX;
  const labelY = 0.125 * startY + 0.375 * c1y + 0.375 * c2y + 0.125 * endY;

  return { path, labelX, labelY };
}

export function buildSceneGraph(quest: Quest, existingAnalysis?: QuestAnalysis): SceneGraphModel {
  const analysis = existingAnalysis ?? analyzeQuest(quest);
  const sceneMap = new Map<string, Scene>();
  for (const scene of quest.scenes) {
    sceneMap.set(scene.id, scene);
  }

  const reachableSet = new Set(analysis.reachableSceneIds);
  const incomingCounts = new Map<string, number>();
  const outgoingCounts = new Map<string, number>();
  const errorCounts = new Map<string, number>();
  const warningCounts = new Map<string, number>();
  const infoCounts = new Map<string, number>();
  const deadEndSet = new Set<string>();
  const brokenSourceSet = new Set<string>();
  const unreachableSet = new Set<string>();
  const brokenChoices: BrokenGraphChoice[] = [];

  for (const issue of analysis.issues) {
    if (!issue.sceneId) {
      continue;
    }
    if (issue.severity === 'error') {
      errorCounts.set(issue.sceneId, (errorCounts.get(issue.sceneId) ?? 0) + 1);
    } else if (issue.severity === 'warning') {
      warningCounts.set(issue.sceneId, (warningCounts.get(issue.sceneId) ?? 0) + 1);
    } else {
      infoCounts.set(issue.sceneId, (infoCounts.get(issue.sceneId) ?? 0) + 1);
    }

    if (issue.code === 'WARN_DEAD_END_SCENE') {
      deadEndSet.add(issue.sceneId);
    } else if (issue.code === 'ERR_BROKEN_TARGET_SCENE') {
      brokenSourceSet.add(issue.sceneId);
    } else if (issue.code === 'WARN_UNREACHABLE_SCENE') {
      unreachableSet.add(issue.sceneId);
    }
  }

  // Group edges by (fromSceneId -> toSceneId) so parallel edges curve cleanly without overlap
  type PendingEdge = {
    fromScene: Scene;
    toScene: Scene;
    choiceId: string;
    label: string;
    choiceIndex: number;
    isSelfLoop: boolean;
    isConditional: boolean;
    hasEffects: boolean;
  };
  const edgeBuckets = new Map<string, PendingEdge[]>();

  for (const scene of quest.scenes) {
    const sortedChoices = [...scene.choices].sort((a, b) => a.sortOrder - b.sortOrder);
    sortedChoices.forEach((choice, idx) => {
      if (choice.targetSceneId === null) {
        return;
      }
      const targetScene = sceneMap.get(choice.targetSceneId);
      if (!targetScene) {
        brokenSourceSet.add(scene.id);
        brokenChoices.push({
          sceneId: scene.id,
          choiceId: choice.id,
          targetSceneId: choice.targetSceneId,
        });
        return;
      }

      outgoingCounts.set(scene.id, (outgoingCounts.get(scene.id) ?? 0) + 1);
      if (targetScene.id !== scene.id) {
        incomingCounts.set(targetScene.id, (incomingCounts.get(targetScene.id) ?? 0) + 1);
      }

      const key = `${scene.id}->${targetScene.id}`;
      const bucket = edgeBuckets.get(key) ?? [];
      bucket.push({
        fromScene: scene,
        toScene: targetScene,
        choiceId: choice.id,
        label: choice.text,
        choiceIndex: idx + 1,
        isSelfLoop: scene.id === targetScene.id,
        isConditional: choice.conditions.length > 0,
        hasEffects: choice.effects.length > 0,
      });
      edgeBuckets.set(key, bucket);
    });
  }

  const edges: SceneGraphEdge[] = [];
  for (const bucket of edgeBuckets.values()) {
    const total = bucket.length;
    bucket.forEach((item, parallelIndex) => {
      const geom = computeEdgeGeometry(item.fromScene, item.toScene, parallelIndex, total);
      edges.push({
        id: item.choiceId,
        choiceId: item.choiceId,
        fromSceneId: item.fromScene.id,
        toSceneId: item.toScene.id,
        label: item.label,
        choiceIndex: item.choiceIndex,
        isSelfLoop: item.isSelfLoop,
        isConditional: item.isConditional,
        hasEffects: item.hasEffects,
        path: geom.path,
        labelX: geom.labelX,
        labelY: geom.labelY,
      });
    });
  }

  const nodes: SceneGraphNode[] = quest.scenes.map((scene) => ({
    sceneId: scene.id,
    x: scene.posX,
    y: scene.posY,
    width: SCENE_NODE_WIDTH,
    height: SCENE_NODE_HEIGHT,
    isStart: quest.startSceneId === scene.id,
    reachable: reachableSet.has(scene.id),
    ending: scene.ending,
    isDeadEnd: deadEndSet.has(scene.id),
    hasBrokenEdge: brokenSourceSet.has(scene.id),
    incomingCount: incomingCounts.get(scene.id) ?? 0,
    outgoingCount: outgoingCounts.get(scene.id) ?? 0,
    errorCount: errorCounts.get(scene.id) ?? 0,
    warningCount: warningCounts.get(scene.id) ?? 0,
    infoCount: infoCounts.get(scene.id) ?? 0,
  }));

  let bounds: SceneGraphBounds;
  if (nodes.length === 0) {
    bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  } else {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      if (node.x < minX) minX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.x + node.width > maxX) maxX = node.x + node.width;
      if (node.y + node.height > maxY) maxY = node.y + node.height;
    }
    bounds = {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  return {
    analysis,
    nodes,
    edges,
    brokenChoices,
    unreachableSceneIds: [...unreachableSet],
    deadEndSceneIds: [...deadEndSet],
    bounds,
  };
}

export function computeFitViewport(
  nodes: ReadonlyArray<{ x: number; y: number; width: number; height: number }>,
  viewportWidth: number,
  viewportHeight: number,
  options: FitViewportOptions = {},
): ViewportState {
  if (nodes.length === 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { panX: 0, panY: 0, zoom: 1 };
  }

  const padding = options.padding ?? 48;
  const minZoom = options.minZoom ?? 0.25;
  const maxZoom = options.maxZoom ?? 1.2;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    if (node.x < minX) minX = node.x;
    if (node.y < minY) minY = node.y;
    if (node.x + node.width > maxX) maxX = node.x + node.width;
    if (node.y + node.height > maxY) maxY = node.y + node.height;
  }

  const graphW = Math.max(1, maxX - minX);
  const graphH = Math.max(1, maxY - minY);
  const availW = Math.max(40, viewportWidth - padding * 2);
  const availH = Math.max(40, viewportHeight - padding * 2);

  const rawZoom = Math.min(availW / graphW, availH / graphH);
  const zoom = Math.max(minZoom, Math.min(maxZoom, Number(rawZoom.toFixed(3))));

  const scaledW = graphW * zoom;
  const scaledH = graphH * zoom;
  const panX = Math.round((viewportWidth - scaledW) / 2 - minX * zoom);
  const panY = Math.round((viewportHeight - scaledH) / 2 - minY * zoom);

  return { panX, panY, zoom };
}

export function suggestNewScenePosition(
  quest: Quest,
  anchorSceneId?: string | null,
): { posX: number; posY: number } {
  if (quest.scenes.length === 0) {
    return { posX: 120, posY: 160 };
  }

  const collides = (x: number, y: number): boolean =>
    quest.scenes.some(
      (s) =>
        Math.abs(s.posX - x) < SCENE_NODE_WIDTH + 24 &&
        Math.abs(s.posY - y) < SCENE_NODE_HEIGHT + 24,
    );

  const anchor = anchorSceneId ? quest.scenes.find((s) => s.id === anchorSceneId) : undefined;
  let candidateX = anchor ? anchor.posX + 340 : 120;
  let candidateY = anchor ? anchor.posY : 160;

  if (!anchor) {
    let maxRight = -Infinity;
    let avgY = 0;
    for (const s of quest.scenes) {
      if (s.posX > maxRight) {
        maxRight = s.posX;
        avgY = s.posY;
      }
    }
    candidateX = Math.round(maxRight + 320);
    candidateY = Math.round(avgY);
  }

  let attempts = 0;
  while (collides(candidateX, candidateY) && attempts < 20) {
    candidateY += 160;
    attempts += 1;
  }

  return {
    posX: Math.round(candidateX),
    posY: Math.round(candidateY),
  };
}

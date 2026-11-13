import {
  computeFitViewport,
  SCENE_NODE_HEIGHT,
  SCENE_NODE_WIDTH,
  t,
  type Quest,
  type SceneGraphModel,
  type ViewportState,
} from '@quest-forge/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppPreferences } from '../../state/preferences.js';

type SceneGraphCanvasProps = {
  quest: Quest;
  graph: SceneGraphModel;
  selectedSceneId: string | null;
  canAuthor: boolean;
  focusRequest: { sceneId: string; seq: number } | null;
  onSelectScene: (sceneId: string) => void;
  onMoveScene: (sceneId: string, posX: number, posY: number, commitImmediate?: boolean) => void;
  onAutoLayout: () => void;
};

type DragNodeState = {
  sceneId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originPosX: number;
  originPosY: number;
  moved: boolean;
  lastX: number;
  lastY: number;
};

type PanState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originPanX: number;
  originPanY: number;
};

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

export function SceneGraphCanvas({
  quest,
  graph,
  selectedSceneId,
  canAuthor,
  focusRequest,
  onSelectScene,
  onMoveScene,
  onAutoLayout,
}: SceneGraphCanvasProps) {
  const { locale } = useAppPreferences();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<ViewportState>({ panX: 32, panY: 32, zoom: 0.9 });
  const [didInitialFit, setDidInitialFit] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragNodeState | null>(null);
  const [panState, setPanState] = useState<PanState | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const sceneById = useMemo(
    () => new Map(quest.scenes.map((scene) => [scene.id, scene])),
    [quest.scenes],
  );

  const fitGraph = useCallback(() => {
    const el = viewportRef.current;
    if (!el || graph.nodes.length === 0) {
      setViewport({ panX: 32, panY: 32, zoom: 1 });
      return;
    }
    const rect = el.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 800;
    const height = rect.height > 0 ? rect.height : 520;
    setViewport(computeFitViewport(graph.nodes, width, height));
  }, [graph.nodes]);

  useEffect(() => {
    if (didInitialFit !== quest.id && graph.nodes.length > 0) {
      fitGraph();
      setDidInitialFit(quest.id);
    }
  }, [quest.id, graph.nodes.length, didInitialFit, fitGraph]);

  useEffect(() => {
    if (!focusRequest) {
      return;
    }
    const targetScene = sceneById.get(focusRequest.sceneId);
    const el = viewportRef.current;
    if (!targetScene || !el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 800;
    const height = rect.height > 0 ? rect.height : 520;
    setViewport((prev) => ({
      ...prev,
      panX: Math.round(width / 2 - (targetScene.posX + SCENE_NODE_WIDTH / 2) * prev.zoom),
      panY: Math.round(height / 2 - (targetScene.posY + SCENE_NODE_HEIGHT / 2) * prev.zoom),
    }));
  }, [focusRequest, sceneById]);

  function zoomAroundCenter(factor: number): void {
    const el = viewportRef.current;
    const rect = el?.getBoundingClientRect();
    const cx = rect && rect.width > 0 ? rect.width / 2 : 400;
    const cy = rect && rect.height > 0 ? rect.height / 2 : 260;

    setViewport((prev) => {
      const nextZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, Number((prev.zoom * factor).toFixed(2))),
      );
      const ratio = nextZoom / prev.zoom;
      return {
        zoom: nextZoom,
        panX: Math.round(cx - (cx - prev.panX) * ratio),
        panY: Math.round(cy - (cy - prev.panY) * ratio),
      };
    });
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>): void {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;

    setViewport((prev) => {
      const nextZoom = Math.max(
        MIN_ZOOM,
        Math.min(MAX_ZOOM, Number((prev.zoom * factor).toFixed(2))),
      );
      const ratio = nextZoom / prev.zoom;
      return {
        zoom: nextZoom,
        panX: Math.round(pointerX - (pointerX - prev.panX) * ratio),
        panY: Math.round(pointerY - (pointerY - prev.panY) * ratio),
      };
    });
  }

  function handleCanvasPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0 && e.button !== 1) {
      return;
    }
    const target = e.target as HTMLElement;
    if (target.closest('[data-graph-node="true"]') || target.closest('button')) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setPanState({
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originPanX: viewport.panX,
      originPanY: viewport.panY,
    });
  }

  function handleCanvasPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!panState || panState.pointerId !== e.pointerId) {
      return;
    }
    setViewport((prev) => ({
      ...prev,
      panX: Math.round(panState.originPanX + (e.clientX - panState.startClientX)),
      panY: Math.round(panState.originPanY + (e.clientY - panState.startClientY)),
    }));
  }

  function handleCanvasPointerUp(e: React.PointerEvent<HTMLDivElement>): void {
    if (panState && panState.pointerId === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setPanState(null);
    }
  }

  function handleNodePointerDown(
    e: React.PointerEvent<HTMLButtonElement>,
    sceneId: string,
    posX: number,
    posY: number,
  ): void {
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    onSelectScene(sceneId);
    if (!canAuthor) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragState({
      sceneId,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originPosX: posX,
      originPosY: posY,
      moved: false,
      lastX: posX,
      lastY: posY,
    });
  }

  function handleNodePointerMove(e: React.PointerEvent<HTMLButtonElement>): void {
    if (!dragState || dragState.pointerId !== e.pointerId) {
      return;
    }
    const dxScreen = e.clientX - dragState.startClientX;
    const dyScreen = e.clientY - dragState.startClientY;
    if (!dragState.moved && Math.hypot(dxScreen, dyScreen) < 4) {
      return;
    }
    const nextX = Math.round(dragState.originPosX + dxScreen / viewport.zoom);
    const nextY = Math.round(dragState.originPosY + dyScreen / viewport.zoom);
    setDragState((prev) => (prev ? { ...prev, moved: true, lastX: nextX, lastY: nextY } : null));
    onMoveScene(dragState.sceneId, nextX, nextY, false);
  }

  function finishNodeDrag(e: React.PointerEvent<HTMLButtonElement>): void {
    if (!dragState || dragState.pointerId !== e.pointerId) {
      return;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (dragState.moved) {
      onMoveScene(dragState.sceneId, dragState.lastX, dragState.lastY, true);
    }
    setDragState(null);
  }

  function handleNodeKeyDown(
    e: React.KeyboardEvent<HTMLButtonElement>,
    sceneId: string,
    title: string,
    posX: number,
    posY: number,
  ): void {
    if (!canAuthor) {
      return;
    }
    const step = e.shiftKey ? 80 : 24;
    let nextX = posX;
    let nextY = posY;
    if (e.key === 'ArrowLeft') {
      nextX -= step;
    } else if (e.key === 'ArrowRight') {
      nextX += step;
    } else if (e.key === 'ArrowUp') {
      nextY -= step;
    } else if (e.key === 'ArrowDown') {
      nextY += step;
    } else {
      return;
    }

    e.preventDefault();
    onSelectScene(sceneId);
    onMoveScene(sceneId, nextX, nextY, false);
    setLiveAnnouncement(
      t(locale, 'builder.scene.movedAnnouncement', {
        title: title || sceneId,
        x: Math.round(nextX),
        y: Math.round(nextY),
      }),
    );
  }

  return (
    <section
      className="qf-card qf-builder-canvas-card"
      aria-label={t(locale, 'builder.view.canvas')}
    >
      <div className="qf-canvas-toolbar">
        <div className="qf-controls-row">
          <button
            type="button"
            className="qf-btn qf-btn-sm"
            onClick={() => {
              zoomAroundCenter(0.85);
            }}
            aria-label={t(locale, 'builder.zoomOut')}
          >
            −
          </button>
          <span className="qf-badge qf-mono">{Math.round(viewport.zoom * 100)}%</span>
          <button
            type="button"
            className="qf-btn qf-btn-sm"
            onClick={() => {
              zoomAroundCenter(1.18);
            }}
            aria-label={t(locale, 'builder.zoomIn')}
          >
            +
          </button>
          <button type="button" className="qf-btn qf-btn-sm" onClick={fitGraph}>
            {t(locale, 'builder.fitView')}
          </button>
          <button
            type="button"
            className="qf-btn qf-btn-sm"
            onClick={() => {
              setViewport({ panX: 32, panY: 32, zoom: 1 });
            }}
          >
            {t(locale, 'builder.resetView')}
          </button>
        </div>
        <button
          type="button"
          className="qf-btn qf-btn-sm"
          onClick={onAutoLayout}
          disabled={!canAuthor}
        >
          {t(locale, 'builder.autoLayout')}
        </button>
      </div>

      <div
        ref={viewportRef}
        className={`qf-canvas-viewport ${panState ? 'is-panning' : ''}`}
        onWheel={handleWheel}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerUp}
        onPointerCancel={handleCanvasPointerUp}
      >
        <div
          className="qf-graph-world"
          style={{
            transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
          }}
        >
          <svg className="qf-graph-edges" width="1" height="1" aria-hidden="true">
            <defs>
              <marker
                id="qf-arrow-default"
                markerWidth="10"
                markerHeight="8"
                refX="9"
                refY="4"
                orient="auto"
              >
                <path d="M 0 0 L 10 4 L 0 8 z" className="qf-arrow-head default" />
              </marker>
              <marker
                id="qf-arrow-active"
                markerWidth="10"
                markerHeight="8"
                refX="9"
                refY="4"
                orient="auto"
              >
                <path d="M 0 0 L 10 4 L 0 8 z" className="qf-arrow-head active" />
              </marker>
              <marker
                id="qf-arrow-cond"
                markerWidth="10"
                markerHeight="8"
                refX="9"
                refY="4"
                orient="auto"
              >
                <path d="M 0 0 L 10 4 L 0 8 z" className="qf-arrow-head cond" />
              </marker>
            </defs>

            {graph.edges.map((edge) => {
              const isRelated =
                selectedSceneId !== null &&
                (edge.fromSceneId === selectedSceneId || edge.toSceneId === selectedSceneId);
              const markerId = isRelated
                ? 'url(#qf-arrow-active)'
                : edge.isConditional
                  ? 'url(#qf-arrow-cond)'
                  : 'url(#qf-arrow-default)';
              return (
                <g key={edge.id}>
                  <path
                    d={edge.path}
                    className={`qf-graph-edge-path ${isRelated ? 'is-active' : ''} ${edge.isConditional ? 'is-conditional' : ''}`}
                    markerEnd={markerId}
                  />
                  <g transform={`translate(${edge.labelX}, ${edge.labelY})`}>
                    <rect x="-18" y="-11" width="36" height="22" rx="11" className="qf-edge-pill" />
                    <text x="0" y="4" textAnchor="middle" className="qf-edge-pill-text">
                      #{edge.choiceIndex}
                      {edge.isConditional ? '?' : ''}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>

          {graph.nodes.map((node) => {
            const scene = sceneById.get(node.sceneId);
            if (!scene) {
              return null;
            }
            const isSelected = scene.id === selectedSceneId;
            const isDragging = dragState?.sceneId === scene.id && dragState.moved;
            const statusClass =
              scene.ending === 'win'
                ? 'ending-win'
                : scene.ending === 'lose'
                  ? 'ending-lose'
                  : node.hasBrokenEdge || node.errorCount > 0
                    ? 'has-error'
                    : !node.reachable || node.isDeadEnd
                      ? 'has-warning'
                      : '';

            return (
              <div
                key={scene.id}
                data-graph-node="true"
                className={`qf-graph-node ${isSelected ? 'is-selected' : ''} ${node.isStart ? 'is-start' : ''} ${statusClass}`}
                style={{
                  transform: `translate(${scene.posX}px, ${scene.posY}px)`,
                  width: `${SCENE_NODE_WIDTH}px`,
                  minHeight: `${SCENE_NODE_HEIGHT}px`,
                }}
              >
                <button
                  type="button"
                  className={`qf-node-handle ${isDragging ? 'dragging' : ''}`}
                  aria-label={t(locale, 'builder.scene.nodeHandleHint', {
                    title: scene.title || scene.id,
                  })}
                  aria-pressed={isSelected}
                  onPointerDown={(e) => {
                    handleNodePointerDown(e, scene.id, scene.posX, scene.posY);
                  }}
                  onPointerMove={handleNodePointerMove}
                  onPointerUp={finishNodeDrag}
                  onLostPointerCapture={finishNodeDrag}
                  onKeyDown={(e) => {
                    handleNodeKeyDown(e, scene.id, scene.title, scene.posX, scene.posY);
                  }}
                  onClick={() => {
                    onSelectScene(scene.id);
                  }}
                >
                  <span className="qf-node-title">{scene.title || scene.id}</span>
                  <span className="qf-node-preview">{scene.body.trim().slice(0, 64) || '—'}</span>
                </button>

                <div className="qf-node-footer">
                  <span className="qf-node-meta">
                    {node.isStart && (
                      <span className="qf-badge qf-badge-new">
                        {t(locale, 'builder.scene.badgeStart')}
                      </span>
                    )}
                    {scene.ending === 'win' && (
                      <span className="qf-badge qf-badge-win">
                        {t(locale, 'player.ending.win')}
                      </span>
                    )}
                    {scene.ending === 'lose' && (
                      <span className="qf-badge qf-badge-lose">
                        {t(locale, 'player.ending.lose')}
                      </span>
                    )}
                    {node.errorCount > 0 && (
                      <span className="qf-badge qf-badge-lose">! {node.errorCount}</span>
                    )}
                    {node.warningCount > 0 && (
                      <span className="qf-badge qf-badge-warn">? {node.warningCount}</span>
                    )}
                  </span>
                  <span className="qf-mono qf-muted-text">→ {scene.choices.length}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="qf-canvas-help">{t(locale, 'builder.canvas.help')}</p>
      <div className="visually-hidden" aria-live="polite">
        {liveAnnouncement}
      </div>
    </section>
  );
}

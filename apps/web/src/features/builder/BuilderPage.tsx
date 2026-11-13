import {
  buildSceneGraph,
  formatStructuredMessage,
  suggestNewScenePosition,
  t,
  type Condition,
  type Effect,
  type EndingType,
  type Quest,
  type Scene,
  type VariableValue,
} from '@quest-forge/engine';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api, ApiClientError } from '../../api/client.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { TopBar } from '../../components/TopBar.js';
import { useAppPreferences } from '../../state/preferences.js';
import { LayoutSaveQueue, SerializedSaveRunner, type SaveStatus } from './layoutSync.js';
import { QuestAnalyzerPanel } from './QuestAnalyzerPanel.js';
import { QuestSettingsPanel } from './QuestSettingsPanel.js';
import { SceneGraphCanvas } from './SceneGraphCanvas.js';
import { SceneInspector } from './SceneInspector.js';
import { SceneListPanel } from './SceneListPanel.js';

type BuilderPageProps = {
  questId: string;
  onNavigate: (path: string) => void;
};

type MobilePane = 'scenes' | 'canvas' | 'inspector';
type InspectorTab = 'scene' | 'quest' | 'analyzer';

export function BuilderPage({ questId, onNavigate }: BuilderPageProps) {
  const { locale, auth, openLoginDialog } = useAppPreferences();
  const [quest, setQuest] = useState<Quest | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [mobilePane, setMobilePane] = useState<MobilePane>('canvas');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('scene');
  const [pendingDeleteScene, setPendingDeleteScene] = useState<Scene | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ sceneId: string; seq: number } | null>(null);

  const canAuthor = !auth.authEnabled || auth.authenticated;

  const sceneTabId = useId();
  const questTabId = useId();
  const analyzerTabId = useId();

  const saveRunnerRef = useRef(new SerializedSaveRunner());
  const debounceTimersRef = useRef(new Map<string, number>());
  const pendingTasksRef = useRef(new Map<string, () => Promise<void>>());
  const layoutQueueRef = useRef<LayoutSaveQueue | null>(null);

  const handleApiError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiClientError) {
        if (err.status === 401) {
          openLoginDialog();
          return;
        }
        setErrorMsg(formatStructuredMessage(locale, { code: err.code, params: err.params }));
        return;
      }
      setErrorMsg(t(locale, 'player.errorLoad'));
    },
    [locale, openLoginDialog],
  );

  if (!layoutQueueRef.current) {
    layoutQueueRef.current = new LayoutSaveQueue(
      async (qId, positions) => {
        await api.updateLayout(qId, { positions });
      },
      {
        onStatus: (status) => {
          setSaveStatus(status);
        },
        onError: (err) => {
          handleApiError(err);
        },
      },
    );
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    setSaveStatus('saved');

    const timers = debounceTimersRef.current;
    for (const timer of timers.values()) {
      window.clearTimeout(timer);
    }
    timers.clear();
    pendingTasksRef.current.clear();
    layoutQueueRef.current?.clear();

    async function load() {
      try {
        const res = await api.getQuest(questId);
        if (cancelled) return;
        setQuest(res.quest);
        setSelectedSceneId(res.quest.startSceneId ?? res.quest.scenes[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) {
          handleApiError(err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [questId, handleApiError]);

  const flushAllPending = useCallback(async (): Promise<void> => {
    const timers = debounceTimersRef.current;
    for (const timer of timers.values()) {
      window.clearTimeout(timer);
    }
    timers.clear();

    const tasks = [...pendingTasksRef.current.entries()];
    pendingTasksRef.current.clear();

    await Promise.all([
      layoutQueueRef.current?.flush() ?? Promise.resolve(),
      ...tasks.map(([key, task]) =>
        saveRunnerRef.current.run(key, task).catch((err: unknown) => {
          setSaveStatus('error');
          handleApiError(err);
        }),
      ),
    ]);
    await saveRunnerRef.current.flushAll();
  }, [handleApiError]);

  useEffect(() => {
    const timers = debounceTimersRef.current;
    const queue = layoutQueueRef.current;
    const pendingTasks = pendingTasksRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
      for (const [key, task] of pendingTasks.entries()) {
        void saveRunnerRef.current.run(key, task);
      }
      pendingTasks.clear();
      void queue?.flush();
    };
  }, []);

  const graph = useMemo(() => (quest ? buildSceneGraph(quest) : null), [quest]);

  const selectedScene = useMemo(() => {
    if (!quest || !selectedSceneId) return null;
    return quest.scenes.find((s) => s.id === selectedSceneId) ?? null;
  }, [quest, selectedSceneId]);

  const scheduleSerializedSave = useCallback(
    (key: string, immediate: boolean, task: () => Promise<void>) => {
      const existing = debounceTimersRef.current.get(key);
      if (existing !== undefined) {
        window.clearTimeout(existing);
        debounceTimersRef.current.delete(key);
      }

      const execute = () => {
        pendingTasksRef.current.delete(key);
        setSaveStatus('saving');
        void saveRunnerRef.current
          .run(key, task)
          .then(() => {
            setSaveStatus((prev) => (prev === 'error' ? 'error' : 'saved'));
          })
          .catch((err: unknown) => {
            setSaveStatus('error');
            handleApiError(err);
          });
      };

      if (immediate) {
        execute();
        return;
      }

      pendingTasksRef.current.set(key, task);
      setSaveStatus('dirty');
      const timer = window.setTimeout(() => {
        debounceTimersRef.current.delete(key);
        execute();
      }, 420);
      debounceTimersRef.current.set(key, timer);
    },
    [handleApiError],
  );

  function selectAndFocusScene(sceneId: string, switchToSceneTab = false): void {
    setSelectedSceneId(sceneId);
    setFocusRequest((prev) => ({ sceneId, seq: (prev?.seq ?? 0) + 1 }));
    if (switchToSceneTab) {
      setInspectorTab('scene');
      setMobilePane('inspector');
    }
  }

  function handleMoveScene(
    sceneId: string,
    posX: number,
    posY: number,
    commitImmediate = false,
  ): void {
    const roundedX = Math.round(posX);
    const roundedY = Math.round(posY);
    setQuest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: prev.scenes.map((s) =>
          s.id === sceneId ? { ...s, posX: roundedX, posY: roundedY } : s,
        ),
      };
    });
    if (!canAuthor || !quest) return;
    layoutQueueRef.current?.enqueue(
      quest.id,
      { sceneId, posX: roundedX, posY: roundedY },
      commitImmediate ? 0 : 180,
    );
  }

  async function handleAutoLayout(): Promise<void> {
    if (!quest || !canAuthor) {
      if (!canAuthor) openLoginDialog();
      return;
    }
    try {
      layoutQueueRef.current?.clear(quest.id);
      setSaveStatus('saving');
      const res = await api.updateLayout(quest.id, { mode: 'bfs' });
      setQuest(res.quest);
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      handleApiError(err);
    }
  }

  async function handleCreateScene(linkChoice?: {
    fromSceneId: string;
    choiceId: string;
  }): Promise<void> {
    if (!quest || !canAuthor) {
      if (!canAuthor) openLoginDialog();
      return;
    }
    try {
      await flushAllPending();
      const anchorId = linkChoice?.fromSceneId ?? selectedSceneId;
      const pos = suggestNewScenePosition(quest, anchorId);
      setSaveStatus('saving');
      const { scene } = await api.createScene(quest.id, {
        title: locale === 'en' ? 'New Scene' : 'Новая сцена',
        body: '',
        ending: 'none',
        posX: pos.posX,
        posY: pos.posY,
      });

      if (linkChoice) {
        const { choice } = await saveRunnerRef.current.run(`choice:${linkChoice.choiceId}`, () =>
          api.updateChoice(linkChoice.choiceId, {
            targetSceneId: scene.id,
          }),
        );
        setQuest((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            scenes: [
              ...prev.scenes.map((s) =>
                s.id === linkChoice.fromSceneId
                  ? {
                      ...s,
                      choices: s.choices.map((c) => (c.id === choice.id ? choice : c)),
                    }
                  : s,
              ),
              scene,
            ],
          };
        });
      } else {
        setQuest((prev) => {
          if (!prev) return prev;
          const nextStart = prev.startSceneId ?? scene.id;
          return {
            ...prev,
            startSceneId: nextStart,
            scenes: [...prev.scenes, scene],
          };
        });
        if (!quest.startSceneId) {
          await api.updateQuest(quest.id, { startSceneId: scene.id });
        }
      }

      setSaveStatus('saved');
      selectAndFocusScene(scene.id, !linkChoice);
    } catch (err) {
      setSaveStatus('error');
      handleApiError(err);
    }
  }

  async function handleDuplicateScene(sceneId: string): Promise<void> {
    if (!quest || !canAuthor) {
      if (!canAuthor) openLoginDialog();
      return;
    }
    try {
      setSaveStatus('saving');
      const { scene } = await api.duplicateScene(sceneId);
      setQuest((prev) => (prev ? { ...prev, scenes: [...prev.scenes, scene] } : prev));
      setSaveStatus('saved');
      selectAndFocusScene(scene.id, true);
    } catch (err) {
      setSaveStatus('error');
      handleApiError(err);
    }
  }

  async function handleConfirmDeleteScene(): Promise<void> {
    if (!quest || !pendingDeleteScene || !canAuthor) return;
    const sceneToDelete = pendingDeleteScene;
    setPendingDeleteScene(null);
    try {
      setSaveStatus('saving');
      await api.deleteScene(sceneToDelete.id);
      setQuest((prev) => {
        if (!prev) return prev;
        const remaining = prev.scenes
          .filter((s) => s.id !== sceneToDelete.id)
          .map((s) => ({
            ...s,
            choices: s.choices.map((c) =>
              c.targetSceneId === sceneToDelete.id ? { ...c, targetSceneId: null } : c,
            ),
          }));
        return {
          ...prev,
          startSceneId: prev.startSceneId === sceneToDelete.id ? null : prev.startSceneId,
          scenes: remaining,
        };
      });
      if (selectedSceneId === sceneToDelete.id) {
        const nextScene = quest.scenes.find((s) => s.id !== sceneToDelete.id);
        setSelectedSceneId(nextScene?.id ?? null);
      }
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      handleApiError(err);
    }
  }

  function handleUpdateScene(
    sceneId: string,
    patch: {
      title?: string;
      body?: string;
      ending?: EndingType;
      imageUrl?: string | null;
      audioUrl?: string | null;
    },
    immediate = false,
  ): void {
    setQuest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
      };
    });
    if (!canAuthor) return;
    scheduleSerializedSave(`scene:${sceneId}`, immediate, async () => {
      await api.updateScene(sceneId, patch);
    });
  }

  function handleUpdateQuest(
    patch: {
      title?: string;
      description?: string;
      startSceneId?: string | null;
      initialVariables?: Record<string, VariableValue>;
    },
    immediate = false,
  ): void {
    if (!quest) return;
    setQuest((prev) => (prev ? { ...prev, ...patch } : prev));
    if (!canAuthor) return;
    scheduleSerializedSave(`quest:${quest.id}`, immediate, async () => {
      await api.updateQuest(quest.id, patch);
    });
  }

  async function handleAddChoice(sceneId: string): Promise<void> {
    if (!quest || !canAuthor) {
      if (!canAuthor) openLoginDialog();
      return;
    }
    try {
      setSaveStatus('saving');
      const { choice } = await api.createChoice(sceneId, {
        text: locale === 'en' ? 'New Choice' : 'Новый выбор',
        targetSceneId: null,
      });
      setQuest((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: prev.scenes.map((s) =>
            s.id === sceneId ? { ...s, choices: [...s.choices, choice] } : s,
          ),
        };
      });
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      handleApiError(err);
    }
  }

  function handleUpdateChoice(
    sceneId: string,
    choiceId: string,
    patch: {
      targetSceneId?: string | null;
      text?: string;
      conditions?: Condition[];
      effects?: Effect[];
    },
    immediate = false,
  ): void {
    setQuest((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        scenes: prev.scenes.map((s) =>
          s.id === sceneId
            ? {
                ...s,
                choices: s.choices.map((c) => (c.id === choiceId ? { ...c, ...patch } : c)),
              }
            : s,
        ),
      };
    });
    if (!canAuthor) return;
    scheduleSerializedSave(`choice:${choiceId}`, immediate, async () => {
      await api.updateChoice(choiceId, patch);
    });
  }

  async function handleDeleteChoice(sceneId: string, choiceId: string): Promise<void> {
    if (!canAuthor) {
      openLoginDialog();
      return;
    }
    try {
      setSaveStatus('saving');
      await api.deleteChoice(choiceId);
      setQuest((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: prev.scenes.map((s) =>
            s.id === sceneId ? { ...s, choices: s.choices.filter((c) => c.id !== choiceId) } : s,
          ),
        };
      });
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      handleApiError(err);
    }
  }

  async function handleReorderChoices(sceneId: string, orderedIds: string[]): Promise<void> {
    if (!canAuthor) {
      openLoginDialog();
      return;
    }
    try {
      setSaveStatus('saving');
      const { choices } = await api.reorderChoices(sceneId, orderedIds);
      setQuest((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scenes: prev.scenes.map((s) => (s.id === sceneId ? { ...s, choices } : s)),
        };
      });
      setSaveStatus('saved');
    } catch (err) {
      setSaveStatus('error');
      handleApiError(err);
    }
  }

  function handleInspectorTabKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    const order: InspectorTab[] = ['scene', 'quest', 'analyzer'];
    const currentIndex = order.indexOf(inspectorTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = order[(currentIndex + 1) % order.length];
      if (next) setInspectorTab(next);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = order[(currentIndex - 1 + order.length) % order.length];
      if (next) setInspectorTab(next);
    }
  }

  const issueCount = graph?.analysis.issues.length ?? 0;

  return (
    <>
      <TopBar
        onNavigate={onNavigate}
        extraActions={
          <div className="qf-controls-row">
            <button
              type="button"
              className="qf-btn qf-btn-sm"
              onClick={() => {
                onNavigate('/');
              }}
            >
              {t(locale, 'player.backToCatalog')}
            </button>
            {quest && (
              <button
                type="button"
                className="qf-btn qf-btn-primary qf-btn-sm"
                onClick={() => {
                  void flushAllPending().then(() => {
                    onNavigate(`/play/${encodeURIComponent(quest.id)}`);
                  });
                }}
              >
                {t(locale, 'builder.testPlay')}
              </button>
            )}
          </div>
        }
      />

      <main id="main-content" className="qf-builder-main" tabIndex={-1}>
        {loading && <div className="qf-card">{t(locale, 'player.loading')}</div>}

        {errorMsg && (
          <div className="qf-error-banner" role="alert">
            {errorMsg}
          </div>
        )}

        {!loading && quest && graph && (
          <>
            <header className="qf-card qf-builder-header">
              <div className="qf-builder-title-wrap">
                <h1 className="qf-builder-title">{quest.title}</h1>
                <div className="qf-controls-row">
                  <span
                    className={`qf-badge ${
                      saveStatus === 'error'
                        ? 'qf-badge-lose'
                        : saveStatus === 'saved'
                          ? 'qf-badge-win'
                          : 'qf-badge-info'
                    }`}
                    aria-live="polite"
                  >
                    {t(locale, `builder.saveStatus.${saveStatus}`)}
                  </span>
                  <span
                    className={`qf-badge ${graph.analysis.playable ? 'qf-badge-win' : 'qf-badge-lose'}`}
                  >
                    {graph.analysis.playable
                      ? t(locale, 'catalog.ready')
                      : t(locale, 'catalog.notReady')}
                  </span>
                  <button
                    type="button"
                    className={`qf-badge qf-badge-btn ${issueCount > 0 ? 'qf-badge-warn' : ''}`}
                    onClick={() => {
                      setInspectorTab('analyzer');
                      setMobilePane('inspector');
                    }}
                  >
                    {t(locale, 'builder.analyzer.issuesCount', { count: issueCount })}
                  </button>
                </div>
              </div>

              {!canAuthor && (
                <div className="qf-auth-banner" role="status">
                  <span>{t(locale, 'builder.authBanner')}</span>
                  <button
                    type="button"
                    className="qf-btn qf-btn-primary qf-btn-sm"
                    onClick={openLoginDialog}
                  >
                    {t(locale, 'nav.login')}
                  </button>
                </div>
              )}

              <div
                className="qf-mobile-pane-switch"
                role="group"
                aria-label={t(locale, 'nav.builder')}
              >
                <button
                  type="button"
                  className={`qf-btn qf-btn-sm ${mobilePane === 'scenes' ? 'qf-btn-primary' : ''}`}
                  aria-pressed={mobilePane === 'scenes'}
                  onClick={() => {
                    setMobilePane('scenes');
                  }}
                >
                  {t(locale, 'builder.view.scenes')}
                </button>
                <button
                  type="button"
                  className={`qf-btn qf-btn-sm ${mobilePane === 'canvas' ? 'qf-btn-primary' : ''}`}
                  aria-pressed={mobilePane === 'canvas'}
                  onClick={() => {
                    setMobilePane('canvas');
                  }}
                >
                  {t(locale, 'builder.view.canvas')}
                </button>
                <button
                  type="button"
                  className={`qf-btn qf-btn-sm ${mobilePane === 'inspector' ? 'qf-btn-primary' : ''}`}
                  aria-pressed={mobilePane === 'inspector'}
                  onClick={() => {
                    setMobilePane('inspector');
                  }}
                >
                  {t(locale, 'builder.view.inspector')}
                </button>
              </div>
            </header>

            <div className="qf-builder-workspace" data-mobile-pane={mobilePane}>
              <div className="qf-builder-col qf-builder-col-scenes">
                <SceneListPanel
                  quest={quest}
                  graph={graph}
                  selectedSceneId={selectedSceneId}
                  canAuthor={canAuthor}
                  onSelectScene={(id) => {
                    selectAndFocusScene(id, false);
                  }}
                  onCreateScene={() => {
                    void handleCreateScene();
                  }}
                  onDuplicateScene={(id) => {
                    void handleDuplicateScene(id);
                  }}
                  onDeleteScene={(scene) => {
                    setPendingDeleteScene(scene);
                  }}
                />
              </div>

              <div className="qf-builder-col qf-builder-col-canvas">
                <SceneGraphCanvas
                  quest={quest}
                  graph={graph}
                  selectedSceneId={selectedSceneId}
                  canAuthor={canAuthor}
                  focusRequest={focusRequest}
                  onSelectScene={(id) => {
                    setSelectedSceneId(id);
                  }}
                  onMoveScene={handleMoveScene}
                  onAutoLayout={() => {
                    void handleAutoLayout();
                  }}
                />
              </div>

              <aside className="qf-card qf-builder-col qf-builder-col-inspector">
                <div
                  className="qf-tablist"
                  role="tablist"
                  aria-label={t(locale, 'builder.view.inspector')}
                  onKeyDown={handleInspectorTabKeyDown}
                >
                  <button
                    id={sceneTabId}
                    type="button"
                    role="tab"
                    className="qf-tab-btn"
                    aria-selected={inspectorTab === 'scene'}
                    tabIndex={inspectorTab === 'scene' ? 0 : -1}
                    onClick={() => {
                      setInspectorTab('scene');
                    }}
                  >
                    {t(locale, 'builder.tab.scene')}
                  </button>
                  <button
                    id={questTabId}
                    type="button"
                    role="tab"
                    className="qf-tab-btn"
                    aria-selected={inspectorTab === 'quest'}
                    tabIndex={inspectorTab === 'quest' ? 0 : -1}
                    onClick={() => {
                      setInspectorTab('quest');
                    }}
                  >
                    {t(locale, 'builder.tab.quest')}
                  </button>
                  <button
                    id={analyzerTabId}
                    type="button"
                    role="tab"
                    className="qf-tab-btn"
                    aria-selected={inspectorTab === 'analyzer'}
                    tabIndex={inspectorTab === 'analyzer' ? 0 : -1}
                    onClick={() => {
                      setInspectorTab('analyzer');
                    }}
                  >
                    {t(locale, 'builder.tab.analyzer')} ({issueCount})
                  </button>
                </div>

                <div
                  role="tabpanel"
                  aria-labelledby={sceneTabId}
                  hidden={inspectorTab !== 'scene'}
                  className="qf-tabpanel"
                >
                  {inspectorTab === 'scene' && (
                    <SceneInspector
                      quest={quest}
                      scene={selectedScene}
                      knownItems={graph.analysis.items}
                      knownVariables={graph.analysis.variables}
                      canAuthor={canAuthor}
                      onUpdateScene={handleUpdateScene}
                      onSetStartScene={(sceneId) => {
                        handleUpdateQuest({ startSceneId: sceneId }, true);
                      }}
                      onMoveScene={handleMoveScene}
                      onDuplicateScene={(sceneId) => {
                        void handleDuplicateScene(sceneId);
                      }}
                      onDeleteScene={(scene) => {
                        setPendingDeleteScene(scene);
                      }}
                      onAddChoice={(sceneId) => {
                        void handleAddChoice(sceneId);
                      }}
                      onCreateTargetSceneForChoice={(fromSceneId, choiceId) => {
                        void handleCreateScene({ fromSceneId, choiceId });
                      }}
                      onUpdateChoice={handleUpdateChoice}
                      onDeleteChoice={(sceneId, choiceId) => {
                        void handleDeleteChoice(sceneId, choiceId);
                      }}
                      onReorderChoices={(sceneId, orderedIds) => {
                        void handleReorderChoices(sceneId, orderedIds);
                      }}
                    />
                  )}
                </div>

                <div
                  role="tabpanel"
                  aria-labelledby={questTabId}
                  hidden={inspectorTab !== 'quest'}
                  className="qf-tabpanel"
                >
                  {inspectorTab === 'quest' && (
                    <QuestSettingsPanel
                      quest={quest}
                      canAuthor={canAuthor}
                      onUpdateQuest={handleUpdateQuest}
                    />
                  )}
                </div>

                <div
                  role="tabpanel"
                  aria-labelledby={analyzerTabId}
                  hidden={inspectorTab !== 'analyzer'}
                  className="qf-tabpanel"
                >
                  {inspectorTab === 'analyzer' && (
                    <QuestAnalyzerPanel
                      analysis={graph.analysis}
                      onJumpToScene={(sceneId) => {
                        selectAndFocusScene(sceneId, true);
                      }}
                    />
                  )}
                </div>
              </aside>
            </div>
          </>
        )}
      </main>

      <ConfirmDialog
        open={pendingDeleteScene !== null}
        title={t(locale, 'builder.scene.confirmDeleteTitle')}
        body={t(locale, 'builder.scene.confirmDeleteBody', {
          title: pendingDeleteScene?.title ?? '',
        })}
        confirmLabel={t(locale, 'catalog.delete')}
        cancelLabel={t(locale, 'catalog.cancel')}
        onConfirm={() => {
          void handleConfirmDeleteScene();
        }}
        onCancel={() => {
          setPendingDeleteScene(null);
        }}
      />
    </>
  );
}

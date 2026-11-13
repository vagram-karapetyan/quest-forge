import { t, type Quest, type Scene, type SceneGraphModel } from '@quest-forge/engine';
import { useId, useMemo, useState } from 'react';
import { useAppPreferences } from '../../state/preferences.js';

type SceneListPanelProps = {
  quest: Quest;
  graph: SceneGraphModel;
  selectedSceneId: string | null;
  canAuthor: boolean;
  onSelectScene: (sceneId: string) => void;
  onCreateScene: () => void;
  onDuplicateScene: (sceneId: string) => void;
  onDeleteScene: (scene: Scene) => void;
};

export function SceneListPanel({
  quest,
  graph,
  selectedSceneId,
  canAuthor,
  onSelectScene,
  onCreateScene,
  onDuplicateScene,
  onDeleteScene,
}: SceneListPanelProps) {
  const { locale } = useAppPreferences();
  const [filterText, setFilterText] = useState('');
  const searchInputId = useId();

  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.sceneId, node])),
    [graph.nodes],
  );

  const filteredScenes = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) {
      return quest.scenes;
    }
    return quest.scenes.filter(
      (scene) =>
        scene.title.toLowerCase().includes(q) ||
        scene.body.toLowerCase().includes(q) ||
        scene.id.toLowerCase().includes(q),
    );
  }, [quest.scenes, filterText]);

  return (
    <section className="qf-card qf-builder-panel" aria-label={t(locale, 'builder.view.scenes')}>
      <div className="qf-builder-panel-header">
        <h2 className="qf-builder-panel-title">
          {t(locale, 'builder.view.scenes')} ({quest.scenes.length})
        </h2>
        <button
          type="button"
          className="qf-btn qf-btn-primary qf-btn-sm"
          onClick={onCreateScene}
          disabled={!canAuthor}
        >
          + {t(locale, 'builder.addScene')}
        </button>
      </div>

      <search className="qf-builder-search">
        <label htmlFor={searchInputId} className="visually-hidden">
          {t(locale, 'builder.scenesSearchLabel')}
        </label>
        <input
          id={searchInputId}
          type="search"
          className="qf-input"
          value={filterText}
          onChange={(e) => {
            setFilterText(e.target.value);
          }}
          placeholder={t(locale, 'builder.scenesSearchPlaceholder')}
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </search>

      {filteredScenes.length === 0 ? (
        <p className="qf-muted-text">{t(locale, 'builder.noScenesMatch')}</p>
      ) : (
        <ul className="qf-scene-list">
          {filteredScenes.map((scene) => {
            const node = nodeById.get(scene.id);
            const isSelected = scene.id === selectedSceneId;
            return (
              <li
                key={scene.id}
                className={`qf-scene-list-item ${isSelected ? 'is-selected' : ''}`}
              >
                <button
                  type="button"
                  className="qf-scene-list-select"
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => {
                    onSelectScene(scene.id);
                  }}
                >
                  <span className="qf-scene-list-title">{scene.title || scene.id}</span>
                  <span className="qf-scene-list-badges">
                    {quest.startSceneId === scene.id && (
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
                    {node && !node.reachable && quest.startSceneId && (
                      <span className="qf-badge qf-badge-warn">
                        {t(locale, 'builder.scene.badgeUnreachable')}
                      </span>
                    )}
                    {node?.isDeadEnd && (
                      <span className="qf-badge qf-badge-warn">
                        {t(locale, 'builder.scene.badgeDeadEnd')}
                      </span>
                    )}
                    {node && node.errorCount > 0 && (
                      <span className="qf-badge qf-badge-lose">! {node.errorCount}</span>
                    )}
                  </span>
                </button>
                <div className="qf-scene-list-actions">
                  <button
                    type="button"
                    className="qf-btn qf-btn-xs"
                    disabled={!canAuthor}
                    aria-label={`${t(locale, 'builder.scene.duplicate')}: ${scene.title}`}
                    onClick={() => {
                      onDuplicateScene(scene.id);
                    }}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="qf-btn qf-btn-xs qf-btn-danger"
                    disabled={!canAuthor}
                    aria-label={`${t(locale, 'builder.scene.delete')}: ${scene.title}`}
                    onClick={() => {
                      onDeleteScene(scene);
                    }}
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

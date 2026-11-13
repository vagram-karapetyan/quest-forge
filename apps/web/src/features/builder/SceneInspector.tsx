import {
  sanitizeUrl,
  t,
  type Choice,
  type Condition,
  type Effect,
  type EndingType,
  type Quest,
  type Scene,
} from '@quest-forge/engine';
import { useEffect, useId, useRef, useState } from 'react';
import { useAppPreferences } from '../../state/preferences.js';
import { ChoiceLogicEditor } from './ChoiceLogicEditor.js';

type SceneInspectorProps = {
  quest: Quest;
  scene: Scene | null;
  knownItems: string[];
  knownVariables: string[];
  canAuthor: boolean;
  onUpdateScene: (
    sceneId: string,
    patch: {
      title?: string;
      body?: string;
      ending?: EndingType;
      imageUrl?: string | null;
      audioUrl?: string | null;
    },
    immediate?: boolean,
  ) => void;
  onSetStartScene: (sceneId: string) => void;
  onMoveScene: (sceneId: string, posX: number, posY: number, commitImmediate?: boolean) => void;
  onDuplicateScene: (sceneId: string) => void;
  onDeleteScene: (scene: Scene) => void;
  onAddChoice: (sceneId: string) => void;
  onCreateTargetSceneForChoice: (sceneId: string, choiceId: string) => void;
  onUpdateChoice: (
    sceneId: string,
    choiceId: string,
    patch: {
      targetSceneId?: string | null;
      text?: string;
      conditions?: Condition[];
      effects?: Effect[];
    },
    immediate?: boolean,
  ) => void;
  onDeleteChoice: (sceneId: string, choiceId: string) => void;
  onReorderChoices: (sceneId: string, orderedIds: string[]) => void;
};

function rulesValid(conditions: Condition[], effects: Effect[]): boolean {
  for (const c of conditions) {
    if (c.type === 'has_item' && c.item.trim().length === 0) return false;
    if (c.type === 'var' && c.key.trim().length === 0) return false;
  }
  for (const e of effects) {
    if ((e.type === 'give_item' || e.type === 'take_item') && e.item.trim().length === 0) {
      return false;
    }
    if ((e.type === 'set_var' || e.type === 'add_var') && e.key.trim().length === 0) {
      return false;
    }
  }
  return true;
}

type ChoiceEditorCardProps = {
  choice: Choice;
  index: number;
  total: number;
  scenes: Scene[];
  knownItems: string[];
  knownVariables: string[];
  canAuthor: boolean;
  onCreateTargetScene: () => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  onCommit: (
    patch: {
      targetSceneId?: string | null;
      text?: string;
      conditions?: Condition[];
      effects?: Effect[];
    },
    immediate?: boolean,
  ) => void;
};

function ChoiceEditorCard({
  choice,
  index,
  total,
  scenes,
  knownItems,
  knownVariables,
  canAuthor,
  onCreateTargetScene,
  onMove,
  onDelete,
  onCommit,
}: ChoiceEditorCardProps) {
  const { locale } = useAppPreferences();
  const textId = useId();
  const targetId = useId();

  const [text, setText] = useState(choice.text);
  const [targetSceneId, setTargetSceneId] = useState<string | null>(choice.targetSceneId);
  const [conditions, setConditions] = useState<Condition[]>(choice.conditions);
  const [effects, setEffects] = useState<Effect[]>(choice.effects);

  useEffect(() => {
    setText(choice.text);
    setTargetSceneId(choice.targetSceneId);
    setConditions(choice.conditions);
    setEffects(choice.effects);
  }, [choice.id, choice.targetSceneId]);

  const invalidRules = !rulesValid(conditions, effects);

  function scheduleSave(
    nextText: string,
    nextTarget: string | null,
    nextConditions: Condition[],
    nextEffects: Effect[],
    immediate = false,
  ): void {
    if (!canAuthor || !rulesValid(nextConditions, nextEffects)) {
      return;
    }
    onCommit(
      {
        text: nextText,
        targetSceneId: nextTarget,
        conditions: nextConditions,
        effects: nextEffects,
      },
      immediate,
    );
  }

  return (
    <div className="qf-choice-editor-card">
      <div className="qf-choice-editor-head">
        <span className="qf-badge qf-mono">#{index + 1}</span>
        <div className="qf-controls-row">
          <button
            type="button"
            className="qf-btn qf-btn-xs"
            disabled={!canAuthor || index === 0}
            aria-label={t(locale, 'builder.choice.moveUp')}
            onClick={() => {
              onMove(-1);
            }}
          >
            ↑
          </button>
          <button
            type="button"
            className="qf-btn qf-btn-xs"
            disabled={!canAuthor || index === total - 1}
            aria-label={t(locale, 'builder.choice.moveDown')}
            onClick={() => {
              onMove(1);
            }}
          >
            ↓
          </button>
          <button
            type="button"
            className="qf-btn qf-btn-xs qf-btn-danger"
            disabled={!canAuthor}
            aria-label={t(locale, 'builder.choice.delete')}
            onClick={onDelete}
          >
            ×
          </button>
        </div>
      </div>

      <div className="qf-field-group">
        <label className="qf-label" htmlFor={textId}>
          {t(locale, 'builder.choice.text')}
        </label>
        <input
          id={textId}
          type="text"
          className="qf-input"
          disabled={!canAuthor}
          value={text}
          onChange={(e) => {
            const val = e.target.value;
            setText(val);
            scheduleSave(val, targetSceneId, conditions, effects, false);
          }}
          onBlur={() => {
            scheduleSave(text, targetSceneId, conditions, effects, true);
          }}
        />
      </div>

      <div className="qf-field-group">
        <label className="qf-label" htmlFor={targetId}>
          {t(locale, 'builder.choice.target')}
        </label>
        <div className="qf-target-row">
          <select
            id={targetId}
            className="qf-select"
            disabled={!canAuthor}
            value={targetSceneId ?? ''}
            onChange={(e) => {
              const val = e.target.value || null;
              setTargetSceneId(val);
              scheduleSave(text, val, conditions, effects, true);
            }}
          >
            <option value="">{t(locale, 'builder.choice.stayOnScene')}</option>
            {scenes.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title || candidate.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="qf-btn qf-btn-xs"
            disabled={!canAuthor}
            onClick={onCreateTargetScene}
          >
            {t(locale, 'builder.choice.createTargetAndLink')}
          </button>
        </div>
      </div>

      <ChoiceLogicEditor
        choiceId={choice.id}
        conditions={conditions}
        effects={effects}
        knownItems={knownItems}
        knownVariables={knownVariables}
        disabled={!canAuthor}
        onChangeConditions={(nextConds) => {
          setConditions(nextConds);
          scheduleSave(text, targetSceneId, nextConds, effects, false);
        }}
        onChangeEffects={(nextEffs) => {
          setEffects(nextEffs);
          scheduleSave(text, targetSceneId, conditions, nextEffs, false);
        }}
      />

      {invalidRules && (
        <p className="qf-field-error" role="alert">
          {t(locale, 'msg.ERR_VALIDATION')}
        </p>
      )}
    </div>
  );
}

export function SceneInspector({
  quest,
  scene,
  knownItems,
  knownVariables,
  canAuthor,
  onUpdateScene,
  onSetStartScene,
  onMoveScene,
  onDuplicateScene,
  onDeleteScene,
  onAddChoice,
  onCreateTargetSceneForChoice,
  onUpdateChoice,
  onDeleteChoice,
  onReorderChoices,
}: SceneInspectorProps) {
  const { locale } = useAppPreferences();
  const formHeadingId = useId();
  const titleId = useId();
  const bodyId = useId();
  const endingId = useId();
  const imageId = useId();
  const audioId = useId();
  const imageErrId = useId();
  const audioErrId = useId();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [ending, setEnding] = useState<EndingType>('none');
  const [imageUrl, setImageUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [touchedUrl, setTouchedUrl] = useState<{ image: boolean; audio: boolean }>({
    image: false,
    audio: false,
  });

  const activeSceneIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!scene) {
      activeSceneIdRef.current = null;
      return;
    }
    if (activeSceneIdRef.current !== scene.id) {
      activeSceneIdRef.current = scene.id;
      setTitle(scene.title);
      setBody(scene.body);
      setEnding(scene.ending);
      setImageUrl(scene.imageUrl ?? '');
      setAudioUrl(scene.audioUrl ?? '');
      setTouchedUrl({ image: false, audio: false });
    }
  }, [scene]);

  if (!scene) {
    return <p className="qf-muted-text">{t(locale, 'builder.scene.selectPrompt')}</p>;
  }

  const trimmedImage = imageUrl.trim();
  const trimmedAudio = audioUrl.trim();
  const imageValid = trimmedImage.length === 0 || sanitizeUrl(trimmedImage) !== null;
  const audioValid = trimmedAudio.length === 0 || sanitizeUrl(trimmedAudio) !== null;

  function buildScenePatch(overrides?: {
    title?: string;
    body?: string;
    ending?: EndingType;
    imageUrl?: string;
    audioUrl?: string;
  }) {
    const nextImg = (overrides?.imageUrl ?? imageUrl).trim();
    const nextAudio = (overrides?.audioUrl ?? audioUrl).trim();
    const imgSanitized = nextImg.length === 0 ? null : sanitizeUrl(nextImg);
    const audioSanitized = nextAudio.length === 0 ? null : sanitizeUrl(nextAudio);

    return {
      title: overrides?.title ?? title,
      body: overrides?.body ?? body,
      ending: overrides?.ending ?? ending,
      ...(nextImg.length === 0 || imgSanitized !== null ? { imageUrl: imgSanitized } : {}),
      ...(nextAudio.length === 0 || audioSanitized !== null ? { audioUrl: audioSanitized } : {}),
    };
  }

  function handleFormSubmit(e: React.SyntheticEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!scene || !canAuthor) return;
    setTouchedUrl({ image: true, audio: true });
    onUpdateScene(scene.id, buildScenePatch(), true);
  }

  const isStart = quest.startSceneId === scene.id;

  return (
    <div className="qf-inspector-stack">
      <div className="qf-inspector-actions-bar">
        {isStart ? (
          <span className="qf-badge qf-badge-new">{t(locale, 'builder.scene.isStart')}</span>
        ) : (
          <button
            type="button"
            className="qf-btn qf-btn-sm"
            disabled={!canAuthor}
            onClick={() => {
              onSetStartScene(scene.id);
            }}
          >
            {t(locale, 'builder.scene.setStart')}
          </button>
        )}
        <div className="qf-controls-row">
          <button
            type="button"
            className="qf-btn qf-btn-sm"
            disabled={!canAuthor}
            onClick={() => {
              onDuplicateScene(scene.id);
            }}
          >
            {t(locale, 'builder.scene.duplicate')}
          </button>
          <button
            type="button"
            className="qf-btn qf-btn-sm qf-btn-danger"
            disabled={!canAuthor}
            onClick={() => {
              onDeleteScene(scene);
            }}
          >
            {t(locale, 'builder.scene.delete')}
          </button>
        </div>
      </div>

      <form
        onSubmit={handleFormSubmit}
        aria-labelledby={formHeadingId}
        className="qf-inspector-form"
      >
        <h3 id={formHeadingId} className="visually-hidden">
          {t(locale, 'builder.tab.scene')}
        </h3>

        <div className="qf-field-group">
          <label className="qf-label" htmlFor={titleId}>
            {t(locale, 'builder.scene.title')}
          </label>
          <input
            id={titleId}
            name="sceneTitle"
            type="text"
            className="qf-input"
            disabled={!canAuthor}
            value={title}
            onChange={(e) => {
              const val = e.target.value;
              setTitle(val);
              onUpdateScene(scene.id, buildScenePatch({ title: val }), false);
            }}
            onBlur={() => {
              if (canAuthor) {
                onUpdateScene(scene.id, buildScenePatch(), true);
              }
            }}
          />
        </div>

        <div className="qf-field-group">
          <label className="qf-label" htmlFor={endingId}>
            {t(locale, 'builder.scene.ending')}
          </label>
          <select
            id={endingId}
            name="sceneEnding"
            className="qf-select"
            disabled={!canAuthor}
            value={ending}
            onChange={(e) => {
              const val = e.target.value as EndingType;
              setEnding(val);
              onUpdateScene(scene.id, buildScenePatch({ ending: val }), true);
            }}
          >
            <option value="none">{t(locale, 'builder.scene.ending.none')}</option>
            <option value="win">{t(locale, 'builder.scene.ending.win')}</option>
            <option value="lose">{t(locale, 'builder.scene.ending.lose')}</option>
          </select>
        </div>

        <div className="qf-field-group">
          <label className="qf-label" htmlFor={bodyId}>
            {t(locale, 'builder.scene.body')}
          </label>
          <textarea
            id={bodyId}
            name="sceneBody"
            rows={7}
            className="qf-textarea"
            disabled={!canAuthor}
            value={body}
            onChange={(e) => {
              const val = e.target.value;
              setBody(val);
              onUpdateScene(scene.id, buildScenePatch({ body: val }), false);
            }}
            onBlur={() => {
              if (canAuthor) {
                onUpdateScene(scene.id, buildScenePatch(), true);
              }
            }}
          />
        </div>

        <div className="qf-field-group">
          <label className="qf-label" htmlFor={imageId}>
            {t(locale, 'builder.scene.imageUrl')}
          </label>
          <input
            id={imageId}
            name="imageUrl"
            type="text"
            className="qf-input"
            disabled={!canAuthor}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={touchedUrl.image && !imageValid ? 'true' : undefined}
            aria-describedby={touchedUrl.image && !imageValid ? imageErrId : undefined}
            value={imageUrl}
            onChange={(e) => {
              const val = e.target.value;
              setImageUrl(val);
              if (val.trim() === '' || sanitizeUrl(val.trim()) !== null) {
                onUpdateScene(scene.id, buildScenePatch({ imageUrl: val }), false);
              }
            }}
            onBlur={() => {
              setTouchedUrl((prev) => ({ ...prev, image: true }));
              if (canAuthor && imageValid) {
                onUpdateScene(scene.id, buildScenePatch(), true);
              }
            }}
          />
          {touchedUrl.image && !imageValid && (
            <p id={imageErrId} className="qf-field-error">
              {t(locale, 'builder.scene.invalidUrl')}
            </p>
          )}
        </div>

        <div className="qf-field-group">
          <label className="qf-label" htmlFor={audioId}>
            {t(locale, 'builder.scene.audioUrl')}
          </label>
          <input
            id={audioId}
            name="audioUrl"
            type="text"
            className="qf-input"
            disabled={!canAuthor}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={touchedUrl.audio && !audioValid ? 'true' : undefined}
            aria-describedby={touchedUrl.audio && !audioValid ? audioErrId : undefined}
            value={audioUrl}
            onChange={(e) => {
              const val = e.target.value;
              setAudioUrl(val);
              if (val.trim() === '' || sanitizeUrl(val.trim()) !== null) {
                onUpdateScene(scene.id, buildScenePatch({ audioUrl: val }), false);
              }
            }}
            onBlur={() => {
              setTouchedUrl((prev) => ({ ...prev, audio: true }));
              if (canAuthor && audioValid) {
                onUpdateScene(scene.id, buildScenePatch(), true);
              }
            }}
          />
          {touchedUrl.audio && !audioValid && (
            <p id={audioErrId} className="qf-field-error">
              {t(locale, 'builder.scene.invalidUrl')}
            </p>
          )}
        </div>

        <fieldset className="qf-logic-fieldset">
          <legend className="qf-logic-legend">{t(locale, 'builder.scene.position')}</legend>
          <div className="qf-pos-controls">
            <span className="qf-badge qf-mono">
              ({Math.round(scene.posX)}, {Math.round(scene.posY)})
            </span>
            <div className="qf-controls-row">
              <button
                type="button"
                className="qf-btn qf-btn-xs"
                disabled={!canAuthor}
                aria-label={t(locale, 'builder.scene.moveLeft')}
                onClick={() => {
                  onMoveScene(scene.id, scene.posX - 40, scene.posY, true);
                }}
              >
                ←
              </button>
              <button
                type="button"
                className="qf-btn qf-btn-xs"
                disabled={!canAuthor}
                aria-label={t(locale, 'builder.scene.moveUp')}
                onClick={() => {
                  onMoveScene(scene.id, scene.posX, scene.posY - 40, true);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="qf-btn qf-btn-xs"
                disabled={!canAuthor}
                aria-label={t(locale, 'builder.scene.moveDown')}
                onClick={() => {
                  onMoveScene(scene.id, scene.posX, scene.posY + 40, true);
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className="qf-btn qf-btn-xs"
                disabled={!canAuthor}
                aria-label={t(locale, 'builder.scene.moveRight')}
                onClick={() => {
                  onMoveScene(scene.id, scene.posX + 40, scene.posY, true);
                }}
              >
                →
              </button>
            </div>
          </div>
        </fieldset>

        {canAuthor && (
          <button type="submit" className="qf-btn qf-btn-primary qf-btn-sm">
            {t(locale, 'builder.scene.save')}
          </button>
        )}
      </form>

      <div className="qf-choices-section">
        <div className="qf-builder-panel-header">
          <h3 className="qf-builder-panel-title">
            {t(locale, 'builder.scene.choicesTitle', { count: scene.choices.length })}
          </h3>
          <button
            type="button"
            className="qf-btn qf-btn-primary qf-btn-sm"
            disabled={!canAuthor}
            onClick={() => {
              onAddChoice(scene.id);
            }}
          >
            + {t(locale, 'builder.scene.addChoice')}
          </button>
        </div>

        {scene.choices.length === 0 ? (
          <p className="qf-muted-text">{t(locale, 'builder.scene.noChoices')}</p>
        ) : (
          <div className="qf-choices-editor-list">
            {[...scene.choices]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((choice, idx, sorted) => (
                <ChoiceEditorCard
                  key={choice.id}
                  choice={choice}
                  index={idx}
                  total={sorted.length}
                  scenes={quest.scenes}
                  knownItems={knownItems}
                  knownVariables={knownVariables}
                  canAuthor={canAuthor}
                  onCreateTargetScene={() => {
                    onCreateTargetSceneForChoice(scene.id, choice.id);
                  }}
                  onMove={(delta) => {
                    const next = [...sorted];
                    const swapIndex = idx + delta;
                    const curr = next[idx];
                    const other = next[swapIndex];
                    if (!curr || !other) return;
                    next[idx] = other;
                    next[swapIndex] = curr;
                    onReorderChoices(
                      scene.id,
                      next.map((c) => c.id),
                    );
                  }}
                  onDelete={() => {
                    onDeleteChoice(scene.id, choice.id);
                  }}
                  onCommit={(patch, immediate) => {
                    onUpdateChoice(scene.id, choice.id, patch, immediate);
                  }}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

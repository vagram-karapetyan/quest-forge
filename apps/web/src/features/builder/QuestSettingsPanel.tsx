import { t, type Quest, type VariableValue } from '@quest-forge/engine';
import { useEffect, useId, useState } from 'react';
import { api } from '../../api/client.js';
import { useAppPreferences } from '../../state/preferences.js';

type QuestSettingsPanelProps = {
  quest: Quest;
  canAuthor: boolean;
  onUpdateQuest: (
    patch: {
      title?: string;
      description?: string;
      startSceneId?: string | null;
      initialVariables?: Record<string, VariableValue>;
    },
    immediate?: boolean,
  ) => void;
};

type VarKind = 'number' | 'boolean' | 'string';

function valueKind(val: VariableValue): VarKind {
  if (typeof val === 'number') return 'number';
  if (typeof val === 'boolean') return 'boolean';
  return 'string';
}

export function QuestSettingsPanel({ quest, canAuthor, onUpdateQuest }: QuestSettingsPanelProps) {
  const { locale, theme } = useAppPreferences();
  const titleId = useId();
  const descId = useId();
  const startId = useId();
  const newVarKeyId = useId();

  const [title, setTitle] = useState(quest.title);
  const [description, setDescription] = useState(quest.description);
  const [newVarName, setNewVarName] = useState('');
  const [newVarKind, setNewVarKind] = useState<VarKind>('number');
  const [varError, setVarError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(quest.title);
    setDescription(quest.description);
  }, [quest.id]);

  function handleAddVariable(): void {
    const cleanKey = newVarName.trim();
    if (!cleanKey) {
      return;
    }
    if (Object.hasOwn(quest.initialVariables, cleanKey)) {
      setVarError(t(locale, 'builder.quest.varExistsError'));
      return;
    }
    setVarError(null);
    const defaultVal: VariableValue =
      newVarKind === 'number' ? 0 : newVarKind === 'boolean' ? false : '';
    onUpdateQuest(
      {
        initialVariables: {
          ...quest.initialVariables,
          [cleanKey]: defaultVal,
        },
      },
      true,
    );
    setNewVarName('');
  }

  function updateVarValue(key: string, nextVal: VariableValue): void {
    onUpdateQuest(
      {
        initialVariables: {
          ...quest.initialVariables,
          [key]: nextVal,
        },
      },
      false,
    );
  }

  function removeVar(key: string): void {
    const next = Object.fromEntries(
      Object.entries(quest.initialVariables).filter(([k]) => k !== key),
    );
    onUpdateQuest({ initialVariables: next }, true);
  }

  const varEntries = Object.entries(quest.initialVariables);

  return (
    <div className="qf-inspector-stack">
      <form
        className="qf-inspector-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canAuthor || !title.trim()) return;
          onUpdateQuest({ title: title.trim(), description }, true);
        }}
      >
        <div className="qf-field-group">
          <label className="qf-label" htmlFor={titleId}>
            {t(locale, 'builder.quest.title')}
          </label>
          <input
            id={titleId}
            type="text"
            className="qf-input"
            required
            disabled={!canAuthor}
            value={title}
            onChange={(e) => {
              const val = e.target.value;
              setTitle(val);
              if (val.trim()) {
                onUpdateQuest({ title: val.trim() }, false);
              }
            }}
            onBlur={() => {
              if (canAuthor && title.trim()) {
                onUpdateQuest({ title: title.trim(), description }, true);
              }
            }}
          />
        </div>

        <div className="qf-field-group">
          <label className="qf-label" htmlFor={descId}>
            {t(locale, 'builder.quest.description')}
          </label>
          <textarea
            id={descId}
            rows={4}
            className="qf-textarea"
            disabled={!canAuthor}
            value={description}
            onChange={(e) => {
              const val = e.target.value;
              setDescription(val);
              onUpdateQuest({ description: val }, false);
            }}
            onBlur={() => {
              if (canAuthor) {
                onUpdateQuest({ description }, true);
              }
            }}
          />
        </div>

        <div className="qf-field-group">
          <label className="qf-label" htmlFor={startId}>
            {t(locale, 'builder.quest.startScene')}
          </label>
          <select
            id={startId}
            className="qf-select"
            disabled={!canAuthor}
            value={quest.startSceneId ?? ''}
            onChange={(e) => {
              onUpdateQuest({ startSceneId: e.target.value || null }, true);
            }}
          >
            <option value="">{t(locale, 'builder.quest.noStartOption')}</option>
            {quest.scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || s.id}
              </option>
            ))}
          </select>
        </div>

        {canAuthor && (
          <button type="submit" className="qf-btn qf-btn-primary qf-btn-sm">
            {t(locale, 'builder.quest.save')}
          </button>
        )}
      </form>

      <fieldset className="qf-logic-fieldset">
        <legend className="qf-logic-legend">{t(locale, 'builder.quest.variablesTitle')}</legend>

        {varEntries.length === 0 ? (
          <p className="qf-muted-text">{t(locale, 'player.variablesEmpty')}</p>
        ) : (
          <div className="qf-vars-editor-list">
            {varEntries.map(([key, val]) => {
              const kind = valueKind(val);
              const valId = `${quest.id}-var-${key}`;
              return (
                <div key={key} className="qf-logic-row">
                  <span className="qf-badge qf-mono">{key}</span>

                  <select
                    aria-label={`${key} ${t(locale, 'builder.choice.varType')}`}
                    className="qf-select"
                    disabled={!canAuthor}
                    value={kind}
                    onChange={(e) => {
                      const nextKind = e.target.value as VarKind;
                      const nextVal: VariableValue =
                        nextKind === 'number' ? 0 : nextKind === 'boolean' ? false : '';
                      updateVarValue(key, nextVal);
                    }}
                  >
                    <option value="number">{t(locale, 'builder.quest.type.number')}</option>
                    <option value="boolean">{t(locale, 'builder.quest.type.boolean')}</option>
                    <option value="string">{t(locale, 'builder.quest.type.string')}</option>
                  </select>

                  {kind === 'boolean' ? (
                    <select
                      id={valId}
                      aria-label={key}
                      className="qf-select"
                      disabled={!canAuthor}
                      value={val ? 'true' : 'false'}
                      onChange={(e) => {
                        updateVarValue(key, e.target.value === 'true');
                      }}
                    >
                      <option value="true">{locale === 'ru' ? 'да (true)' : 'yes (true)'}</option>
                      <option value="false">
                        {locale === 'ru' ? 'нет (false)' : 'no (false)'}
                      </option>
                    </select>
                  ) : kind === 'number' ? (
                    <input
                      id={valId}
                      aria-label={key}
                      type="number"
                      step="any"
                      className="qf-input qf-mono"
                      disabled={!canAuthor}
                      value={Number.isFinite(Number(val)) ? Number(val) : 0}
                      onChange={(e) => {
                        const num = Number(e.target.value);
                        updateVarValue(key, Number.isFinite(num) ? num : 0);
                      }}
                    />
                  ) : (
                    <input
                      id={valId}
                      aria-label={key}
                      type="text"
                      className="qf-input"
                      disabled={!canAuthor}
                      value={String(val)}
                      onChange={(e) => {
                        updateVarValue(key, e.target.value);
                      }}
                    />
                  )}

                  <button
                    type="button"
                    className="qf-btn qf-btn-xs qf-btn-danger"
                    disabled={!canAuthor}
                    aria-label={`${t(locale, 'builder.choice.removeRule')}: ${key}`}
                    onClick={() => {
                      removeVar(key);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="qf-add-var-row">
          <label htmlFor={newVarKeyId} className="visually-hidden">
            {t(locale, 'builder.choice.varKey')}
          </label>
          <input
            id={newVarKeyId}
            type="text"
            className="qf-input qf-mono"
            placeholder={t(locale, 'builder.quest.varNamePlaceholder')}
            disabled={!canAuthor}
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={newVarName}
            onChange={(e) => {
              setNewVarName(e.target.value);
              setVarError(null);
            }}
          />
          <select
            aria-label={t(locale, 'builder.choice.varType')}
            className="qf-select"
            disabled={!canAuthor}
            value={newVarKind}
            onChange={(e) => {
              setNewVarKind(e.target.value as VarKind);
            }}
          >
            <option value="number">{t(locale, 'builder.quest.type.number')}</option>
            <option value="boolean">{t(locale, 'builder.quest.type.boolean')}</option>
            <option value="string">{t(locale, 'builder.quest.type.string')}</option>
          </select>
          <button
            type="button"
            className="qf-btn qf-btn-sm"
            disabled={!canAuthor || !newVarName.trim()}
            onClick={handleAddVariable}
          >
            + {t(locale, 'builder.quest.addVariable')}
          </button>
        </div>
        {varError && (
          <p className="qf-field-error" role="alert">
            {varError}
          </p>
        )}
      </fieldset>

      <fieldset className="qf-logic-fieldset">
        <legend className="qf-logic-legend">{t(locale, 'builder.quest.exportTitle')}</legend>
        <div className="qf-controls-row">
          <a
            className="qf-btn qf-btn-sm"
            href={api.exportHtmlUrl(quest.id, locale, theme)}
            download
          >
            {t(locale, 'catalog.exportHtml')}
          </a>
          <a className="qf-btn qf-btn-sm" href={api.exportJsonUrl(quest.id)} download>
            {t(locale, 'catalog.exportJson')}
          </a>
        </div>
      </fieldset>
    </div>
  );
}

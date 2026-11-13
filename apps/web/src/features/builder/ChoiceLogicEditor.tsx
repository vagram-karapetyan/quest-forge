import {
  ConditionOpSchema,
  t,
  type Condition,
  type ConditionOp,
  type Effect,
  type VariableValue,
} from '@quest-forge/engine';
import { useId } from 'react';
import { useAppPreferences } from '../../state/preferences.js';

type ChoiceLogicEditorProps = {
  choiceId: string;
  conditions: Condition[];
  effects: Effect[];
  knownItems: string[];
  knownVariables: string[];
  disabled: boolean;
  onChangeConditions: (next: Condition[]) => void;
  onChangeEffects: (next: Effect[]) => void;
};

type ValueKind = 'number' | 'boolean' | 'string';

function detectValueKind(val: VariableValue): ValueKind {
  if (typeof val === 'number') return 'number';
  if (typeof val === 'boolean') return 'boolean';
  return 'string';
}

function defaultForKind(kind: ValueKind): VariableValue {
  if (kind === 'number') return 1;
  if (kind === 'boolean') return true;
  return '';
}

export function ChoiceLogicEditor({
  choiceId,
  conditions,
  effects,
  knownItems,
  knownVariables,
  disabled,
  onChangeConditions,
  onChangeEffects,
}: ChoiceLogicEditorProps) {
  const { locale } = useAppPreferences();
  const itemListId = useId();
  const varListId = useId();

  function updateCondition(index: number, nextCond: Condition): void {
    onChangeConditions(conditions.map((c, idx) => (idx === index ? nextCond : c)));
  }

  function removeCondition(index: number): void {
    onChangeConditions(conditions.filter((_, idx) => idx !== index));
  }

  function updateEffect(index: number, nextEffect: Effect): void {
    onChangeEffects(effects.map((eff, idx) => (idx === index ? nextEffect : eff)));
  }

  function removeEffect(index: number): void {
    onChangeEffects(effects.filter((_, idx) => idx !== index));
  }

  return (
    <div className="qf-logic-editor">
      <datalist id={itemListId}>
        {knownItems.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <datalist id={varListId}>
        {knownVariables.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      <fieldset className="qf-logic-fieldset">
        <legend className="qf-logic-legend">
          {t(locale, 'builder.choice.conditions', { count: conditions.length })}
        </legend>

        {conditions.map((cond, idx) => {
          const baseId = `${choiceId}-cond-${idx}`;
          if (cond.type === 'has_item') {
            return (
              <div key={baseId} className="qf-logic-row">
                <div className="qf-logic-field">
                  <label className="qf-label" htmlFor={`${baseId}-mode`}>
                    {t(locale, 'builder.choice.varType')}
                  </label>
                  <select
                    id={`${baseId}-mode`}
                    className="qf-select"
                    disabled={disabled}
                    value={cond.has ? 'has' : 'not_has'}
                    onChange={(e) => {
                      updateCondition(idx, {
                        ...cond,
                        has: e.target.value === 'has',
                      });
                    }}
                  >
                    <option value="has">{t(locale, 'builder.choice.itemRequired')}</option>
                    <option value="not_has">{t(locale, 'builder.choice.itemForbidden')}</option>
                  </select>
                </div>

                <div className="qf-logic-field qf-logic-grow">
                  <label className="qf-label" htmlFor={`${baseId}-item`}>
                    {t(locale, 'builder.choice.itemName')}
                  </label>
                  <input
                    id={`${baseId}-item`}
                    type="text"
                    className="qf-input"
                    list={itemListId}
                    disabled={disabled}
                    required
                    aria-invalid={cond.item.trim().length === 0 ? 'true' : undefined}
                    value={cond.item}
                    onChange={(e) => {
                      updateCondition(idx, { ...cond, item: e.target.value });
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="qf-btn qf-btn-xs qf-btn-danger"
                  disabled={disabled}
                  aria-label={t(locale, 'builder.choice.removeRule')}
                  onClick={() => {
                    removeCondition(idx);
                  }}
                >
                  ×
                </button>
              </div>
            );
          }

          const valKind = detectValueKind(cond.value);
          return (
            <div key={baseId} className="qf-logic-row">
              <div className="qf-logic-field qf-logic-grow">
                <label className="qf-label" htmlFor={`${baseId}-key`}>
                  {t(locale, 'builder.choice.varKey')}
                </label>
                <input
                  id={`${baseId}-key`}
                  type="text"
                  className="qf-input qf-mono"
                  list={varListId}
                  disabled={disabled}
                  required
                  aria-invalid={cond.key.trim().length === 0 ? 'true' : undefined}
                  value={cond.key}
                  onChange={(e) => {
                    updateCondition(idx, { ...cond, key: e.target.value });
                  }}
                />
              </div>

              <div className="qf-logic-field">
                <label className="qf-label" htmlFor={`${baseId}-op`}>
                  {t(locale, 'builder.choice.varOp')}
                </label>
                <select
                  id={`${baseId}-op`}
                  className="qf-select qf-mono"
                  disabled={disabled}
                  value={cond.op}
                  onChange={(e) => {
                    updateCondition(idx, { ...cond, op: e.target.value as ConditionOp });
                  }}
                >
                  {ConditionOpSchema.options.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>

              <div className="qf-logic-field">
                <label className="qf-label" htmlFor={`${baseId}-vtype`}>
                  {t(locale, 'builder.choice.varType')}
                </label>
                <select
                  id={`${baseId}-vtype`}
                  className="qf-select"
                  disabled={disabled}
                  value={valKind}
                  onChange={(e) => {
                    updateCondition(idx, {
                      ...cond,
                      value: defaultForKind(e.target.value as ValueKind),
                    });
                  }}
                >
                  <option value="number">{t(locale, 'builder.quest.type.number')}</option>
                  <option value="boolean">{t(locale, 'builder.quest.type.boolean')}</option>
                  <option value="string">{t(locale, 'builder.quest.type.string')}</option>
                </select>
              </div>

              <div className="qf-logic-field">
                <label className="qf-label" htmlFor={`${baseId}-val`}>
                  {t(locale, 'builder.choice.varValue')}
                </label>
                {valKind === 'boolean' ? (
                  <select
                    id={`${baseId}-val`}
                    className="qf-select"
                    disabled={disabled}
                    value={cond.value ? 'true' : 'false'}
                    onChange={(e) => {
                      updateCondition(idx, { ...cond, value: e.target.value === 'true' });
                    }}
                  >
                    <option value="true">{locale === 'ru' ? 'да (true)' : 'yes (true)'}</option>
                    <option value="false">{locale === 'ru' ? 'нет (false)' : 'no (false)'}</option>
                  </select>
                ) : valKind === 'number' ? (
                  <input
                    id={`${baseId}-val`}
                    type="number"
                    step="any"
                    className="qf-input qf-mono"
                    disabled={disabled}
                    value={Number.isFinite(Number(cond.value)) ? Number(cond.value) : 0}
                    onChange={(e) => {
                      const num = Number(e.target.value);
                      updateCondition(idx, {
                        ...cond,
                        value: Number.isFinite(num) ? num : 0,
                      });
                    }}
                  />
                ) : (
                  <input
                    id={`${baseId}-val`}
                    type="text"
                    className="qf-input"
                    disabled={disabled}
                    value={String(cond.value)}
                    onChange={(e) => {
                      updateCondition(idx, { ...cond, value: e.target.value });
                    }}
                  />
                )}
              </div>

              <button
                type="button"
                className="qf-btn qf-btn-xs qf-btn-danger"
                disabled={disabled}
                aria-label={t(locale, 'builder.choice.removeRule')}
                onClick={() => {
                  removeCondition(idx);
                }}
              >
                ×
              </button>
            </div>
          );
        })}

        <div className="qf-controls-row">
          <button
            type="button"
            className="qf-btn qf-btn-xs"
            disabled={disabled}
            onClick={() => {
              onChangeConditions([
                ...conditions,
                {
                  type: 'has_item',
                  item: knownItems[0] ?? 'Key',
                  has: true,
                },
              ]);
            }}
          >
            {t(locale, 'builder.choice.addItemCondition')}
          </button>
          <button
            type="button"
            className="qf-btn qf-btn-xs"
            disabled={disabled}
            onClick={() => {
              onChangeConditions([
                ...conditions,
                {
                  type: 'var',
                  key: knownVariables[0] ?? 'score',
                  op: '>=',
                  value: 1,
                },
              ]);
            }}
          >
            {t(locale, 'builder.choice.addVarCondition')}
          </button>
        </div>
      </fieldset>

      <fieldset className="qf-logic-fieldset">
        <legend className="qf-logic-legend">
          {t(locale, 'builder.choice.effects', { count: effects.length })}
        </legend>

        {effects.map((eff, idx) => {
          const baseId = `${choiceId}-eff-${idx}`;
          const isItemEffect = eff.type === 'give_item' || eff.type === 'take_item';

          return (
            <div key={baseId} className="qf-logic-row">
              <div className="qf-logic-field">
                <label className="qf-label" htmlFor={`${baseId}-kind`}>
                  {t(locale, 'builder.choice.varType')}
                </label>
                <select
                  id={`${baseId}-kind`}
                  className="qf-select"
                  disabled={disabled}
                  value={eff.type}
                  onChange={(e) => {
                    const nextType = e.target.value as Effect['type'];
                    if (nextType === 'give_item' || nextType === 'take_item') {
                      updateEffect(idx, {
                        type: nextType,
                        item: isItemEffect ? eff.item : (knownItems[0] ?? 'Key'),
                      });
                    } else if (nextType === 'add_var') {
                      updateEffect(idx, {
                        type: 'add_var',
                        key: !isItemEffect ? eff.key : (knownVariables[0] ?? 'score'),
                        delta: 1,
                      });
                    } else {
                      updateEffect(idx, {
                        type: 'set_var',
                        key: !isItemEffect ? eff.key : (knownVariables[0] ?? 'flag'),
                        value: true,
                      });
                    }
                  }}
                >
                  <option value="give_item">{t(locale, 'builder.choice.giveItem')}</option>
                  <option value="take_item">{t(locale, 'builder.choice.takeItem')}</option>
                  <option value="set_var">{t(locale, 'builder.choice.setVar')}</option>
                  <option value="add_var">{t(locale, 'builder.choice.addVar')}</option>
                </select>
              </div>

              {isItemEffect ? (
                <div className="qf-logic-field qf-logic-grow">
                  <label className="qf-label" htmlFor={`${baseId}-item`}>
                    {t(locale, 'builder.choice.itemName')}
                  </label>
                  <input
                    id={`${baseId}-item`}
                    type="text"
                    className="qf-input"
                    list={itemListId}
                    disabled={disabled}
                    required
                    aria-invalid={eff.item.trim().length === 0 ? 'true' : undefined}
                    value={eff.item}
                    onChange={(e) => {
                      updateEffect(idx, { ...eff, item: e.target.value });
                    }}
                  />
                </div>
              ) : eff.type === 'add_var' ? (
                <>
                  <div className="qf-logic-field qf-logic-grow">
                    <label className="qf-label" htmlFor={`${baseId}-key`}>
                      {t(locale, 'builder.choice.varKey')}
                    </label>
                    <input
                      id={`${baseId}-key`}
                      type="text"
                      className="qf-input qf-mono"
                      list={varListId}
                      disabled={disabled}
                      required
                      aria-invalid={eff.key.trim().length === 0 ? 'true' : undefined}
                      value={eff.key}
                      onChange={(e) => {
                        updateEffect(idx, { ...eff, key: e.target.value });
                      }}
                    />
                  </div>
                  <div className="qf-logic-field">
                    <label className="qf-label" htmlFor={`${baseId}-delta`}>
                      {t(locale, 'builder.choice.varDelta')}
                    </label>
                    <input
                      id={`${baseId}-delta`}
                      type="number"
                      step="any"
                      className="qf-input qf-mono"
                      disabled={disabled}
                      value={Number.isFinite(eff.delta) ? eff.delta : 0}
                      onChange={(e) => {
                        const num = Number(e.target.value);
                        updateEffect(idx, {
                          ...eff,
                          delta: Number.isFinite(num) ? num : 0,
                        });
                      }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="qf-logic-field qf-logic-grow">
                    <label className="qf-label" htmlFor={`${baseId}-key`}>
                      {t(locale, 'builder.choice.varKey')}
                    </label>
                    <input
                      id={`${baseId}-key`}
                      type="text"
                      className="qf-input qf-mono"
                      list={varListId}
                      disabled={disabled}
                      required
                      aria-invalid={eff.key.trim().length === 0 ? 'true' : undefined}
                      value={eff.key}
                      onChange={(e) => {
                        updateEffect(idx, { ...eff, key: e.target.value });
                      }}
                    />
                  </div>
                  <div className="qf-logic-field">
                    <label className="qf-label" htmlFor={`${baseId}-vtype`}>
                      {t(locale, 'builder.choice.varType')}
                    </label>
                    <select
                      id={`${baseId}-vtype`}
                      className="qf-select"
                      disabled={disabled}
                      value={detectValueKind(eff.value)}
                      onChange={(e) => {
                        updateEffect(idx, {
                          ...eff,
                          value: defaultForKind(e.target.value as ValueKind),
                        });
                      }}
                    >
                      <option value="number">{t(locale, 'builder.quest.type.number')}</option>
                      <option value="boolean">{t(locale, 'builder.quest.type.boolean')}</option>
                      <option value="string">{t(locale, 'builder.quest.type.string')}</option>
                    </select>
                  </div>
                  <div className="qf-logic-field">
                    <label className="qf-label" htmlFor={`${baseId}-val`}>
                      {t(locale, 'builder.choice.varValue')}
                    </label>
                    {detectValueKind(eff.value) === 'boolean' ? (
                      <select
                        id={`${baseId}-val`}
                        className="qf-select"
                        disabled={disabled}
                        value={eff.value ? 'true' : 'false'}
                        onChange={(e) => {
                          updateEffect(idx, { ...eff, value: e.target.value === 'true' });
                        }}
                      >
                        <option value="true">{locale === 'ru' ? 'да (true)' : 'yes (true)'}</option>
                        <option value="false">
                          {locale === 'ru' ? 'нет (false)' : 'no (false)'}
                        </option>
                      </select>
                    ) : detectValueKind(eff.value) === 'number' ? (
                      <input
                        id={`${baseId}-val`}
                        type="number"
                        step="any"
                        className="qf-input qf-mono"
                        disabled={disabled}
                        value={Number.isFinite(Number(eff.value)) ? Number(eff.value) : 0}
                        onChange={(e) => {
                          const num = Number(e.target.value);
                          updateEffect(idx, {
                            ...eff,
                            value: Number.isFinite(num) ? num : 0,
                          });
                        }}
                      />
                    ) : (
                      <input
                        id={`${baseId}-val`}
                        type="text"
                        className="qf-input"
                        disabled={disabled}
                        value={String(eff.value)}
                        onChange={(e) => {
                          updateEffect(idx, { ...eff, value: e.target.value });
                        }}
                      />
                    )}
                  </div>
                </>
              )}

              <button
                type="button"
                className="qf-btn qf-btn-xs qf-btn-danger"
                disabled={disabled}
                aria-label={t(locale, 'builder.choice.removeRule')}
                onClick={() => {
                  removeEffect(idx);
                }}
              >
                ×
              </button>
            </div>
          );
        })}

        <div className="qf-controls-row">
          <button
            type="button"
            className="qf-btn qf-btn-xs"
            disabled={disabled}
            onClick={() => {
              onChangeEffects([
                ...effects,
                {
                  type: 'give_item',
                  item: knownItems[0] ?? 'Key',
                },
              ]);
            }}
          >
            {t(locale, 'builder.choice.addItemEffect')}
          </button>
          <button
            type="button"
            className="qf-btn qf-btn-xs"
            disabled={disabled}
            onClick={() => {
              onChangeEffects([
                ...effects,
                {
                  type: 'set_var',
                  key: knownVariables[0] ?? 'score',
                  value: true,
                },
              ]);
            }}
          >
            {t(locale, 'builder.choice.addVarEffect')}
          </button>
        </div>
      </fieldset>
    </div>
  );
}

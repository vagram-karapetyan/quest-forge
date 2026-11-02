import { api, h, idFromPath, initTheme, plural, t, toast, translateServerText } from './api.js';

const questId = idFromPath();

const els = {
  headerTitle: document.getElementById('header-title'),
  saveStatus: document.getElementById('save-status'),
  duplicateQuest: document.getElementById('duplicate-quest'),
  playLink: document.getElementById('play-link'),
  exportHtml: document.getElementById('export-html'),
  exportJson: document.getElementById('export-json'),
  deleteQuest: document.getElementById('delete-quest'),
  tabEditor: document.getElementById('tab-editor'),
  tabCanvas: document.getElementById('tab-canvas'),
  builderSide: document.getElementById('builder-side'),
  questTitle: document.getElementById('quest-title'),
  questDesc: document.getElementById('quest-desc'),
  questVars: document.getElementById('quest-vars'),
  startScene: document.getElementById('start-scene'),
  sceneCount: document.getElementById('scene-count'),
  sceneList: document.getElementById('scene-list'),
  addScene: document.getElementById('add-scene'),
  reportSummary: document.getElementById('report-summary'),
  reportList: document.getElementById('report-list'),
  editorView: document.getElementById('editor-view'),
  canvasView: document.getElementById('canvas-view'),
  canvasViewport: document.getElementById('canvas-viewport'),
  canvasLinks: document.getElementById('canvas-links'),
  canvasNodes: document.getElementById('canvas-nodes'),
  zoomIn: document.getElementById('zoom-in'),
  zoomOut: document.getElementById('zoom-out'),
  zoomReset: document.getElementById('zoom-reset'),
  fitCanvas: document.getElementById('fit-canvas'),
  autoLayout: document.getElementById('auto-layout'),
  canvasAddScene: document.getElementById('canvas-add-scene'),
  datalist: document.getElementById('items-datalist'),
  builder: document.getElementById('builder'),
};

const state = {
  quest: null,
  scenes: [],
  currentId: null,
  report: null,
  viewMode: 'editor', // 'editor' | 'canvas'
};

// Canvas State
const canvasState = {
  zoom: 1.0,
  panX: 40,
  panY: 40,
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  draggingId: null,
  dragStartX: 0,
  dragStartY: 0,
  nodeStartX: 0,
  nodeStartY: 0,
  fittedOnce: false,
};

const sceneById = (id) => state.scenes.find((s) => s.id === id);
const sceneLabel = (s) => (s.title || '').trim() || t('bld_scene_fallback', s.id);
const endingMark = (s) => (s.ending === 'win' ? ' 🏆' : s.ending === 'lose' ? ' 💀' : '');

function isPlainObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

// ================= Auto-Save =================

const pending = new Map();
const inflightPromises = new Set();
let lastFailed = false;

function updateSaveStatus() {
  const el = els.saveStatus;
  if (!el) return;
  if (pending.size || inflightPromises.size) {
    el.textContent = t('bld_save_saving');
    el.className = 'save-status saving';
  } else if (lastFailed) {
    el.textContent = t('bld_save_error');
    el.className = 'save-status error';
  } else {
    el.textContent = t('bld_save_saved');
    el.className = 'save-status saved';
  }
}

function schedule(key, run, delay = 500) {
  const prev = pending.get(key);
  if (prev) clearTimeout(prev.timer);
  pending.set(key, { run, timer: setTimeout(() => execute(key), delay) });
  updateSaveStatus();
}

function execute(key) {
  const entry = pending.get(key);
  if (!entry) return Promise.resolve();
  clearTimeout(entry.timer);
  pending.delete(key);

  const p = (async () => {
    try {
      await entry.run();
      lastFailed = false;
    } catch (e) {
      lastFailed = true;
      toast(t('bld_save_failed_toast', e.message), 'error');
    } finally {
      inflightPromises.delete(p);
      updateSaveStatus();
      scheduleValidate();
    }
  })();

  inflightPromises.add(p);
  updateSaveStatus();
  return p;
}

async function flushPending() {
  const keys = [...pending.keys()];
  for (const key of keys) {
    execute(key);
  }
  if (inflightPromises.size) {
    await Promise.allSettled([...inflightPromises]);
  }
}

function cancelPending(predicate) {
  for (const [key, entry] of pending) {
    if (predicate(key)) {
      clearTimeout(entry.timer);
      pending.delete(key);
    }
  }
  updateSaveStatus();
}

window.addEventListener('beforeunload', (event) => {
  if (pending.size || inflightPromises.size) {
    event.preventDefault();
    event.returnValue = '';
  }
});

const patchQuest = (body) => api(`/api/quests/${questId}`, { method: 'PATCH', body });
const patchScene = (id, body) => api(`/api/scenes/${id}`, { method: 'PATCH', body });
const patchChoice = (id, body) => api(`/api/choices/${id}`, { method: 'PATCH', body });

// ================= Quest Validation =================

let validateTimer = null;
function scheduleValidate(delay = 700) {
  clearTimeout(validateTimer);
  validateTimer = setTimeout(validate, delay);
}

async function validate() {
  if (pending.size || inflightPromises.size) {
    scheduleValidate();
    return;
  }
  try {
    state.report = await api(`/api/quests/${questId}/validate`);
  } catch {
    return;
  }
  renderReport();
  renderSceneList();
  if (state.viewMode === 'canvas') renderCanvas();
}

function renderReport() {
  const r = state.report;
  if (!r) return;
  const errors = r.issues.filter((i) => i.level === 'error').length;
  const warnings = r.issues.filter((i) => i.level === 'warning').length;
  if (r.ok) {
    els.reportSummary.textContent = warnings
      ? t('bld_report_ok_warn', warnings, plural(warnings, ['замечание', 'замечания', 'замечаний'], ['warning', 'warnings']))
      : t('bld_report_ok_clean');
    els.reportSummary.className = 'report-summary ok';
  } else {
    els.reportSummary.textContent = t('bld_report_errors', errors, plural(errors, ['ошибка', 'ошибки', 'ошибок'], ['error', 'errors']));
    els.reportSummary.className = 'report-summary bad';
  }
  const icons = { error: '⛔', warning: '⚠️', info: 'ℹ️' };
  els.reportList.replaceChildren(...r.issues.map((issue) => h('li', {
    class: `report-item ${issue.level}${issue.scene_id ? ' clickable' : ''}`,
    title: issue.scene_id ? t('bld_goto_scene_title') : null,
    onclick: issue.scene_id ? () => selectScene(issue.scene_id) : null,
  }, h('span', {}, icons[issue.level]), h('span', {}, translateServerText(issue.message)))));
  renderDatalist();
}

function renderDatalist() {
  const items = new Set(state.report?.items || []);
  for (const s of state.scenes) {
    for (const c of s.choices) {
      if (c.item_given) items.add(c.item_given);
      if (c.required_item) items.add(c.required_item);
      if (c.actions?.give_item) items.add(c.actions.give_item);
      if (c.actions?.take_item) items.add(c.actions.take_item);
      for (const cond of (c.conditions || [])) {
        if (cond?.item) items.add(cond.item);
      }
    }
  }
  els.datalist.replaceChildren(...[...items].sort().map((item) => h('option', { value: item })));
}

function issuesByScene() {
  const map = new Map();
  for (const issue of state.report?.issues || []) {
    if (!issue.scene_id || issue.level === 'info') continue;
    const entry = map.get(issue.scene_id) || { count: 0, error: false };
    entry.count += 1;
    entry.error ||= issue.level === 'error';
    map.set(issue.scene_id, entry);
  }
  return map;
}

// ================= Sidebar =================

function renderQuestMeta() {
  const q = state.quest;
  if (!q) return;
  els.questTitle.value = q.title;
  els.questDesc.value = q.description;
  els.questVars.value = Object.keys(q.initial_variables || {}).length
    ? JSON.stringify(q.initial_variables)
    : '';
  els.headerTitle.textContent = q.title;
  document.title = t('bld_doc_title', q.title);
  els.playLink.href = `/play/${q.id}?new=1`;
  els.exportHtml.href = `/api/quests/${q.id}/export/html`;
  els.exportJson.href = `/api/quests/${q.id}/export/json`;
}

function renderStartSelect() {
  const q = state.quest;
  if (!q) return;
  els.startScene.replaceChildren(
    h('option', { value: '' }, t('bld_start_none')),
    ...state.scenes.map((s) => h('option', { value: String(s.id) }, `#${s.id} · ${sceneLabel(s)}`)),
  );
  els.startScene.value = q.start_scene_id ?? '';
}

function renderSceneList() {
  if (!state.quest) return;
  const issues = issuesByScene();
  els.sceneCount.textContent = `(${state.scenes.length})`;
  els.sceneList.replaceChildren(...state.scenes.map((s) => {
    const issue = issues.get(s.id);
    return h('li', {},
      h('button', {
        class: `scene-item${s.id === state.currentId ? ' active' : ''}`,
        onclick: () => selectScene(s.id),
      },
      h('span', { class: 'scene-item-id' }, `#${s.id}`),
      h('span', { class: `scene-item-name${s.title.trim() ? '' : ' placeholder'}` }, sceneLabel(s)),
      h('span', { class: 'badges' },
        s.id === state.quest.start_scene_id ? h('span', { class: 'badge badge-start', title: t('bld_badge_start_title') }, '★') : null,
        s.ending === 'win' ? h('span', { class: 'badge', title: t('bld_badge_win_title') }, '🏆') : null,
        s.ending === 'lose' ? h('span', { class: 'badge', title: t('bld_badge_lose_title') }, '💀') : null,
        issue ? h('span', {
          class: `badge badge-warn${issue.error ? ' badge-error' : ''}`,
          title: `${issue.count} ${plural(issue.count, ['замечание', 'замечания', 'замечаний'], ['issue', 'issues'])}`,
        }, '!') : null,
      )),
    );
  }));
  renderStartSelect();
}

function refreshTargetLabels() {
  for (const option of els.editorView.querySelectorAll('select.target-select option')) {
    const scene = sceneById(Number(option.value));
    if (scene) option.textContent = targetOptionLabel(scene, sceneById(state.currentId));
  }
}

// ================= Scene Editor =================

function targetOptionLabel(scene, current) {
  return `${scene.id === current?.id ? '↺ ' : ''}#${scene.id} · ${sceneLabel(scene)}${endingMark(scene)}`;
}

function targetOptions(current) {
  return [
    h('option', { value: '' }, t('bld_stay_in_scene')),
    ...state.scenes.map((s) => h('option', { value: String(s.id) }, targetOptionLabel(s, current))),
    h('option', { value: '__new' }, t('bld_create_new_scene_opt')),
  ];
}

function choiceCard(scene, choice, index) {
  const save = (field, delay = 500) => schedule(
    `choice-${field}-${choice.id}`,
    () => patchChoice(choice.id, { [field]: choice[field] }),
    delay,
  );

  const hint = h('div', { class: 'choice-hint' });
  const updateHint = () => {
    const parts = [];
    const staysInScene = choice.target_scene_id == null || choice.target_scene_id === scene.id;
    if (staysInScene) {
      parts.push(choice.item_given || (choice.actions && Object.keys(choice.actions).length)
        ? t('bld_hint_stays_reward')
        : t('bld_hint_stays_noop'));
    }
    if (choice.required_item) parts.push(t('bld_hint_req_item', choice.required_item));
    if (choice.conditions && choice.conditions.length) parts.push(t('bld_hint_conds', choice.conditions.length));
    if (choice.actions && Object.keys(choice.actions).length) parts.push(t('bld_hint_actions', Object.keys(choice.actions).length));
    hint.textContent = parts.join(' ');
    hint.hidden = !parts.length;
  };

  const jump = h('button', {
    class: 'btn btn-icon',
    title: t('bld_jump_target_title'),
    disabled: choice.target_scene_id == null,
    onclick: () => selectScene(choice.target_scene_id),
  }, '→');

  const target = h('select', {
    class: 'input target-select',
    value: choice.target_scene_id ?? '',
    onchange: async (event) => {
      const select = event.target;
      if (select.value === '__new') {
        select.disabled = true;
        try {
          const created = await createScene({
            title: choice.text.trim().slice(0, 200) || t('bld_new_scene_default'),
            pos_x: (scene.pos_x || 100) + 280,
            pos_y: (scene.pos_y || 100),
          });
          choice.target_scene_id = created.id;
          await patchChoice(choice.id, { target_scene_id: created.id });
          toast(t('bld_scene_created_toast', sceneLabel(created)), 'success');
          renderSceneList();
          renderEditor();
          scheduleValidate(0);
        } catch (e) {
          toast(e.message, 'error');
          select.value = choice.target_scene_id ?? '';
          select.disabled = false;
        }
        return;
      }
      choice.target_scene_id = select.value ? Number(select.value) : null;
      jump.disabled = choice.target_scene_id == null;
      updateHint();
      save('target_scene_id', 0);
      if (state.viewMode === 'canvas') renderCanvas();
    },
  }, targetOptions(scene));

  const itemInput = (field, placeholder) => h('input', {
    class: 'input',
    list: 'items-datalist',
    maxlength: 100,
    value: choice[field] ?? '',
    placeholder,
    oninput: (event) => {
      choice[field] = event.target.value.trim() || null;
      updateHint();
      save(field);
    },
    onchange: renderDatalist,
  });

  // Advanced conditions & actions
  const condInput = h('input', {
    class: 'input input-mono',
    placeholder: '[{"var": "gold", "op": ">=", "value": 10}]',
    value: (choice.conditions && choice.conditions.length) ? JSON.stringify(choice.conditions) : '',
    oninput: (e) => {
      try {
        const val = e.target.value.trim();
        const parsed = val ? JSON.parse(val) : [];
        if (!Array.isArray(parsed)) throw new Error('Expected JSON array');
        choice.conditions = parsed;
        e.target.classList.remove('invalid');
        updateHint();
        save('conditions');
      } catch {
        e.target.classList.add('invalid');
      }
    },
  });

  const actInput = h('input', {
    class: 'input input-mono',
    placeholder: '{"add": {"gold": -10, "hp": 5}, "set": {"visited": true}}',
    value: (choice.actions && Object.keys(choice.actions).length) ? JSON.stringify(choice.actions) : '',
    oninput: (e) => {
      try {
        const val = e.target.value.trim();
        const parsed = val ? JSON.parse(val) : {};
        if (!isPlainObject(parsed)) throw new Error('Expected JSON object');
        choice.actions = parsed;
        e.target.classList.remove('invalid');
        updateHint();
        save('actions');
      } catch {
        e.target.classList.add('invalid');
      }
    },
  });

  // Quick condition template
  const templateCondBtn = h('button', {
    type: 'button',
    class: 'btn btn-ghost btn-sm',
    style: 'margin-top: 4px; font-size: 0.75rem;',
    onclick: () => {
      const vars = Object.keys(state.quest.initial_variables || {});
      const varName = vars[0] || 'gold';
      const sample = [{ var: varName, op: '>=', value: 10 }];
      choice.conditions = sample;
      condInput.value = JSON.stringify(sample);
      condInput.classList.remove('invalid');
      updateHint();
      save('conditions');
      toast(t('bld_template_cond_toast', varName), 'info');
    },
  }, t('bld_template_cond_btn'));

  updateHint();
  return h('div', { class: `choice-card${scene.ending ? ' dimmed' : ''}` },
    h('div', { class: 'choice-row' },
      h('span', { class: 'choice-num' }, index + 1),
      h('input', {
        class: 'input choice-text-input',
        maxlength: 500,
        value: choice.text,
        placeholder: t('bld_choice_placeholder'),
        oninput: (event) => {
          choice.text = event.target.value;
          save('text');
          if (state.viewMode === 'canvas') renderCanvas();
        },
      }),
      h('button', {
        class: 'btn btn-icon btn-danger',
        title: t('bld_del_choice_title'),
        onclick: () => deleteChoice(scene, choice),
      }, '✕'),
    ),
    h('div', { class: 'choice-grid' },
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, t('bld_leads_to_label')),
        h('div', { class: 'inline' }, target, jump),
      ),
      h('label', { class: 'field' },
        h('span', { class: 'field-label' }, t('bld_req_item_label')),
        itemInput('required_item', t('bld_req_item_placeholder')),
      ),
      h('label', { class: 'field' },
        h('span', { class: 'field-label' }, t('bld_give_item_label')),
        itemInput('item_given', t('bld_give_item_placeholder')),
      ),
    ),
    h('details', { class: 'choice-advanced' },
      h('summary', {}, t('bld_adv_summary')),
      h('div', { class: 'advanced-grid' },
        h('label', { class: 'field' },
          h('span', { class: 'field-label' }, t('bld_cond_json_label')),
          condInput,
          templateCondBtn,
        ),
        h('label', { class: 'field' },
          h('span', { class: 'field-label' }, t('bld_act_json_label')),
          actInput,
        ),
      ),
    ),
    hint,
  );
}

function renderEditor() {
  if (!state.quest) return;
  const scene = sceneById(state.currentId);
  if (!scene) {
    els.editorView.replaceChildren(h('div', { class: 'card empty' },
      h('p', {}, state.scenes.length ? t('bld_empty_select_scene') : t('bld_empty_no_scenes')),
      h('button', { class: 'btn btn-primary', onclick: addScene }, t('bld_add_scene_large')),
    ));
    return;
  }

  const isStart = scene.id === state.quest.start_scene_id;

  const titleInput = h('input', {
    class: 'input input-lg',
    id: 'scene-title-input',
    maxlength: 200,
    value: scene.title,
    placeholder: t('bld_scene_title_placeholder'),
    oninput: (event) => {
      scene.title = event.target.value;
      schedule(`scene-title-${scene.id}`, () => patchScene(scene.id, { title: scene.title }));
      renderSceneList();
      refreshTargetLabels();
      if (state.viewMode === 'canvas') renderCanvas();
    },
  });

  const endingSelect = h('select', {
    class: 'input',
    value: scene.ending ?? '',
    onchange: (event) => {
      scene.ending = event.target.value || null;
      schedule(`scene-ending-${scene.id}`, () => patchScene(scene.id, { ending: scene.ending }), 0);
      renderSceneList();
      renderEditor();
      if (state.viewMode === 'canvas') renderCanvas();
    },
  },
  h('option', { value: '' }, t('bld_ending_normal')),
  h('option', { value: 'win' }, t('bld_ending_win')),
  h('option', { value: 'lose' }, t('bld_ending_lose')));

  const textArea = h('textarea', {
    class: 'input story-input',
    rows: 8,
    maxlength: 20000,
    value: scene.text,
    placeholder: t('bld_scene_text_placeholder'),
    oninput: (event) => {
      scene.text = event.target.value;
      schedule(`scene-text-${scene.id}`, () => patchScene(scene.id, { text: scene.text }), 700);
      if (state.viewMode === 'canvas') renderCanvas();
    },
  });

  const imgInput = h('input', {
    class: 'input',
    placeholder: 'https://example.com/art.jpg',
    value: scene.image_url || '',
    oninput: (e) => {
      scene.image_url = e.target.value.trim() || null;
      schedule(`scene-img-${scene.id}`, () => patchScene(scene.id, { image_url: scene.image_url }), 700);
    },
  });

  const audioInput = h('input', {
    class: 'input',
    placeholder: 'https://example.com/ambient.mp3',
    value: scene.audio_url || '',
    oninput: (e) => {
      scene.audio_url = e.target.value.trim() || null;
      schedule(`scene-audio-${scene.id}`, () => patchScene(scene.id, { audio_url: scene.audio_url }), 700);
    },
  });

  const incoming = state.scenes.flatMap((other) => other.choices
    .filter((c) => c.target_scene_id === scene.id && other.id !== scene.id)
    .map((c) => ({ other, choice: c })));

  els.editorView.replaceChildren(
    h('section', { class: 'card' },
      h('div', { class: 'editor-head' },
        h('label', { class: 'field title-field' }, h('span', { class: 'field-label' }, t('bld_scene_num_label', scene.id)), titleInput),
        h('label', { class: 'field ending-field' }, h('span', { class: 'field-label' }, t('bld_scene_type_label')), endingSelect),
      ),
      h('label', { class: 'field', style: 'margin-top: 14px' },
        h('span', { class: 'field-label' }, t('bld_scene_text_label')),
        textArea,
      ),
      h('div', { class: 'media-fields' },
        h('label', { class: 'field' },
          h('span', { class: 'field-label' }, t('bld_scene_img_label')),
          imgInput,
        ),
        h('label', { class: 'field' },
          h('span', { class: 'field-label' }, t('bld_scene_audio_label')),
          audioInput,
        ),
      ),
      h('div', { class: 'editor-toolbar' },
        isStart
          ? h('span', { class: 'chip' }, t('bld_chip_start_scene'))
          : h('button', { class: 'btn btn-ghost btn-sm', onclick: () => setStartScene(scene.id) }, t('bld_make_start_btn')),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => duplicateCurrentScene(scene) }, t('bld_dup_scene_btn')),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-danger btn-sm', onclick: () => deleteScene(scene) }, t('bld_del_scene_btn')),
      ),
    ),

    h('section', { class: 'card editor-section' },
      h('div', { class: 'card-head' },
        h('h3', {}, t('bld_choices_heading', scene.choices.length)),
        h('button', { class: 'btn btn-primary btn-sm', onclick: () => addChoice(scene) }, t('bld_add_choice_btn')),
      ),
      scene.ending
        ? h('p', { class: 'note' }, t('bld_note_ending_no_choices'))
        : (!scene.choices.length
          ? h('p', { class: 'note' }, t('bld_note_no_choices_deadend'))
          : null),
      scene.choices.map((c, i) => choiceCard(scene, c, i)),
    ),

    h('section', { class: 'card editor-section' },
      h('h3', {}, t('bld_incoming_heading')),
      incoming.length
        ? h('ul', { class: 'incoming-list' }, incoming.map(({ other, choice }) => h('li', {},
          h('button', { class: 'incoming-link', onclick: () => selectScene(other.id) },
            `${sceneLabel(other)} → «${choice.text || '…'}»`))))
        : h('p', { class: 'note' }, isStart
          ? t('bld_incoming_start_note')
          : t('bld_incoming_none_note')),
    ),
  );
}

// ================= 2D Node Canvas =================

const NODE_W = 220;
const NODE_H = 115;

function updateCanvasTransform() {
  const { zoom, panX, panY } = canvasState;
  const tStr = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  els.canvasNodes.style.transform = tStr;
  els.canvasLinks.setAttribute('transform', `translate(${panX}, ${panY}) scale(${zoom})`);
}

function updateCanvasSelection() {
  for (const card of els.canvasNodes.querySelectorAll('.node-card')) {
    const id = Number(card.dataset.id);
    card.classList.toggle('selected', id === state.currentId);
  }
  renderCanvasLinks();
}

function renderCanvas() {
  if (!state.quest) return;
  const scenes = state.scenes;
  const issues = issuesByScene();

  scenes.forEach((s, idx) => {
    if (s.pos_x == null || s.pos_y == null) {
      s.pos_x = 60 + (idx % 4) * 280;
      s.pos_y = 60 + Math.floor(idx / 4) * 160;
    }
  });

  els.canvasNodes.replaceChildren(...scenes.map((s) => {
    const isStart = s.id === state.quest.start_scene_id;
    const isCurrent = s.id === state.currentId;
    const issue = issues.get(s.id);

    const typeBadge = isStart ? '★' : s.ending === 'win' ? '🏆' : s.ending === 'lose' ? '💀' : '📖';
    const snippet = s.text.slice(0, 45) || '…';

    const card = h('div', {
      class: `node-card${isCurrent ? ' selected' : ''}${s.ending ? ' ' + s.ending : ''}`,
      dataset: { id: String(s.id) },
      style: `left: ${s.pos_x}px; top: ${s.pos_y}px; width: ${NODE_W}px;`,
      onclick: () => {
        if (card.dataset.justDragged === '1') {
          delete card.dataset.justDragged;
          return;
        }
        selectScene(s.id, { fromCanvasNode: true });
      },
      ondblclick: () => {
        selectScene(s.id, { fromCanvasNode: true });
        switchView('editor');
      },
      onmousedown: (e) => onNodeMouseDown(e, s, card),
    },
    h('div', { class: 'node-head' },
      h('span', { class: 'node-badge' }, typeBadge),
      h('span', { class: 'node-title' }, `#${s.id} · ${sceneLabel(s)}`),
      issue ? h('span', { class: 'badge badge-warn' }, '!') : null,
    ),
    h('div', { class: 'node-body' }, snippet),
    h('div', { class: 'node-foot' },
      h('span', {}, `${s.choices.length} ${plural(s.choices.length, ['переход', 'перехода', 'переходов'], ['link', 'links'])}`),
    ));
    return card;
  }));

  renderCanvasLinks();
  updateCanvasTransform();
}

function renderCanvasLinks() {
  const LINK_H = 90;
  const scenes = state.scenes;
  const byId = new Map(scenes.map((s) => [s.id, s]));

  const paths = [];
  const pairCounts = new Map();

  for (const s of scenes) {
    if (s.ending) continue;
    const x1 = (s.pos_x || 0) + NODE_W;
    const y1Base = (s.pos_y || 0) + LINK_H / 2;

    for (const c of s.choices) {
      if (!c.target_scene_id || c.target_scene_id === s.id) continue;
      const target = byId.get(c.target_scene_id);
      if (!target) continue;

      const pairKey = `${s.id}->${target.id}`;
      const pairIdx = pairCounts.get(pairKey) || 0;
      pairCounts.set(pairKey, pairIdx + 1);
      const yOffset = pairIdx === 0 ? 0 : (pairIdx % 2 === 1 ? 14 : -14) * Math.ceil(pairIdx / 2);

      const isCurrent = s.id === state.currentId || target.id === state.currentId;
      const y1 = y1Base + yOffset;
      const x2 = (target.pos_x || 0);
      const y2 = (target.pos_y || 0) + LINK_H / 2 + yOffset;

      const dx = Math.abs(x2 - x1);
      const cx1 = x1 + Math.max(40, dx * 0.4);
      const cy1 = y1;
      const cx2 = x2 - Math.max(40, dx * 0.4);
      const cy2 = y2;

      const d = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', `canvas-link${isCurrent ? ' selected' : ''}`);
      path.setAttribute('marker-end', isCurrent ? 'url(#arrow-selected)' : 'url(#arrow)');
      paths.push(path);
    }
  }

  els.canvasLinks.replaceChildren(...paths);
}

// Drag & Drop nodes
function onNodeMouseDown(e, scene, cardEl) {
  if (e.button !== 0) return;
  e.stopPropagation();
  canvasState.draggingId = scene.id;
  canvasState.dragStartX = e.clientX;
  canvasState.dragStartY = e.clientY;
  canvasState.nodeStartX = scene.pos_x || 0;
  canvasState.nodeStartY = scene.pos_y || 0;
  let hasMoved = false;

  const onMouseMove = (moveEvent) => {
    if (canvasState.draggingId !== scene.id) return;
    const rawDx = moveEvent.clientX - canvasState.dragStartX;
    const rawDy = moveEvent.clientY - canvasState.dragStartY;
    if (!hasMoved && Math.hypot(rawDx, rawDy) <= 3) return;
    hasMoved = true;

    const dx = rawDx / canvasState.zoom;
    const dy = rawDy / canvasState.zoom;
    scene.pos_x = Math.round(canvasState.nodeStartX + dx);
    scene.pos_y = Math.round(canvasState.nodeStartY + dy);

    if (cardEl) {
      cardEl.style.left = `${scene.pos_x}px`;
      cardEl.style.top = `${scene.pos_y}px`;
    }
    renderCanvasLinks();
  };

  const onMouseUp = () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    if (canvasState.draggingId === scene.id) {
      canvasState.draggingId = null;
      if (hasMoved) {
        if (cardEl) cardEl.dataset.justDragged = '1';
        schedule(`scene-pos-${scene.id}`, () => patchScene(scene.id, {
          pos_x: scene.pos_x,
          pos_y: scene.pos_y,
        }), 300);
      }
    }
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

// Pan & Zoom canvas
els.canvasViewport.addEventListener('mousedown', (e) => {
  if (e.target.closest('.node-card') || e.target.closest('.canvas-toolbar')) return;
  canvasState.isPanning = true;
  canvasState.panStartX = e.clientX - canvasState.panX;
  canvasState.panStartY = e.clientY - canvasState.panY;
  els.canvasViewport.classList.add('panning');

  const onMouseMove = (ev) => {
    if (!canvasState.isPanning) return;
    canvasState.panX = ev.clientX - canvasState.panStartX;
    canvasState.panY = ev.clientY - canvasState.panStartY;
    updateCanvasTransform();
  };

  const onMouseUp = () => {
    canvasState.isPanning = false;
    els.canvasViewport.classList.remove('panning');
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
});

els.canvasViewport.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = e.deltaY < 0 ? 1.15 : 0.85;
  const newZoom = Math.min(2.5, Math.max(0.25, canvasState.zoom * delta));
  const rect = els.canvasViewport.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const scale = newZoom / canvasState.zoom;
  canvasState.panX = Math.round(cx - (cx - canvasState.panX) * scale);
  canvasState.panY = Math.round(cy - (cy - canvasState.panY) * scale);
  canvasState.zoom = Number(newZoom.toFixed(3));
  updateCanvasTransform();
}, { passive: false });

// BFS Auto-Layout
function runAutoLayout() {
  const startId = state.quest.start_scene_id;
  const scenes = state.scenes;
  const byId = new Map(scenes.map((s) => [s.id, s]));

  const visited = new Set();
  const levels = new Map();
  const queue = startId ? [startId] : [];
  if (startId) levels.set(startId, 0);

  while (queue.length) {
    const curId = queue.shift();
    if (visited.has(curId)) continue;
    visited.add(curId);
    const curLevel = levels.get(curId) || 0;
    const curScene = byId.get(curId);
    if (!curScene) continue;

    for (const c of curScene.choices) {
      if (c.target_scene_id && !visited.has(c.target_scene_id)) {
        if (!levels.has(c.target_scene_id)) {
          levels.set(c.target_scene_id, curLevel + 1);
          queue.push(c.target_scene_id);
        }
      }
    }
  }

  let maxLevel = 0;
  for (const l of levels.values()) if (l > maxLevel) maxLevel = l;
  for (const s of scenes) {
    if (!levels.has(s.id)) levels.set(s.id, maxLevel + 1);
  }

  const cols = new Map();
  for (const s of scenes) {
    const lvl = levels.get(s.id) || 0;
    if (!cols.has(lvl)) cols.set(lvl, []);
    cols.get(lvl).push(s);
  }

  cols.forEach((colScenes, lvl) => {
    colScenes.forEach((s, rowIdx) => {
      s.pos_x = 60 + lvl * 290;
      s.pos_y = 60 + rowIdx * 150;
      schedule(`scene-pos-${s.id}`, () => patchScene(s.id, { pos_x: s.pos_x, pos_y: s.pos_y }));
    });
  });

  renderCanvas();
  fitAllNodes();
  toast(t('bld_autolayout_toast'), 'success');
}

function fitAllNodes() {
  if (!state.scenes.length) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  state.scenes.forEach((s, idx) => {
    const x = s.pos_x ?? (60 + (idx % 4) * 280);
    const y = s.pos_y ?? (60 + Math.floor(idx / 4) * 160);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + NODE_W > maxX) maxX = x + NODE_W;
    if (y + NODE_H > maxY) maxY = y + NODE_H;
  });

  const graphW = Math.max(1, maxX - minX);
  const graphH = Math.max(1, maxY - minY);
  const viewW = els.canvasViewport.clientWidth || 900;
  const viewH = els.canvasViewport.clientHeight || 600;
  const padX = 48;
  const padTop = 76;
  const padBottom = 36;

  const availW = Math.max(200, viewW - padX * 2);
  const availH = Math.max(200, viewH - padTop - padBottom);
  const zoom = Math.min(1.15, Math.max(0.25, Math.min(availW / graphW, availH / graphH)));

  canvasState.zoom = Number(zoom.toFixed(3));
  canvasState.panX = Math.round(padX + (availW - graphW * canvasState.zoom) / 2 - minX * canvasState.zoom);
  canvasState.panY = Math.round(padTop + (availH - graphH * canvasState.zoom) / 2 - minY * canvasState.zoom);
  updateCanvasTransform();
}

// ================= View Switching =================

function switchView(mode) {
  state.viewMode = mode;
  els.tabEditor.classList.toggle('active', mode === 'editor');
  els.tabCanvas.classList.toggle('active', mode === 'canvas');

  if (mode === 'canvas') {
    els.editorView.hidden = true;
    els.canvasView.hidden = false;
    renderCanvas();
    if (!canvasState.fittedOnce) {
      canvasState.fittedOnce = true;
      requestAnimationFrame(() => fitAllNodes());
    }
  } else {
    els.canvasView.hidden = true;
    els.editorView.hidden = false;
    renderEditor();
  }
}

// ================= Actions =================

function selectScene(id, { fromCanvasNode = false } = {}) {
  state.currentId = id ?? null;
  history.replaceState(null, '', id ? `#scene-${id}` : location.pathname);
  renderSceneList();
  if (state.viewMode === 'editor') {
    renderEditor();
  } else if (fromCanvasNode && els.canvasNodes.children.length === state.scenes.length) {
    updateCanvasSelection();
  } else {
    renderCanvas();
  }
}

async function createScene(data) {
  const created = await api(`/api/quests/${questId}/scenes`, { method: 'POST', body: data });
  state.scenes.push({ ...created, choices: [] });
  if (state.quest.start_scene_id == null) state.quest.start_scene_id = created.id;
  return created;
}

async function addScene() {
  try {
    const last = state.scenes[state.scenes.length - 1];
    const created = await createScene({
      title: t('bld_new_scene_num', state.scenes.length + 1),
      pos_x: (last?.pos_x || 60) + 290,
      pos_y: last?.pos_y || 60,
    });
    selectScene(created.id);
    scheduleValidate(0);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function duplicateCurrentScene(scene) {
  try {
    await flushPending();
    const dup = await api(`/api/scenes/${scene.id}/duplicate`, { method: 'POST' });
    state.scenes.push(dup);
    renderSceneList();
    selectScene(dup.id);
    toast(t('bld_dup_scene_toast', dup.title), 'success');
    scheduleValidate(0);
  } catch (e) {
    toast(t('bld_dup_scene_err', e.message), 'error');
  }
}

async function deleteScene(scene) {
  const incoming = state.scenes.reduce((n, s) => n + s.choices.filter((c) => c.target_scene_id === scene.id).length, 0);
  const warn = incoming ? t('bld_del_scene_incoming_warn', incoming) : '';
  if (!confirm(t('bld_del_scene_confirm', sceneLabel(scene), warn))) return;
  try {
    cancelPending((key) => key.startsWith('scene-') && key.endsWith(`-${scene.id}`));
    await flushPending();
    await api(`/api/scenes/${scene.id}`, { method: 'DELETE' });
    await reload();
    selectScene(state.quest.start_scene_id ?? state.scenes[0]?.id ?? null);
    toast(t('bld_del_scene_toast'), 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function addChoice(scene) {
  try {
    const created = await api(`/api/scenes/${scene.id}/choices`, { method: 'POST', body: { text: '' } });
    scene.choices.push(created);
    renderEditor();
    scheduleValidate(0);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function deleteChoice(scene, choice) {
  if (choice.text.trim() && !confirm(t('bld_del_choice_confirm', choice.text))) return;
  try {
    cancelPending((key) => key.startsWith('choice-') && key.endsWith(`-${choice.id}`));
    await api(`/api/choices/${choice.id}`, { method: 'DELETE' });
    scene.choices = scene.choices.filter((c) => c.id !== choice.id);
    renderEditor();
    renderSceneList();
    if (state.viewMode === 'canvas') renderCanvas();
    scheduleValidate(0);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function setStartScene(id) {
  try {
    const quest = await patchQuest({ start_scene_id: id });
    state.quest.start_scene_id = quest.start_scene_id;
    renderSceneList();
    renderEditor();
    if (state.viewMode === 'canvas') renderCanvas();
    scheduleValidate(0);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function reload() {
  const data = await api(`/api/quests/${questId}`);
  const { scenes, ...quest } = data;
  state.quest = quest;
  state.scenes = scenes;
  renderQuestMeta();
  renderSceneList();
  scheduleValidate(0);
}

let fatalState = null;

function showFatal(title, message) {
  fatalState = { title, message };
  els.builder.replaceChildren(h('section', { class: 'card fatal' },
    h('h2', {}, title),
    h('p', {}, message),
    h('a', { class: 'btn btn-primary', href: '/' }, t('bld_fatal_back_catalog')),
  ));
  els.playLink.hidden = true;
  els.deleteQuest.hidden = true;
  els.saveStatus.hidden = true;
}

// ================= Initialization =================

els.tabEditor.addEventListener('click', () => switchView('editor'));
els.tabCanvas.addEventListener('click', () => switchView('canvas'));

// Ensure pending changes are flushed before export or play
for (const linkEl of [els.playLink, els.exportHtml, els.exportJson]) {
  linkEl?.addEventListener('click', async (e) => {
    if (!pending.size && !inflightPromises.size) return;
    e.preventDefault();
    const href = linkEl.href;
    const target = linkEl.target;
    await flushPending();
    if (target === '_blank') {
      window.open(href, '_blank', 'noopener');
    } else {
      location.href = href;
    }
  });
}

els.duplicateQuest?.addEventListener('click', async () => {
  try {
    await flushPending();
    const dup = await api(`/api/quests/${questId}/duplicate`, { method: 'POST' });
    toast(t('bld_dup_quest_toast', dup.title), 'success');
    location.href = `/builder/${dup.id}`;
  } catch (err) {
    toast(t('bld_dup_quest_err', err.message), 'error');
  }
});

els.questTitle.addEventListener('input', () => {
  const value = els.questTitle.value;
  const valid = value.trim().length > 0;
  els.questTitle.classList.toggle('invalid', !valid);
  if (!valid) return;
  state.quest.title = value.trim();
  els.headerTitle.textContent = state.quest.title;
  document.title = t('bld_doc_title', state.quest.title);
  schedule('quest-title', () => patchQuest({ title: state.quest.title }));
});

els.questDesc.addEventListener('input', () => {
  state.quest.description = els.questDesc.value;
  schedule('quest-desc', () => patchQuest({ description: state.quest.description }), 700);
});

els.questVars.addEventListener('input', () => {
  try {
    const val = els.questVars.value.trim();
    const parsed = val ? JSON.parse(val) : {};
    if (!isPlainObject(parsed)) throw new Error('Expected JSON object');
    state.quest.initial_variables = parsed;
    els.questVars.classList.remove('invalid');
    schedule('quest-vars', () => patchQuest({ initial_variables: state.quest.initial_variables }), 700);
  } catch {
    els.questVars.classList.add('invalid');
  }
});

els.startScene.addEventListener('change', () => {
  const id = els.startScene.value ? Number(els.startScene.value) : null;
  state.quest.start_scene_id = id;
  schedule('quest-start', () => patchQuest({ start_scene_id: id }), 0);
  renderSceneList();
  renderEditor();
  if (state.viewMode === 'canvas') renderCanvas();
});

els.addScene.addEventListener('click', addScene);
els.canvasAddScene.addEventListener('click', addScene);

els.zoomIn.addEventListener('click', () => {
  canvasState.zoom = Math.min(2.5, Number((canvasState.zoom * 1.2).toFixed(3)));
  updateCanvasTransform();
});
els.zoomOut.addEventListener('click', () => {
  canvasState.zoom = Math.max(0.25, Number((canvasState.zoom * 0.8).toFixed(3)));
  updateCanvasTransform();
});
els.zoomReset.addEventListener('click', () => {
  canvasState.zoom = 1.0;
  updateCanvasTransform();
});
els.fitCanvas.addEventListener('click', fitAllNodes);
els.autoLayout.addEventListener('click', runAutoLayout);

els.deleteQuest.addEventListener('click', async () => {
  if (!confirm(t('bld_del_quest_confirm', state.quest.title))) return;
  try {
    cancelPending(() => true);
    await api(`/api/quests/${questId}`, { method: 'DELETE' });
    location.replace('/');
  } catch (e) {
    toast(e.message, 'error');
  }
});

window.addEventListener('tq:langchange', () => {
  updateSaveStatus();
  if (state.quest) {
    document.title = t('bld_doc_title', state.quest.title);
    renderSceneList();
    renderReport();
    if (state.viewMode === 'canvas') {
      renderCanvas();
    } else {
      renderEditor();
    }
  } else if (fatalState) {
    showFatal(t('bld_not_found_title'), fatalState.message);
  }
});

async function init() {
  initTheme();
  if (!questId) {
    showFatal(t('bld_not_found_title'), t('bld_not_found_bad_url'));
    return;
  }
  try {
    await reload();
  } catch (e) {
    showFatal(t('bld_not_found_title'), e.status === 404 ? t('bld_not_found_deleted') : e.message);
    return;
  }
  const fromHash = Number((location.hash.match(/scene-(\d+)/) || [])[1]);
  selectScene(sceneById(fromHash) ? fromHash : (state.quest.start_scene_id ?? state.scenes[0]?.id ?? null));
}

init();

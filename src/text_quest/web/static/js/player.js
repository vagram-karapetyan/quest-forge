import { api, h, idFromPath, initTheme, itemIcon, toast } from './api.js';

const questId = idFromPath();
const STORAGE_KEY = `tq_session_${questId}`;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const els = {
  questTitle: document.getElementById('quest-title'),
  builderLink: document.getElementById('builder-link'),
  restart: document.getElementById('restart-btn'),
  undoBtn: document.getElementById('undo-btn'),
  logToggle: document.getElementById('log-toggle'),
  logDialog: document.getElementById('log-dialog'),
  logContent: document.getElementById('log-content'),
  closeLogBtn: document.getElementById('close-log-btn'),
  exportHtml: document.getElementById('export-html'),
  card: document.getElementById('story-card'),
  mediaBox: document.getElementById('media-box'),
  sceneImage: document.getElementById('scene-image'),
  sceneTitle: document.getElementById('scene-title'),
  text: document.getElementById('story-text'),
  notice: document.getElementById('notice'),
  choices: document.getElementById('choices'),
  varsCard: document.getElementById('vars-card'),
  varsList: document.getElementById('vars-list'),
  inventory: document.getElementById('inventory'),
  steps: document.getElementById('stat-steps'),
  visited: document.getElementById('stat-visited'),
  audio: document.getElementById('bg-audio'),
  audioToggle: document.getElementById('audio-toggle'),
};

const ENDINGS = {
  win: { icon: '🏆', title: 'Победа!', subtitle: 'Вы раскрыли эту историю.' },
  lose: { icon: '💀', title: 'Поражение', subtitle: 'Здесь ваш путь оборвался. Попробуйте иначе.' },
  end: { icon: '📜', title: 'Конец истории', subtitle: 'Дальше дороги нет.' },
};

let state = null;
let busy = false;
let typing = null;
let renderToken = 0;
let currentAudioUrl = '';
let audioMuted = false;

// ---------- Безопасный Markdown парсер ----------

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(raw = '', allowAudio = false) {
  const trimmed = String(raw ?? '').trim();
  const re = allowAudio
    ? /^(https?:\/\/|data:(?:image|audio)\/|\/|\.|#)/i
    : /^(https?:\/\/|data:image\/|\/|\.|#)/i;
  if (re.test(trimmed)) {
    return trimmed.replace(/"/g, '%22');
  }
  return '';
}

function formatInline(escapedText) {
  const tokens = [];
  const stash = (html) => {
    const id = `\x00TOK_${tokens.length}\x00`;
    tokens.push(html);
    return id;
  };

  let out = escapedText
    .replace(/`([^`]+)`/g, (_, code) => stash(`<code>${code}</code>`))
    .replace(/!\[(.*?)\]\((.*?)\)/g, (_, alt, rawUrl) => {
      const url = safeUrl(rawUrl.replace(/&amp;/g, '&'));
      return url ? stash(`<img src="${url}" alt="${alt}" style="max-width:100%; border-radius:6px;">`) : alt;
    })
    .replace(/\[(.*?)\]\((.*?)\)/g, (_, label, rawUrl) => {
      const url = safeUrl(rawUrl.replace(/&amp;/g, '&')) || '#';
      return stash(`<a href="${url}" target="_blank" rel="noopener">${label}</a>`);
    });

  out = out
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w\u0400-\u04FF])_([^_\n]+?)_(?=$|[^\w\u0400-\u04FF])/g, '$1<em>$2</em>');

  return out.replace(/\x00TOK_(\d+)\x00/g, (_, idx) => tokens[Number(idx)] || '');
}

function renderMarkdown(md = '') {
  const lines = escapeHtml(md).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  let listItems = [];
  let quoteLines = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push(`<p>${para.map(formatInline).join('<br>')}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      blocks.push(`<ul>${listItems.map((item) => `<li>${formatInline(item)}</li>`).join('')}</ul>`);
      listItems = [];
    }
  };
  const flushQuote = () => {
    if (quoteLines.length) {
      blocks.push(`<blockquote>${quoteLines.map(formatInline).join('<br>')}</blockquote>`);
      quoteLines = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushAll();
      continue;
    }
    const hMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (hMatch) {
      flushAll();
      const lvl = hMatch[1].length;
      blocks.push(`<h${lvl}>${formatInline(hMatch[2].trim())}</h${lvl}>`);
      continue;
    }
    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      flushAll();
      blocks.push('<hr>');
      continue;
    }
    const qMatch = line.match(/^&gt;\s?(.*)$/);
    if (qMatch) {
      flushPara();
      flushList();
      quoteLines.push(qMatch[1]);
      continue;
    }
    const liMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (liMatch) {
      flushPara();
      flushQuote();
      listItems.push(liMatch[1]);
      continue;
    }
    flushList();
    flushQuote();
    para.push(line);
  }
  flushAll();
  return blocks.join('') || '<p></p>';
}

// ---------- эффект печатной машинки ----------

function finishTyping() {
  if (typing) typing.finish();
}

function typeText(text, instant) {
  finishTyping();
  const el = els.text;
  const parsedHtml = renderMarkdown(text);
  if (instant || reducedMotion || !text) {
    el.innerHTML = parsedHtml;
    return Promise.resolve();
  }

  el.innerHTML = parsedHtml;
  const textNodes = [];
  let totalChars = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const full = node.nodeValue;
    if (full) {
      textNodes.push({ node, full, len: full.length });
      totalChars += full.length;
      node.nodeValue = '';
    }
  }
  if (!totalChars) return Promise.resolve();

  el.classList.add('typing');
  els.card.classList.add('is-typing');
  return new Promise((resolve) => {
    const perTick = Math.max(1, Math.ceil(totalChars / 150));
    let shown = 0;
    let timer = null;
    const done = () => {
      clearInterval(timer);
      for (const item of textNodes) item.node.nodeValue = item.full;
      el.classList.remove('typing');
      els.card.classList.remove('is-typing');
      typing = null;
      resolve();
    };
    timer = setInterval(() => {
      shown += perTick;
      if (shown >= totalChars) {
        done();
        return;
      }
      let rem = shown;
      for (const item of textNodes) {
        if (rem <= 0) {
          item.node.nodeValue = '';
        } else if (rem >= item.len) {
          item.node.nodeValue = item.full;
          rem -= item.len;
        } else {
          item.node.nodeValue = item.full.slice(0, rem);
          rem = 0;
        }
      }
    }, 16);
    typing = { finish: done };
  });
}

// ---------- отрисовка ----------

function renderInventory(items, newItems = []) {
  if (!items.length) {
    els.inventory.replaceChildren(h('li', { class: 'inv-empty' }, 'Пока пусто'));
    return;
  }
  els.inventory.replaceChildren(...items.map((item) => h('li',
    { class: `inv-item${newItems.includes(item) ? ' new' : ''}` },
    h('span', { class: 'inv-icon' }, itemIcon(item)),
    h('span', {}, item),
  )));
}

function formatVarValue(val) {
  if (typeof val === 'boolean') return val ? 'да' : 'нет';
  return String(val);
}

function renderVariables(vars = {}) {
  const keys = Object.keys(vars);
  if (!keys.length) {
    els.varsCard.hidden = true;
    return;
  }
  els.varsCard.hidden = false;
  els.varsList.replaceChildren(...keys.map((k) => h('li', { class: 'var-item' },
    h('span', { class: 'var-name' }, k),
    h('span', { class: 'var-val' }, formatVarValue(vars[k])),
  )));
}

function updateAudioButton() {
  if (!els.audioToggle) return;
  els.audioToggle.textContent = els.audio.paused ? '🔇 Вкл. звук' : '🔊 Музыка';
}

function renderMedia(scene) {
  const imgUrl = safeUrl(scene.image_url);
  if (imgUrl) {
    els.mediaBox.hidden = false;
    if (els.sceneImage.getAttribute('src') !== imgUrl) {
      els.sceneImage.src = imgUrl;
    }
  } else {
    els.mediaBox.hidden = true;
    els.sceneImage.removeAttribute('src');
  }

  const audioUrl = safeUrl(scene.audio_url, true);
  if (audioUrl) {
    els.audioToggle.hidden = false;
    if (currentAudioUrl !== audioUrl) {
      currentAudioUrl = audioUrl;
      els.audio.src = audioUrl;
      if (!audioMuted) {
        els.audio.play().then(updateAudioButton).catch(updateAudioButton);
      } else {
        updateAudioButton();
      }
    } else {
      updateAudioButton();
    }
  } else {
    els.audioToggle.hidden = true;
    if (currentAudioUrl) {
      els.audio.pause();
      els.audio.removeAttribute('src');
      currentAudioUrl = '';
    }
  }
}

els.sceneImage?.addEventListener('error', () => {
  els.mediaBox.hidden = true;
});

function renderNotice(s) {
  const lines = (s.new_items || []).map((item) => `${itemIcon(item)} Получен предмет: «${item}»`);
  if (s.message) lines.push(s.message);
  if (!lines.length) {
    els.notice.hidden = true;
    return;
  }
  els.notice.replaceChildren(...lines.map((line) => h('div', {}, line)));
  els.notice.hidden = false;
  els.notice.style.animation = 'none';
  void els.notice.offsetWidth;
  els.notice.style.animation = '';
}

function endingPanel(s) {
  const e = ENDINGS[s.status] || ENDINGS.end;
  return h('div', { class: `ending ending-${s.status}` },
    h('div', { class: 'ending-icon' }, e.icon),
    h('div', { class: 'ending-title' }, e.title),
    h('div', { class: 'ending-sub' }, e.subtitle),
    h('div', { class: 'ending-stats' },
      `Шагов: ${s.steps} · Открыто сцен: ${s.visited} из ${s.total_scenes} · Предметов: ${s.inventory.length}`),
    h('div', { class: 'ending-actions' },
      h('button', { class: 'btn btn-primary', onclick: startNew }, '↺ Сыграть ещё раз'),
      s.can_undo ? h('button', { class: 'btn btn-ghost', onclick: undoStep }, '↶ Отменить ход') : null,
      h('a', { class: 'btn btn-ghost', href: '/' }, 'К каталогу квестов'),
    ),
  );
}

function renderChoices(s) {
  if (s.status !== 'playing') {
    els.choices.replaceChildren(endingPanel(s));
    return;
  }
  els.choices.replaceChildren(...s.choices.map((c, i) => {
    const locked = !c.available;
    let req = null;
    if (locked && c.lock_reason) {
      req = h('span', { class: 'choice-req' }, `🔒 ${c.lock_reason}`);
    } else if (c.required_item) {
      req = h('span', { class: 'choice-req unlocked' }, `${itemIcon(c.required_item)} ${c.required_item}`);
    }
    return h('button', {
      class: `choice-btn${locked ? ' locked' : ''}`,
      disabled: locked,
      style: `animation-delay: ${i * 70}ms`,
      title: locked ? (c.lock_reason || 'Выбор заблокирован') : null,
      onclick: () => choose(c),
    },
    h('span', { class: 'choice-key' }, i < 9 ? String(i + 1) : '•'),
    h('span', { class: 'choice-text' }, c.text || '…'),
    req);
  }));
}

function renderLogModal(s) {
  if (!els.logContent) return;
  const entries = s.log || [];
  if (!entries.length) {
    els.logContent.replaceChildren(h('p', { class: 'muted' }, 'Вы пока не сделали ни одного выбора.'));
    return;
  }
  els.logContent.replaceChildren(h('ol', { style: 'padding-left: 20px; display: flex; flex-direction: column; gap: 8px;' },
    ...entries.map((entry) => h('li', {},
      h('span', { class: 'muted' }, `${entry.scene_title}: `),
      h('strong', {}, entry.choice_text),
    )),
  ));
}

async function render(s, { instant = false } = {}) {
  const prev = state;
  state = s;
  const token = ++renderToken;

  document.title = `${s.quest_title} — Text Quest`;
  els.questTitle.textContent = s.quest_title;
  els.card.dataset.status = s.status;
  els.steps.textContent = s.steps;
  els.visited.textContent = `${s.visited} из ${s.total_scenes}`;
  if (els.undoBtn) {
    els.undoBtn.disabled = !s.can_undo;
  }
  renderInventory(s.inventory, s.new_items);
  renderVariables(s.variables);
  renderMedia(s.scene);
  renderNotice(s);
  renderLogModal(s);
  els.choices.replaceChildren();

  const sameScene = prev && prev.session_id === s.session_id && prev.scene.id === s.scene.id;
  els.sceneTitle.textContent = s.scene.title || '';
  if (!sameScene) {
    els.card.classList.remove('scene-enter');
    void els.card.offsetWidth;
    els.card.classList.add('scene-enter');
    await typeText(s.scene.text || '…', instant);
    if (token !== renderToken) return;
  } else {
    await typeText(s.scene.text || '…', true);
  }
  renderChoices(s);
  if (!instant) els.choices.querySelector('.choice-btn:not(:disabled)')?.focus({ preventScroll: true });
}

function showFatal(message) {
  finishTyping();
  state = null;
  els.card.dataset.status = 'lose';
  els.sceneTitle.textContent = 'Не удалось начать игру';
  els.text.textContent = message;
  els.notice.hidden = true;
  els.choices.replaceChildren(h('div', { class: 'ending-actions' },
    h('a', { class: 'btn btn-primary', href: `/builder/${questId}` }, '✎ Открыть конструктор'),
    h('a', { class: 'btn btn-ghost', href: '/' }, 'К каталогу'),
  ));
}

// ---------- действия ----------

async function startNew() {
  try {
    const s = await api('/api/game/start', { method: 'POST', body: { quest_id: questId } });
    localStorage.setItem(STORAGE_KEY, s.session_id);
    state = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await render(s);
  } catch (e) {
    showFatal(e.message);
  }
}

async function undoStep() {
  if (busy || !state || !state.can_undo) return;
  busy = true;
  try {
    const s = await api(`/api/game/${state.session_id}/undo`, { method: 'POST' });
    toast('Ход отменён', 'info');
    await render(s, { instant: true });
  } catch (e) {
    toast(`Не удалось отменить ход: ${e.message}`, 'error');
  } finally {
    busy = false;
  }
}

async function choose(choice) {
  if (busy || !state || !choice.available) return;
  busy = true;
  els.choices.classList.add('busy');
  try {
    const s = await api(`/api/game/${state.session_id}/action`, {
      method: 'POST',
      body: { choice_id: choice.id },
    });
    const prevSceneId = state.scene?.id;
    if (s.scene?.id !== prevSceneId) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    await render(s);
  } catch (e) {
    toast(e.message, 'error');
    if (e.status === 404 || e.status === 409) await startNew();
  } finally {
    busy = false;
    els.choices.classList.remove('busy');
  }
}

async function init() {
  if (!questId) {
    showFatal('Некорректный адрес квеста.');
    return;
  }
  initTheme();
  els.builderLink.href = `/builder/${questId}`;
  els.exportHtml.href = `/api/quests/${questId}/export/html`;

  api('/api/auth/status').then((st) => {
    if (st && st.auth_required && !st.is_authenticated) {
      els.builderLink.addEventListener('click', (e) => {
        e.preventDefault();
        location.href = `/?login=1&next=${encodeURIComponent(`/builder/${questId}`)}`;
      });
    }
  }).catch(() => {});

  const params = new URLSearchParams(location.search);
  if (params.has('new')) {
    localStorage.removeItem(STORAGE_KEY);
    history.replaceState(null, '', location.pathname);
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const s = await api(`/api/game/${saved}`);
      if (s.quest_id === questId) {
        await render(s, { instant: true });
        return;
      }
    } catch { /* сессия устарела */ }
    localStorage.removeItem(STORAGE_KEY);
  }
  await startNew();
}

els.card.addEventListener('click', () => finishTyping());
els.restart.addEventListener('click', () => {
  if (state && state.status === 'playing' && state.steps > 0 && !confirm('Начать квест заново? Текущий прогресс будет потерян.')) return;
  startNew();
});

els.undoBtn?.addEventListener('click', undoStep);
els.logToggle?.addEventListener('click', () => {
  if (state) renderLogModal(state);
  els.logDialog?.showModal();
});
els.closeLogBtn?.addEventListener('click', () => els.logDialog?.close());

els.audioToggle?.addEventListener('click', () => {
  if (els.audio.paused) {
    audioMuted = false;
    els.audio.play().then(updateAudioButton).catch(updateAudioButton);
  } else {
    audioMuted = true;
    els.audio.pause();
    updateAudioButton();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.target.closest('input, textarea, select')) return;
  if (typing && (event.key === ' ' || event.key === 'Enter')) {
    event.preventDefault();
    finishTyping();
    return;
  }
  if ((event.key === 'z' || event.key === 'Z' || event.key === 'я' || event.key === 'Я') && state && state.can_undo && !busy) {
    event.preventDefault();
    undoStep();
    return;
  }
  if (/^[1-9]$/.test(event.key) && state && state.status === 'playing' && !typing) {
    const choice = state.choices[Number(event.key) - 1];
    if (choice) choose(choice);
  }
});

init();

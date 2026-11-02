"""Standalone single-file HTML compiler and JSON quest exporter/importer."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path
from typing import Any

from .models import Choice, Quest, Scene

STATIC_DIR = Path(__file__).resolve().parent / "web" / "static"


def get_embedded_css() -> str:
    css_path = STATIC_DIR / "css" / "style.css"
    if css_path.exists():
        return css_path.read_text(encoding="utf-8")
    return ""


def quest_to_dict(quest: Quest, scenes: list[Scene], choices: list[Choice]) -> dict[str, Any]:
    choices_by_scene: dict[int, list[dict[str, Any]]] = {}
    for c in choices:
        choices_by_scene.setdefault(c.scene_id, []).append({
            "id": c.id,
            "scene_id": c.scene_id,
            "text": c.text,
            "target_scene_id": c.target_scene_id,
            "required_item": c.required_item,
            "item_given": c.item_given,
            "conditions": c.conditions or [],
            "actions": c.actions or {},
        })

    scenes_data = []
    for s in scenes:
        scenes_data.append({
            "id": s.id,
            "title": s.title,
            "text": s.text,
            "ending": s.ending,
            "pos_x": s.pos_x,
            "pos_y": s.pos_y,
            "image_url": s.image_url,
            "audio_url": s.audio_url,
            "choices": choices_by_scene.get(s.id, []),
        })

    return {
        "title": quest.title,
        "description": quest.description,
        "start_scene_id": quest.start_scene_id,
        "initial_variables": quest.initial_variables or {},
        "scenes": scenes_data,
    }


HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>__QUEST_TITLE__ — Quest Forge (Standalone)</title>
  <style>
__CSS_CONTENT__

/* Additional styles for Standalone player */
.standalone-badge {
  font-size: 0.75rem;
  background: rgba(148, 163, 234, 0.15);
  padding: 3px 8px;
  border-radius: 999px;
  color: var(--glow);
}
.audio-player-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--muted);
  margin-left: 8px;
}
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">✦ Quest Forge <span class="standalone-badge" data-i18n="standalone_badge">Offline Build</span></div>
    <div class="topbar-title">__QUEST_TITLE__</div>
    <div class="topbar-actions">
      <button class="btn btn-ghost btn-sm" id="lang-toggle" title="Switch language (EN / RU)">🌐 EN</button>
      <button class="btn btn-ghost btn-sm" id="theme-toggle" title="Switch color theme">🎨 Night</button>
      <button class="btn btn-ghost btn-sm" id="log-toggle" data-i18n="log_btn" title="History of your choices">📜 Log</button>
      <button class="btn btn-ghost btn-sm" id="undo-btn" data-i18n="undo_btn" title="Undo the last move" disabled>↶ Undo</button>
      <div id="audio-container" class="audio-player-bar" hidden>
        <button id="audio-toggle" class="btn btn-ghost btn-sm">🔊 Music</button>
      </div>
      <button class="btn btn-ghost btn-sm" id="restart-btn" data-i18n="restart_btn">↺ Restart</button>
    </div>
  </header>

  <main class="player">
    <section class="card story" id="story-card" aria-live="polite">
      <div id="media-box" class="scene-media-box" hidden>
        <img id="scene-image" class="scene-image" alt="Scene illustration">
      </div>
      <h1 class="scene-title" id="scene-title"></h1>
      <div class="story-text markdown-body" id="story-text" data-i18n="loading">Loading…</div>
      <div class="notice" id="notice" hidden></div>
      <div class="choices" id="choices"></div>
      <div class="skip-hint" data-i18n="skip_hint">Click anywhere on the card to reveal full text</div>
    </section>

    <aside class="sidebar">
      <section class="card side-card" id="vars-card" hidden>
        <h3 data-i18n="vars_heading">📊 Stats & Variables</h3>
        <ul class="vars-list" id="vars-list"></ul>
      </section>

      <section class="card side-card">
        <h3 data-i18n="inv_heading">🎒 Inventory</h3>
        <ul class="inventory" id="inventory">
          <li class="inv-empty" data-i18n="inv_empty">Empty for now</li>
        </ul>
      </section>

      <section class="card side-card">
        <h3 data-i18n="journey_heading">🧭 Progress</h3>
        <dl class="stats">
          <dt data-i18n="stat_steps">Steps taken</dt><dd id="stat-steps">0</dd>
          <dt data-i18n="stat_visited">Scenes discovered</dt><dd id="stat-visited">—</dd>
        </dl>
      </section>

      <section class="card side-card kbd-hint" data-i18n-html="kbd_hint_html">
        <kbd>1</kbd>–<kbd>9</kbd> — quick choice,<br>
        <kbd>Z</kbd> — undo last move,<br>
        <kbd>Space</kbd> — skip typewriter effect.<br>
        Runs 100% offline in your browser.
      </section>
    </aside>
  </main>

  <dialog class="modal" id="log-dialog">
    <div class="modal-body">
      <h2 data-i18n="log_modal_title">📜 Journey Log</h2>
      <p class="muted" style="margin-bottom: 14px;" data-i18n="log_modal_sub">Chronicle of your decisions and visited scenes:</p>
      <div id="log-content">
        <p class="muted" data-i18n="log_empty">You haven’t made any choices yet.</p>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary" id="close-log-btn" data-i18n="log_close">Close</button>
      </div>
    </div>
  </dialog>

  <audio id="bg-audio" loop></audio>

  <script>
  (function() {
    const QUEST = __QUEST_JSON__;
    const STORAGE_KEY = 'tq_standalone_' + encodeURIComponent(QUEST.title);
    const LANG_KEY = 'tq_lang';
    const scenesById = new Map(QUEST.scenes.map(s => [s.id, s]));
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const I18N = {
      en: {
        standalone_badge: 'Offline Build',
        theme_night: '🌌 Night',
        theme_parchment: '📜 Parchment',
        theme_cyber: '⚡ Cyber',
        log_btn: '📜 Log',
        undo_btn: '↶ Undo',
        restart_btn: '↺ Restart',
        audio_on: '🔊 Music',
        audio_off: '🔇 Sound On',
        loading: 'Loading…',
        skip_hint: 'Click anywhere on the card to reveal full text',
        vars_heading: '📊 Stats & Variables',
        inv_heading: '🎒 Inventory',
        inv_empty: 'Empty for now',
        journey_heading: '🧭 Progress',
        stat_steps: 'Steps taken',
        stat_visited: 'Scenes discovered',
        visited_of: (v, total) => `${v} of ${total}`,
        kbd_hint_html: '<kbd>1</kbd>–<kbd>9</kbd> — quick choice,<br><kbd>Z</kbd> — undo last move,<br><kbd>Space</kbd> — skip typewriter effect.<br>Runs 100% offline in your browser.',
        log_modal_title: '📜 Journey Log',
        log_modal_sub: 'Chronicle of your decisions and visited scenes:',
        log_empty: 'You haven’t made any choices yet.',
        log_close: 'Close',
        bool_true: 'yes',
        bool_false: 'no',
        req_item: (item) => `Requires item: “${item}”`,
        req_no_item: (item) => `Must not have item: “${item}”`,
        req_var: (v, op, val, cur) => `Requires: ${v} ${op} ${val} (current: ${cur})`,
        item_received: (item) => `Received item: “${item}”`,
        win_title: 'Victory!',
        win_sub: 'You have unraveled this story.',
        lose_title: 'Defeat',
        lose_sub: 'Your journey came to an abrupt end. Try another path.',
        end_title: 'The End',
        end_sub: 'There is no road further.',
        end_stats: (steps, visited, total, items) => `Steps: ${steps} · Scenes discovered: ${visited} of ${total} · Items: ${items}`,
        play_again: '↺ Play Again',
        scene_fallback: (id) => `Scene #${id}`,
        action_done: 'Action completed.',
        move_undone: 'Move undone.',
        restart_confirm: 'Restart from the beginning? Current progress will be reset.',
      },
      ru: {
        standalone_badge: 'Офлайн игра',
        theme_night: '🌌 Ночь',
        theme_parchment: '📜 Пергамент',
        theme_cyber: '⚡ Кибер',
        log_btn: '📜 Журнал',
        undo_btn: '↶ Назад',
        restart_btn: '↺ Заново',
        audio_on: '🔊 Музыка',
        audio_off: '🔇 Вкл. звук',
        loading: 'Загрузка…',
        skip_hint: 'Нажмите, чтобы показать текст целиком',
        vars_heading: '📊 Характеристики',
        inv_heading: '🎒 Инвентарь',
        inv_empty: 'Пока пусто',
        journey_heading: '🧭 Путешествие',
        stat_steps: 'Сделано шагов',
        stat_visited: 'Открыто сцен',
        visited_of: (v, total) => `${v} из ${total}`,
        kbd_hint_html: '<kbd>1</kbd>–<kbd>9</kbd> — быстрый выбор,<br><kbd>Z</kbd> — ход назад (Undo),<br><kbd>Пробел</kbd> — пропустить печать текста.<br>Игра работает полностью офлайн в вашем браузере.',
        log_modal_title: '📜 Журнал путешествия',
        log_modal_sub: 'Хроника ваших решений и пройденных сцен:',
        log_empty: 'Вы пока не сделали ни одного выбора.',
        log_close: 'Закрыть',
        bool_true: 'да',
        bool_false: 'нет',
        req_item: (item) => `Нужен предмет: «${item}»`,
        req_no_item: (item) => `Не должно быть предмета: «${item}»`,
        req_var: (v, op, val, cur) => `Требуется: ${v} ${op} ${val} (сейчас: ${cur})`,
        item_received: (item) => `Получен предмет: «${item}»`,
        win_title: 'Победа!',
        win_sub: 'Вы раскрыли эту историю.',
        lose_title: 'Поражение',
        lose_sub: 'Здесь ваш путь оборвался. Попробуйте иначе.',
        end_title: 'Конец истории',
        end_sub: 'Дальше дороги нет.',
        end_stats: (steps, visited, total, items) => `Шагов: ${steps} · Открыто сцен: ${visited} из ${total} · Предметов: ${items}`,
        play_again: '↺ Сыграть ещё раз',
        scene_fallback: (id) => `Сцена #${id}`,
        action_done: 'Действие выполнено.',
        move_undone: 'Ход отменён.',
        restart_confirm: 'Начать заново? Текущий прогресс будет сброшен.',
      },
    };

    function getLang() {
      try {
        const s = localStorage.getItem(LANG_KEY);
        if (s === 'ru' || s === 'en') return s;
      } catch(e) {}
      return 'en';
    }

    function t(key, ...args) {
      const dict = I18N[getLang()] || I18N.en;
      const val = dict[key] ?? I18N.en[key] ?? key;
      return typeof val === 'function' ? val(...args) : val;
    }

    function applyTranslations() {
      document.documentElement.lang = getLang();
      for (const el of document.querySelectorAll('[data-i18n]')) {
        el.textContent = t(el.dataset.i18n);
      }
      for (const el of document.querySelectorAll('[data-i18n-html]')) {
        el.innerHTML = t(el.dataset.i18nHtml);
      }
      if (els.langToggle) {
        els.langToggle.textContent = getLang() === 'en' ? '🌐 EN' : '🌐 RU';
      }
      updateThemeBtn();
      updateAudioButton();
    }

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

    // Item icons
    const ITEM_ICONS = [
      [/ключ|key/i, '🗝️'], [/линз|стекл|кристалл|хрустал|сфер|lens|glass|crystal|orb/i, '🔮'],
      [/карт|план|схем|map|chart|plan/i, '🗺️'], [/свеч|ламп|фонар|факел|candle|lamp|lantern|torch/i, '🕯️'],
      [/книг|дневник|тетрад|письм|запис|свит|book|diary|journal|letter|note|scroll|gdd/i, '📜'], [/монет|золот|деньг|coin|gold|money/i, '🪙'],
      [/меч|нож|кинжал|клин|sword|knife|dagger|blade/i, '🗡️'], [/зель|флакон|эликсир|энергет|potion|vial|elixir|fuel/i, '🧪'],
      [/амулет|кольц|медальон|amulet|ring|medallion/i, '💍'], [/верёвк|веревк|канат|rope|cord/i, '🪢'],
    ];
    function getItemIcon(name = '') {
      for (const [re, icon] of ITEM_ICONS) if (re.test(name)) return icon;
      return '✦';
    }

    // Safe Markdown parser
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
          blocks.push(`<ul>${listItems.map(item => `<li>${formatInline(item)}</li>`).join('')}</ul>`);
          listItems = [];
        }
      };
      const flushQuote = () => {
        if (quoteLines.length) {
          blocks.push(`<blockquote>${quoteLines.map(formatInline).join('<br>')}</blockquote>`);
          quoteLines = [];
        }
      };
      const flushAll = () => { flushPara(); flushList(); flushQuote(); };

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) { flushAll(); continue; }
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
          flushPara(); flushList();
          quoteLines.push(qMatch[1]);
          continue;
        }
        const liMatch = line.match(/^\s*[-*]\s+(.*)$/);
        if (liMatch) {
          flushPara(); flushQuote();
          listItems.push(liMatch[1]);
          continue;
        }
        flushList(); flushQuote();
        para.push(line);
      }
      flushAll();
      return blocks.join('') || '<p></p>';
    }

    // Variable interpolation
    function interpolate(text, vars) {
      if (!text) return '';
      return String(text).replace(/\{([a-zA-Z0-9_\u0400-\u04FF]+)\}/g, (m, k) => {
        if (!(k in vars)) return m;
        const val = vars[k];
        if (typeof val === 'boolean') return val ? t('bool_true') : t('bool_false');
        return String(val);
      });
    }

    // Condition evaluation
    function evalCondition(c, inv, vars) {
      if (c.required_item && !inv.includes(c.required_item)) {
        return { ok: false, reason: t('req_item', c.required_item) };
      }
      for (const cond of (c.conditions || [])) {
        if (!cond || typeof cond !== 'object') continue;
        if (cond.type === 'item' || cond.item) {
          const item = String(cond.item || '').trim();
          if (!item) continue;
          const has = cond.has !== false;
          if (has && !inv.includes(item)) return { ok: false, reason: t('req_item', item) };
          if (!has && inv.includes(item)) return { ok: false, reason: t('req_no_item', item) };
        } else if (cond.type === 'var' || cond.var) {
          const varName = String(cond.var || '').trim();
          if (!varName) continue;
          const cur = varName in vars ? vars[varName] : 0;
          const val = cond.value;
          const op = cond.op || '==';
          let met = false;
          if (op === '==') met = cur == val;
          else if (op === '!=') met = cur != val;
          else if (op === '>') met = Number(cur) > Number(val);
          else if (op === '>=') met = Number(cur) >= Number(val);
          else if (op === '<') met = Number(cur) < Number(val);
          else if (op === '<=') met = Number(cur) <= Number(val);
          if (!met) return { ok: false, reason: t('req_var', varName, op, val, cur) };
        }
      }
      return { ok: true };
    }

    // Theme support
    const THEMES = ['night', 'parchment', 'cyber'];
    function themeLabel(theme) {
      if (theme === 'parchment') return t('theme_parchment');
      if (theme === 'cyber') return t('theme_cyber');
      return t('theme_night');
    }

    function updateThemeBtn() {
      if (!els.themeToggle) return;
      const cur = document.documentElement.dataset.theme || 'night';
      els.themeToggle.textContent = `🎨 ${themeLabel(cur)}`;
    }

    function initTheme() {
      let saved = 'night';
      try { saved = localStorage.getItem('tq_theme') || 'night'; } catch(e) {}
      setTheme(saved);
      updateThemeBtn();
      if (els.themeToggle) {
        els.themeToggle.addEventListener('click', () => {
          const cur = document.documentElement.dataset.theme || 'night';
          const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
          setTheme(next);
          updateThemeBtn();
        });
      }
      if (els.langToggle) {
        els.langToggle.addEventListener('click', () => {
          const nextLang = getLang() === 'en' ? 'ru' : 'en';
          try { localStorage.setItem(LANG_KEY, nextLang); } catch(e) {}
          applyTranslations();
          renderScene({ instant: true });
        });
      }
    }

    function setTheme(theme) {
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('tq_theme', theme); } catch(e) {}
    }

    // Game State
    let state = {
      sceneId: QUEST.start_scene_id,
      inventory: [],
      variables: Object.assign({}, QUEST.initial_variables || {}),
      history: QUEST.start_scene_id != null ? [QUEST.start_scene_id] : [],
      steps: 0,
      status: 'playing',
      snapshots: [],
      log: [],
    };

    // DOM elements
    const els = {
      card: document.getElementById('story-card'),
      mediaBox: document.getElementById('media-box'),
      title: document.getElementById('scene-title'),
      text: document.getElementById('story-text'),
      image: document.getElementById('scene-image'),
      notice: document.getElementById('notice'),
      choices: document.getElementById('choices'),
      inventory: document.getElementById('inventory'),
      varsCard: document.getElementById('vars-card'),
      varsList: document.getElementById('vars-list'),
      steps: document.getElementById('stat-steps'),
      visited: document.getElementById('stat-visited'),
      restart: document.getElementById('restart-btn'),
      langToggle: document.getElementById('lang-toggle'),
      themeToggle: document.getElementById('theme-toggle'),
      logToggle: document.getElementById('log-toggle'),
      undoBtn: document.getElementById('undo-btn'),
      logDialog: document.getElementById('log-dialog'),
      logContent: document.getElementById('log-content'),
      closeLogBtn: document.getElementById('close-log-btn'),
      audio: document.getElementById('bg-audio'),
      audioContainer: document.getElementById('audio-container'),
      audioToggle: document.getElementById('audio-toggle'),
    };

    let typing = null;
    let currentAudioUrl = '';
    let audioMuted = false;

    function finishTyping() { if (typing) typing.finish(); }

    function updateAudioButton() {
      if (!els.audioToggle) return;
      els.audioToggle.textContent = els.audio.paused ? t('audio_off') : t('audio_on');
    }

    els.image?.addEventListener('error', () => {
      els.mediaBox.hidden = true;
    });

    function renderNotice(newItems = [], message = null) {
      const lines = newItems.map(item => `${getItemIcon(item)} ${t('item_received', item)}`);
      if (message) lines.push(message);
      if (!lines.length) {
        els.notice.hidden = true;
        return;
      }
      els.notice.innerHTML = lines.map(line => `<div>${escapeHtml(line)}</div>`).join('');
      els.notice.hidden = false;
    }

    function renderScene({ instant = false, newItems = [], message = null } = {}) {
      finishTyping();
      const scene = scenesById.get(state.sceneId);
      if (!scene) return;

      // Media
      const imgUrl = safeUrl(scene.image_url);
      if (imgUrl) {
        els.mediaBox.hidden = false;
        if (els.image.getAttribute('src') !== imgUrl) {
          els.image.src = imgUrl;
        }
      } else {
        els.mediaBox.hidden = true;
        els.image.removeAttribute('src');
      }

      const audioUrl = safeUrl(scene.audio_url, true);
      if (audioUrl) {
        els.audioContainer.hidden = false;
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
        els.audioContainer.hidden = true;
        if (currentAudioUrl) {
          els.audio.pause();
          els.audio.removeAttribute('src');
          currentAudioUrl = '';
        }
      }

      els.title.textContent = interpolate(scene.title || '', state.variables);
      els.steps.textContent = state.steps;
      els.visited.textContent = t('visited_of', state.history.length, QUEST.scenes.length);

      // Inventory
      if (!state.inventory.length) {
        els.inventory.innerHTML = `<li class="inv-empty">${escapeHtml(t('inv_empty'))}</li>`;
      } else {
        els.inventory.innerHTML = state.inventory.map(item => `
          <li class="inv-item${newItems.includes(item) ? ' new' : ''}">
            <span class="inv-icon">${getItemIcon(item)}</span>
            <span>${escapeHtml(item)}</span>
          </li>`).join('');
      }

      // Variables
      const varKeys = Object.keys(state.variables);
      if (varKeys.length) {
        els.varsCard.hidden = false;
        els.varsList.innerHTML = varKeys.map(k => {
          const rawVal = state.variables[k];
          const displayVal = typeof rawVal === 'boolean' ? (rawVal ? t('bool_true') : t('bool_false')) : rawVal;
          return `
          <li class="var-item">
            <span class="var-name">${escapeHtml(k)}</span>
            <span class="var-val">${escapeHtml(displayVal)}</span>
          </li>`;
        }).join('');
      } else {
        els.varsCard.hidden = true;
      }

      renderNotice(newItems, message);

      // Typewriter text rendering
      const rawText = interpolate(scene.text || '…', state.variables);
      const parsedHtml = renderMarkdown(rawText);
      els.text.innerHTML = parsedHtml;

      if (!instant && !reducedMotion && rawText) {
        const textNodes = [];
        let totalChars = 0;
        const walker = document.createTreeWalker(els.text, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const full = node.nodeValue;
          if (full) {
            textNodes.push({ node, full, len: full.length });
            totalChars += full.length;
            node.nodeValue = '';
          }
        }
        if (totalChars > 0) {
          els.text.classList.add('typing');
          els.card.classList.add('is-typing');
          let shown = 0;
          const speed = Math.max(1, Math.ceil(totalChars / 150));
          const done = () => {
            clearInterval(timer);
            for (const item of textNodes) item.node.nodeValue = item.full;
            els.text.classList.remove('typing');
            els.card.classList.remove('is-typing');
            typing = null;
          };
          const timer = setInterval(() => {
            shown += speed;
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
        }
      }

      if (els.undoBtn) {
        els.undoBtn.disabled = !state.snapshots || state.snapshots.length === 0;
      }
      renderLogModal();

      // Choices
      renderChoices(scene);
      save();
    }

    function hasOtherActions(actions) {
      if (!actions || typeof actions !== 'object') return false;
      if (typeof actions.take_item === 'string' && actions.take_item.trim()) return true;
      if (actions.set && typeof actions.set === 'object' && Object.keys(actions.set).length > 0) return true;
      if (actions.add && typeof actions.add === 'object' && Object.keys(actions.add).length > 0) return true;
      return false;
    }

    function renderChoices(scene) {
      els.choices.innerHTML = '';
      const visible = (scene.choices || []).filter(c => {
        const gives = c.item_given || (c.actions && typeof c.actions.give_item === 'string' && c.actions.give_item.trim());
        const stays = c.target_scene_id == null || c.target_scene_id === scene.id;
        return !(stays && gives && state.inventory.includes(gives) && !hasOtherActions(c.actions));
      });

      if (scene.ending || !visible.length) {
        const status = scene.ending || 'end';
        state.status = status;
        els.card.dataset.status = status;
        const meta = status === 'win'
          ? { icon: '🏆', title: t('win_title'), sub: t('win_sub') }
          : status === 'lose'
            ? { icon: '💀', title: t('lose_title'), sub: t('lose_sub') }
            : { icon: '📜', title: t('end_title'), sub: t('end_sub') };
        els.choices.innerHTML = `
          <div class="ending ending-${escapeHtml(status)}">
            <div class="ending-icon">${meta.icon}</div>
            <div class="ending-title">${escapeHtml(meta.title)}</div>
            <div class="ending-sub">${escapeHtml(meta.sub)}</div>
            <div class="ending-stats">${escapeHtml(t('end_stats', state.steps, state.history.length, QUEST.scenes.length, state.inventory.length))}</div>
            <div class="ending-actions">
              <button class="btn btn-primary" id="end-restart">${escapeHtml(t('play_again'))}</button>
            </div>
          </div>`;
        document.getElementById('end-restart')?.addEventListener('click', restart);
        return;
      }

      state.status = 'playing';
      els.card.dataset.status = 'playing';

      visible.forEach((c, idx) => {
        const check = evalCondition(c, state.inventory, state.variables);
        const locked = !check.ok;
        const btn = document.createElement('button');
        btn.className = 'choice-btn' + (locked ? ' locked' : '');
        btn.disabled = locked;

        let reqHtml = '';
        if (locked && check.reason) {
          reqHtml = `<span class="choice-req">🔒 ${escapeHtml(check.reason)}</span>`;
        } else if (c.required_item) {
          reqHtml = `<span class="choice-req unlocked">${getItemIcon(c.required_item)} ${escapeHtml(c.required_item)}</span>`;
        }

        const choiceText = interpolate(c.text || '…', state.variables);
        btn.innerHTML = `
          <span class="choice-key">${idx < 9 ? idx + 1 : '•'}</span>
          <span class="choice-text">${escapeHtml(choiceText)}</span>
          ${reqHtml}
        `;
        btn.addEventListener('click', () => choose(c));
        els.choices.appendChild(btn);
      });
    }

    function choose(c) {
      finishTyping();

      if (!Array.isArray(state.snapshots)) state.snapshots = [];
      if (!Array.isArray(state.log)) state.log = [];
      state.snapshots.push({
        sceneId: state.sceneId,
        inventory: [...state.inventory],
        variables: Object.assign({}, state.variables),
        history: [...state.history],
        steps: state.steps,
        status: state.status,
        log: [...state.log],
      });
      if (state.snapshots.length > 50) state.snapshots.shift();

      const curScene = scenesById.get(state.sceneId);
      state.log.push({
        scene_title: curScene ? (curScene.title || t('scene_fallback', curScene.id)) : 'Scene',
        choice_text: interpolate(c.text || '…', state.variables),
      });

      const newItems = [];
      const giveAct = c.actions && typeof c.actions.give_item === 'string' ? c.actions.give_item.trim() : null;
      const gives = c.item_given || giveAct;
      if (gives && !state.inventory.includes(gives)) {
        state.inventory.push(gives);
        newItems.push(gives);
      }
      const takeAct = c.actions && typeof c.actions.take_item === 'string' ? c.actions.take_item.trim() : null;
      if (takeAct && state.inventory.includes(takeAct)) {
        state.inventory = state.inventory.filter(i => i !== takeAct);
      }
      if (c.actions && typeof c.actions === 'object') {
        if (c.actions.set && typeof c.actions.set === 'object') {
          Object.assign(state.variables, c.actions.set);
        }
        if (c.actions.add && typeof c.actions.add === 'object') {
          for (const [k, v] of Object.entries(c.actions.add)) {
            const added = Math.round(((Number(state.variables[k]) || 0) + (Number(v) || 0)) * 1e10) / 1e10;
            state.variables[k] = added;
          }
        }
      }

      let message = null;
      state.steps += 1;
      const sameScene = c.target_scene_id == null || c.target_scene_id === state.sceneId;
      if (!sameScene) {
        state.sceneId = c.target_scene_id;
        if (!state.history.includes(state.sceneId)) state.history.push(state.sceneId);
      } else if (!newItems.length) {
        message = t('action_done');
      }
      if (!sameScene) window.scrollTo({ top: 0, behavior: 'smooth' });
      renderScene({ instant: sameScene, newItems, message });
    }

    function save() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
    }

    function undoStep() {
      if (!state.snapshots || state.snapshots.length === 0) return;
      const snap = state.snapshots.pop();
      state.sceneId = snap.sceneId;
      state.inventory = snap.inventory;
      state.variables = snap.variables;
      state.history = snap.history;
      state.steps = snap.steps;
      state.status = snap.status;
      state.log = snap.log || [];
      save();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      renderScene({ instant: true, message: t('move_undone') });
    }

    function renderLogModal() {
      if (!els.logContent) return;
      const entries = state.log || [];
      if (!entries.length) {
        els.logContent.innerHTML = `<p class="muted">${escapeHtml(t('log_empty'))}</p>`;
        return;
      }
      const ol = document.createElement('ol');
      entries.forEach(entry => {
        const li = document.createElement('li');
        const titleSpan = document.createElement('span');
        titleSpan.className = 'log-scene-title';
        titleSpan.textContent = entry.scene_title + ':';
        const textSpan = document.createElement('span');
        textSpan.className = 'log-choice-text';
        textSpan.textContent = entry.choice_text;
        li.appendChild(titleSpan);
        li.appendChild(document.createTextNode(' '));
        li.appendChild(textSpan);
        ol.appendChild(li);
      });
      els.logContent.innerHTML = '';
      els.logContent.appendChild(ol);
    }

    function restart() {
      try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
      state = {
        sceneId: QUEST.start_scene_id,
        inventory: [],
        variables: Object.assign({}, QUEST.initial_variables || {}),
        history: QUEST.start_scene_id != null ? [QUEST.start_scene_id] : [],
        steps: 0,
        status: 'playing',
        snapshots: [],
        log: [],
      };
      window.scrollTo({ top: 0, behavior: 'smooth' });
      renderScene({ instant: false });
    }

    els.card.addEventListener('click', finishTyping);
    els.restart.addEventListener('click', () => {
      if (state.status === 'playing' && state.steps > 0 && !confirm(t('restart_confirm'))) return;
      restart();
    });

    els.undoBtn?.addEventListener('click', undoStep);
    els.logToggle?.addEventListener('click', () => {
      renderLogModal();
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

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest('input, textarea, select')) return;
      if (typing && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        finishTyping();
        return;
      }
      if ((e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.key === 'Я') && state.snapshots && state.snapshots.length > 0 && !typing) {
        e.preventDefault();
        undoStep();
        return;
      }
      if (/^[1-9]$/.test(e.key) && !typing) {
        const btns = els.choices.querySelectorAll('.choice-btn:not(:disabled)');
        const idx = Number(e.key) - 1;
        if (btns[idx]) btns[idx].click();
      }
    });

    // Restore saved state
    let restored = false;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && scenesById.has(parsed.sceneId)) {
          state = {
            sceneId: parsed.sceneId,
            inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
            variables: (parsed.variables && typeof parsed.variables === 'object')
              ? parsed.variables
              : Object.assign({}, QUEST.initial_variables || {}),
            history: Array.isArray(parsed.history) ? parsed.history : [parsed.sceneId],
            steps: Number(parsed.steps) || 0,
            status: parsed.status || 'playing',
            snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
            log: Array.isArray(parsed.log) ? parsed.log : [],
          };
          restored = true;
        }
      }
    } catch(e) {}
    initTheme();
    applyTranslations();
    renderScene({ instant: restored });
  })();
  </script>
</body>
</html>
"""


def _safe_json_for_script(data: Any) -> str:
    """Serializes data into JSON while escaping sequences that could close a <script> tag."""
    raw = json.dumps(data, ensure_ascii=False)
    return (
        raw
        .replace("</", "<\\/")
        .replace("\u2028", "\\u2028")
        .replace("\u2029", "\\u2029")
    )


_TEMPLATE_TOKEN_RE = re.compile(r"__(QUEST_TITLE|CSS_CONTENT|QUEST_JSON)__")


def generate_standalone_html(quest: Quest, scenes: list[Scene], choices: list[Choice]) -> str:
    quest_data = quest_to_dict(quest, scenes, choices)
    replacements = {
        "QUEST_TITLE": html.escape(quest.title),
        "CSS_CONTENT": get_embedded_css().replace("</style", "<\\/style"),
        "QUEST_JSON": _safe_json_for_script(quest_data),
    }
    return _TEMPLATE_TOKEN_RE.sub(lambda m: replacements[m.group(1)], HTML_TEMPLATE)

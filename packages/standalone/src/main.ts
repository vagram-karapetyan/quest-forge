import { formatStructuredMessage, t } from '@quest-forge/engine/i18n';
import { escapeHtml } from '@quest-forge/engine/markdown';
import {
  applyChoice,
  createInitialState,
  getGameView,
  undoStep,
  type GameState,
  type StructuredMessage,
} from '@quest-forge/engine/runtime';
import {
  APP_LOCALES,
  APP_THEMES,
  type AppLocale,
  type AppTheme,
  type PortableQuestExport,
  type Quest,
} from '@quest-forge/engine/schema';

type StandalonePayload = {
  quest: PortableQuestExport;
  locale: AppLocale;
  theme: AppTheme;
  appVersion: string;
};

type SavedStandaloneSession = {
  state: GameState;
  locale: AppLocale;
  theme: AppTheme;
};

function computeQuestHash(quest: PortableQuestExport): string {
  const input = `${quest.title}:${quest.scenes.length}:${quest.startSceneId ?? ''}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function hydrateQuest(portable: PortableQuestExport): Quest {
  const questId = 'standalone-quest';
  return {
    id: questId,
    title: portable.title,
    description: portable.description,
    startSceneId: portable.startSceneId,
    initialVariables: { ...portable.initialVariables },
    scenes: portable.scenes.map((scene) => ({
      id: scene.id,
      questId,
      title: scene.title,
      body: scene.body,
      ending: scene.ending,
      posX: scene.posX,
      posY: scene.posY,
      imageUrl: scene.imageUrl,
      audioUrl: scene.audioUrl,
      choices: scene.choices.map((choice) => ({
        id: choice.id,
        sceneId: scene.id,
        targetSceneId: choice.targetSceneId,
        text: choice.text,
        sortOrder: choice.sortOrder,
        conditions: choice.conditions,
        effects: choice.effects,
      })),
    })),
  };
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors under restricted file:// contexts
  }
}

function bootstrap(): void {
  const root = document.getElementById('qf-standalone-root');
  const dataEl = document.getElementById('qf-quest-data');
  if (!root || !dataEl?.textContent) {
    return;
  }

  const payload = JSON.parse(dataEl.textContent) as StandalonePayload;
  const quest = hydrateQuest(payload.quest);
  const storageKey = `qf_standalone_v2_${computeQuestHash(payload.quest)}`;

  let locale: AppLocale = payload.locale;
  let theme: AppTheme = payload.theme;
  let state: GameState | null = null;
  let lastNewItems: string[] = [];
  let lastNotices: StructuredMessage[] = [];
  let audioMuted = false;
  let currentAudioUrl: string | null = null;
  let typewriterTimer: number | null = null;
  let revealedFullSceneId: string | null = null;

  const audioEl = document.createElement('audio');
  audioEl.loop = true;
  audioEl.preload = 'none';

  const savedRaw = readStorage(storageKey);
  if (savedRaw) {
    try {
      const saved = JSON.parse(savedRaw) as Partial<SavedStandaloneSession>;
      if (saved.locale && APP_LOCALES.includes(saved.locale)) {
        locale = saved.locale;
      }
      if (saved.theme && APP_THEMES.includes(saved.theme)) {
        theme = saved.theme;
      }
      if (saved.state && typeof saved.state.currentSceneId === 'string') {
        const sceneExists = quest.scenes.some((s) => s.id === saved.state?.currentSceneId);
        if (sceneExists) {
          state = saved.state;
        }
      }
    } catch {
      // Ignore corrupt saved state
    }
  }

  if (!state) {
    const startRes = createInitialState(quest);
    if (!startRes.ok) {
      root.innerHTML = `<main class="qf-container"><div class="qf-card"><p>${escapeHtml(
        formatStructuredMessage(locale, { code: startRes.code, params: startRes.params }),
      )}</p></div></main>`;
      return;
    }
    state = startRes.state;
  }

  function persist(): void {
    if (!state) {
      return;
    }
    const data: SavedStandaloneSession = { state, locale, theme };
    writeStorage(storageKey, JSON.stringify(data));
  }

  function applyThemeAndLocale(): void {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('lang', locale);
  }

  function syncAudio(audioUrl: string | null): void {
    if (audioUrl !== currentAudioUrl) {
      currentAudioUrl = audioUrl;
      if (audioUrl) {
        audioEl.src = audioUrl;
        audioEl.muted = audioMuted;
        if (!audioMuted) {
          void audioEl.play().catch(() => {
            // Browser autoplay policy may wait for user gesture
          });
        }
      } else {
        audioEl.pause();
        audioEl.removeAttribute('src');
      }
    } else {
      audioEl.muted = audioMuted;
      if (audioUrl && !audioMuted && audioEl.paused) {
        void audioEl.play().catch(() => {
          // Ignore autoplay restriction
        });
      }
    }
  }

  function clearTypewriter(): void {
    if (typewriterTimer !== null) {
      window.clearInterval(typewriterTimer);
      typewriterTimer = null;
    }
  }

  function skipTypewriter(bodyEl: HTMLElement | null, fullHtml: string, sceneId: string): void {
    clearTypewriter();
    revealedFullSceneId = sceneId;
    if (bodyEl) {
      bodyEl.innerHTML = fullHtml;
    }
  }

  function handleChoice(choiceId: string): void {
    if (!state) {
      return;
    }
    const res = applyChoice(quest, state, choiceId, locale);
    if (!res.ok) {
      return;
    }
    state = res.state;
    lastNewItems = res.newItems;
    lastNotices = res.notices;
    persist();
    render();
  }

  function handleUndo(): void {
    if (!state) {
      return;
    }
    const res = undoStep(state);
    if (!res.ok) {
      return;
    }
    state = res.state;
    lastNewItems = [];
    lastNotices = [];
    persist();
    render();
  }

  function handleRestart(): void {
    const startRes = createInitialState(quest);
    if (!startRes.ok) {
      return;
    }
    state = startRes.state;
    lastNewItems = [];
    lastNotices = [];
    revealedFullSceneId = null;
    persist();
    render();
  }

  function render(): void {
    if (!root || !state) {
      return;
    }
    applyThemeAndLocale();
    clearTypewriter();

    const view = getGameView(quest, state, locale);
    syncAudio(view.scene.audioUrl);

    const themeButtons = APP_THEMES.map(
      (th) =>
        `<button type="button" class="qf-btn ${th === theme ? 'qf-btn-primary' : ''}" data-action="theme" data-value="${th}">${escapeHtml(
          t(locale, `theme.${th}`),
        )}</button>`,
    ).join('');

    const langButtons = APP_LOCALES.map(
      (ln) =>
        `<button type="button" class="qf-btn ${ln === locale ? 'qf-btn-primary' : ''}" data-action="locale" data-value="${ln}">${escapeHtml(
          t(locale, `lang.${ln}`),
        )}</button>`,
    ).join('');

    const audioBtn = view.scene.audioUrl
      ? `<button type="button" class="qf-btn" data-action="toggle-audio">${escapeHtml(
          t(locale, audioMuted ? 'player.audioUnmute' : 'player.audioMute'),
        )}</button>`
      : '';

    const noticesHtml =
      lastNewItems.length > 0 || lastNotices.length > 0
        ? `<div class="qf-toast-stack">${lastNewItems
            .map(
              (item) =>
                `<span class="qf-badge qf-badge-new">+ ${escapeHtml(t(locale, 'player.newItem'))}: ${escapeHtml(item)}</span>`,
            )
            .join('')}${lastNotices
            .map(
              (msg) =>
                `<span class="qf-badge qf-badge-info">${escapeHtml(formatStructuredMessage(locale, msg))}</span>`,
            )
            .join('')}</div>`
        : '';

    const imageHtml = view.scene.imageUrl
      ? `<img class="qf-scene-illustration" src="${escapeHtml(view.scene.imageUrl)}" alt="${escapeHtml(
          view.scene.title,
        )}" />`
      : '';

    const endingBannerHtml =
      view.status !== 'playing'
        ? `<div class="qf-ending-banner ${view.status}">
            <strong>${escapeHtml(t(locale, `player.ending.${view.status}`))}</strong>
            <div class="qf-controls-row" style="margin-top: 0.75rem;">
              <button type="button" class="qf-btn qf-btn-primary" data-action="restart">${escapeHtml(
                t(locale, 'player.restart'),
              )}</button>
              ${
                view.canUndo
                  ? `<button type="button" class="qf-btn" data-action="undo">${escapeHtml(
                      t(locale, 'player.undo'),
                    )} (Z)</button>`
                  : ''
              }
            </div>
          </div>`
        : '';

    const choicesHtml =
      view.status === 'playing'
        ? `<div class="qf-choices">${view.choices
            .map((choice, idx) => {
              const hotkey = idx < 9 ? String(idx + 1) : '•';
              const lockHtml =
                !choice.available && choice.lockReasons.length > 0
                  ? `<span class="qf-lock-reason">${choice.lockReasons
                      .map((r) => escapeHtml(formatStructuredMessage(locale, r)))
                      .join(' · ')}</span>`
                  : '';
              return `<button type="button" class="qf-btn qf-choice-btn ${
                choice.available ? '' : 'qf-choice-locked'
              }" data-action="choice" data-choice-id="${escapeHtml(choice.id)}" ${
                choice.available ? '' : 'disabled'
              }>
                <span class="qf-choice-index">${hotkey}</span>
                <span>${escapeHtml(choice.text)}${lockHtml}</span>
              </button>`;
            })
            .join('')}</div>`
        : '';

    const inventoryHtml =
      view.inventory.length > 0
        ? `<div class="qf-pill-list">${view.inventory
            .map(
              (item) =>
                `<span class="qf-badge ${
                  lastNewItems.includes(item) ? 'qf-badge-new' : ''
                }">${escapeHtml(item)}</span>`,
            )
            .join('')}</div>`
        : `<p style="margin:0;color:var(--text-muted);font-size:0.9rem;">${escapeHtml(
            t(locale, 'player.inventoryEmpty'),
          )}</p>`;

    const varEntries = Object.entries(view.variables);
    const variablesHtml =
      varEntries.length > 0
        ? `<ul class="qf-var-list">${varEntries
            .map(([k, v]) => {
              const formatted =
                typeof v === 'boolean'
                  ? locale === 'ru'
                    ? v
                      ? 'да'
                      : 'нет'
                    : v
                      ? 'yes'
                      : 'no'
                  : String(v);
              return `<li class="qf-var-row"><span class="qf-mono">${escapeHtml(
                k,
              )}</span><strong class="qf-mono">${escapeHtml(formatted)}</strong></li>`;
            })
            .join('')}</ul>`
        : `<p style="margin:0;color:var(--text-muted);font-size:0.9rem;">${escapeHtml(
            t(locale, 'player.variablesEmpty'),
          )}</p>`;

    const logHtml =
      view.log.length > 0
        ? `<ul class="qf-log-list">${[...view.log]
            .reverse()
            .map(
              (entry) =>
                `<li class="qf-log-entry"><small class="qf-mono">#${entry.step}</small> <strong>${escapeHtml(
                  entry.sceneTitle,
                )}</strong> → ${escapeHtml(entry.choiceText)}</li>`,
            )
            .join('')}</ul>`
        : `<p style="margin:0;color:var(--text-muted);font-size:0.9rem;">${escapeHtml(
            t(locale, 'player.logEmpty'),
          )}</p>`;

    root.innerHTML = `
      <header class="qf-topbar">
        <div class="qf-brand">
          <span>${escapeHtml(quest.title)}</span>
          <span class="qf-badge qf-badge-info">${escapeHtml(t(locale, 'player.offlineBadge'))}</span>
        </div>
        <div class="qf-controls-row">
          ${audioBtn}
          <button type="button" class="qf-btn" data-action="undo" ${
            view.canUndo ? '' : 'disabled'
          }>${escapeHtml(t(locale, 'player.undo'))} (Z)</button>
          <button type="button" class="qf-btn" data-action="restart">${escapeHtml(
            t(locale, 'player.restart'),
          )}</button>
          ${themeButtons}
          ${langButtons}
        </div>
      </header>
      <main class="qf-container">
        <div class="qf-player-grid">
          <section class="qf-card">
            ${noticesHtml}
            ${imageHtml}
            <h1 class="qf-scene-title">${escapeHtml(view.scene.title)}</h1>
            <div id="qf-scene-body" class="qf-narrative"></div>
            ${choicesHtml}
            ${endingBannerHtml}
            <p style="margin:1.25rem 0 0;color:var(--text-muted);font-size:0.82rem;">${escapeHtml(
              t(locale, 'player.hotkeysHint'),
            )}</p>
          </section>
          <aside class="qf-card">
            <div class="qf-sidebar-section" style="margin-top:0;padding-top:0;border-top:none;">
              <div class="qf-controls-row" style="justify-content:space-between;">
                <span class="qf-badge">${escapeHtml(t(locale, 'player.steps'))}: ${view.steps}</span>
                <span class="qf-badge">${escapeHtml(t(locale, 'player.visited'))}: ${
                  view.visitedSceneIds.length
                }/${view.totalScenes}</span>
              </div>
            </div>
            <div class="qf-sidebar-section">
              <h2 class="qf-sidebar-title">${escapeHtml(t(locale, 'player.inventory'))}</h2>
              ${inventoryHtml}
            </div>
            <div class="qf-sidebar-section">
              <h2 class="qf-sidebar-title">${escapeHtml(t(locale, 'player.variables'))}</h2>
              ${variablesHtml}
            </div>
            <div class="qf-sidebar-section">
              <h2 class="qf-sidebar-title">${escapeHtml(t(locale, 'player.log'))}</h2>
              ${logHtml}
            </div>
          </aside>
        </div>
      </main>
    `;

    const bodyEl = document.getElementById('qf-scene-body');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const shouldAnimate =
      !prefersReducedMotion &&
      revealedFullSceneId !== view.scene.id &&
      view.scene.bodyMarkdown.length > 0;

    if (bodyEl) {
      if (!shouldAnimate) {
        revealedFullSceneId = view.scene.id;
        bodyEl.innerHTML = view.scene.bodyHtml;
      } else {
        const plain = view.scene.bodyMarkdown;
        let cursor = 0;
        const stepSize = Math.max(2, Math.ceil(plain.length / 45));
        const pEl = document.createElement('p');
        bodyEl.appendChild(pEl);

        typewriterTimer = window.setInterval(() => {
          cursor = Math.min(plain.length, cursor + stepSize);
          pEl.textContent = plain.slice(0, cursor);
          if (cursor >= plain.length) {
            skipTypewriter(bodyEl, view.scene.bodyHtml, view.scene.id);
          }
        }, 16);

        bodyEl.addEventListener(
          'click',
          () => {
            skipTypewriter(bodyEl, view.scene.bodyHtml, view.scene.id);
          },
          { once: true },
        );
      }
    }

    root.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'choice' && btn.dataset.choiceId) {
          handleChoice(btn.dataset.choiceId);
        } else if (action === 'undo') {
          handleUndo();
        } else if (action === 'restart') {
          handleRestart();
        } else if (action === 'theme' && btn.dataset.value) {
          theme = btn.dataset.value as AppTheme;
          persist();
          render();
        } else if (action === 'locale' && btn.dataset.value) {
          locale = btn.dataset.value as AppLocale;
          persist();
          render();
        } else if (action === 'toggle-audio') {
          audioMuted = !audioMuted;
          syncAudio(view.scene.audioUrl);
          render();
        }
      });
    });
  }

  window.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }

    if (!state) {
      return;
    }

    if (event.code === 'Space' || event.code === 'Enter') {
      if (typewriterTimer !== null) {
        event.preventDefault();
        const view = getGameView(quest, state, locale);
        const bodyEl = document.getElementById('qf-scene-body');
        skipTypewriter(bodyEl, view.scene.bodyHtml, view.scene.id);
        return;
      }
    }

    if (event.code === 'KeyZ' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      handleUndo();
      return;
    }

    const digitMatch = /^Digit([1-9])$/.exec(event.code);
    if (digitMatch) {
      const idx = Number(digitMatch[1]) - 1;
      const view = getGameView(quest, state, locale);
      const choice = view.choices[idx];
      if (choice && choice.available && view.status === 'playing') {
        event.preventDefault();
        handleChoice(choice.id);
      }
    }
  });

  render();
}

bootstrap();

import { api, h, initTheme, plural, toast } from './api.js';

const grid = document.getElementById('quest-grid');
const countEl = document.getElementById('quest-count');
const searchInput = document.getElementById('search-input');
const dialog = document.getElementById('new-quest-dialog');
const form = document.getElementById('new-quest-form');
const importBtn = document.getElementById('import-btn');
const importInput = document.getElementById('import-input');

const loginDialog = document.getElementById('login-dialog');
const loginForm = document.getElementById('login-form');
const cancelLogin = document.getElementById('cancel-login');

let authState = { auth_required: false, is_authenticated: true, username: null };
let pendingRedirect = null;
let allQuests = [];

function openLoginDialog(nextUrl = null) {
  if (!loginDialog) return;
  pendingRedirect = typeof nextUrl === 'string' ? nextUrl : null;
  loginForm.reset();
  loginDialog.showModal();
  loginForm.elements.password.focus();
}

if (cancelLogin && loginDialog) {
  cancelLogin.addEventListener('click', () => {
    pendingRedirect = null;
    loginDialog.close();
  });
}

if (loginForm && loginDialog) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = loginForm.elements.username.value.trim() || undefined;
    const password = loginForm.elements.password.value;
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: { username, password },
      });
      toast(`Добро пожаловать, ${res.username || 'автор'}!`, 'success');
      loginDialog.close();
      await checkAuth();
      if (pendingRedirect && pendingRedirect.startsWith('/')) {
        const target = pendingRedirect;
        pendingRedirect = null;
        location.href = target;
      }
    } catch (err) {
      toast(err.message || 'Неверный пароль', 'error');
    }
  });
}

async function checkAuth() {
  try {
    authState = await api('/api/auth/status');
    renderAuthUI();
  } catch {
    // В случае ошибки оставляем поведение по умолчанию
  }
}

function renderAuthUI() {
  const container = document.getElementById('auth-actions');
  if (!container) return;
  if (!authState.auth_required) {
    container.replaceChildren();
    return;
  }

  if (authState.is_authenticated) {
    const userLabel = h('span', { class: 'muted', style: 'font-size: 0.85rem' }, `👤 ${authState.username || 'Автор'}`);
    const logoutBtn = h('button', {
      class: 'btn btn-ghost btn-sm',
      onclick: async () => {
        await api('/api/auth/logout', { method: 'POST' });
        toast('Вы вышли из режима автора', 'info');
        await checkAuth();
      },
    }, 'Выйти');
    container.replaceChildren(userLabel, logoutBtn);
  } else {
    const loginBtn = h('button', {
      class: 'btn btn-ghost btn-sm',
      onclick: () => openLoginDialog(),
    }, '🔑 Вход для автора');
    container.replaceChildren(loginBtn);
  }
}

function openDialog() {
  if (authState.auth_required && !authState.is_authenticated) {
    toast('Для создания квестов требуется войти в систему как автор', 'info');
    openLoginDialog();
    return;
  }
  form.reset();
  dialog.showModal();
  form.elements.title.focus();
}

function questCard(q) {
  const scenes = `📜 ${q.scene_count} ${plural(q.scene_count, ['сцена', 'сцены', 'сцен'])}`;
  return h('article', { class: 'card quest-card', dataset: { questId: q.id } },
    h('div', { style: 'display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;' },
      h('h3', { class: 'quest-card-title', style: 'margin: 0;' }, q.title),
      h('span', { class: 'chip', title: `ID квеста в базе: ${q.id}`, style: 'font-size: 0.75rem; opacity: 0.7;' }, `#${q.id}`),
    ),
    h('p', { class: 'quest-card-desc' }, q.description || 'Автор пока не добавил описание.'),
    h('div', { class: 'quest-card-meta' },
      h('span', { class: 'chip' }, scenes),
      q.win_endings ? h('span', { class: 'chip', title: 'Победные концовки' }, `🏆 ${q.win_endings}`) : null,
      q.lose_endings ? h('span', { class: 'chip', title: 'Ловушки и поражения' }, `💀 ${q.lose_endings}`) : null,
      Object.keys(q.initial_variables || {}).length
        ? h('span', { class: 'chip', title: 'Переменные' }, `📊 ${Object.keys(q.initial_variables).length}`)
        : null,
    ),
    h('div', { class: 'quest-card-actions' },
      h('div', { class: 'quest-card-actions-main' },
        q.playable
          ? h('a', { class: 'btn btn-primary', href: `/play/${q.id}` }, '▶ Играть')
          : h('span', { class: 'btn btn-primary disabled', title: 'Не выбрана стартовая сцена' }, '▶ Играть'),
        h('a', {
          class: 'btn btn-ghost',
          href: `/builder/${q.id}`,
          onclick: (e) => {
            if (authState.auth_required && !authState.is_authenticated) {
              e.preventDefault();
              toast('Для перехода в конструктор войдите как автор', 'info');
              openLoginDialog(`/builder/${q.id}`);
            }
          },
        }, '✎ Конструктор'),
      ),
      h('div', { class: 'quest-card-actions-sub' },
        h('a', { class: 'btn btn-ghost btn-sm', href: `/api/quests/${q.id}/export/html`, title: 'Скачать автономную игру для запуска без сервера' }, '📦 Офлайн HTML'),
        h('a', { class: 'btn btn-ghost btn-sm', href: `/api/quests/${q.id}/export/json`, title: 'Экспорт квеста в JSON' }, '💾 JSON'),
        h('button', {
          class: 'btn btn-ghost btn-sm btn-icon-sub',
          title: 'Создать копию квеста',
          'aria-label': 'Создать копию квеста',
          onclick: async () => {
            if (authState.auth_required && !authState.is_authenticated) {
              toast('Для дублирования квеста войдите как автор', 'info');
              openLoginDialog();
              return;
            }
            try {
              const dup = await api(`/api/quests/${q.id}/duplicate`, { method: 'POST' });
              toast(`Создана копия: «${dup.title}»`, 'success');
              await load();
            } catch (err) {
              toast(`Ошибка копирования: ${err.message}`, 'error');
            }
          },
        }, '📋'),
        h('button', {
          class: 'btn btn-danger btn-sm btn-icon-sub',
          title: 'Удалить квест',
          'aria-label': 'Удалить квест',
          onclick: async () => {
            if (authState.auth_required && !authState.is_authenticated) {
              toast('Для удаления квестов требуется войти в систему как автор', 'info');
              openLoginDialog();
              return;
            }
            if (!confirm(`Вы действительно хотите удалить квест «${q.title}» (#${q.id}) со всеми сценами?`)) return;
            try {
              await api(`/api/quests/${q.id}`, { method: 'DELETE' });
              toast(`Квест «${q.title}» удалён`, 'info');
              await load();
            } catch (err) {
              toast(`Не удалось удалить квест: ${err.message}`, 'error');
            }
          },
        }, '🗑'),
      ),
    ),
  );
}

function renderFilteredQuests() {
  const query = (searchInput?.value || '').trim().toLowerCase();
  const filtered = query
    ? allQuests.filter((q) => q.title.toLowerCase().includes(query) || (q.description || '').toLowerCase().includes(query))
    : allQuests;

  countEl.textContent = filtered.length ? `${filtered.length} ${plural(filtered.length, ['квест', 'квеста', 'квестов'])}` : '';
  if (!filtered.length) {
    grid.replaceChildren(h('div', { class: 'card empty' },
      query ? 'По запросу ничего не найдено.' : 'Пока нет ни одного квеста. Станьте первым автором!',
    ));
    return;
  }
  grid.replaceChildren(...filtered.map(questCard));
}

async function load() {
  try {
    allQuests = await api('/api/quests');
    renderFilteredQuests();
  } catch (e) {
    grid.replaceChildren(h('div', { class: 'card empty' }, `Не удалось загрузить квесты: ${e.message}`));
  }
}

searchInput?.addEventListener('input', () => {
  renderFilteredQuests();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = form.elements.title.value.trim();
  const description = form.elements.description.value.trim();
  if (!title) {
    form.elements.title.focus();
    return;
  }
  const submit = form.querySelector('[type=submit]');
  submit.disabled = true;
  try {
    const quest = await api('/api/quests', { method: 'POST', body: { title, description } });
    location.href = `/builder/${quest.id}`;
  } catch (e) {
    toast(e.message, 'error');
    submit.disabled = false;
  }
});

document.getElementById('create-btn').addEventListener('click', openDialog);
document.getElementById('cancel-create').addEventListener('click', () => dialog.close());

if (importBtn && importInput) {
  importBtn.addEventListener('click', () => {
    if (authState.auth_required && !authState.is_authenticated) {
      toast('Для импорта квестов требуется войти в систему как автор', 'info');
      openLoginDialog();
      return;
    }
    importInput.click();
  });
  importInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const imported = await api('/api/quests/import', { method: 'POST', body: payload });
      toast(`Квест «${imported.title}» успешно импортирован!`, 'success');
      location.href = `/builder/${imported.id}`;
    } catch (err) {
      toast(`Ошибка импорта: ${err.message}`, 'error');
    } finally {
      importInput.value = '';
    }
  });
}

const initParams = new URLSearchParams(location.search);
if (initParams.has('new')) {
  history.replaceState(null, '', '/');
  openDialog();
} else if (initParams.has('login')) {
  const nextUrl = initParams.get('next');
  history.replaceState(null, '', '/');
  openLoginDialog(nextUrl);
}

// Перезагрузка при возврате назад/вперёд по истории (BFCache)
window.addEventListener('pageshow', () => {
  load();
  checkAuth();
});

// Автоматическое обновление данных при переключении на вкладку
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    load();
    checkAuth();
  }
});

initTheme();
checkAuth();
load();

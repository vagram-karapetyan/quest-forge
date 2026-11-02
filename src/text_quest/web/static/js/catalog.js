import { api, h, initTheme, plural, t, toast } from './api.js';

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
let hasLoaded = false;

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
      toast(t('auth_welcome', res.username || t('auth_author_default')), 'success');
      loginDialog.close();
      await checkAuth();
      if (pendingRedirect && pendingRedirect.startsWith('/')) {
        const target = pendingRedirect;
        pendingRedirect = null;
        location.href = target;
      }
    } catch (err) {
      toast(err.message || t('auth_bad_pass'), 'error');
    }
  });
}

async function checkAuth() {
  try {
    authState = await api('/api/auth/status');
    renderAuthUI();
  } catch {
    // Keep default behavior on network failure
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
    const userLabel = h('span', { class: 'muted', style: 'font-size: 0.85rem' }, `👤 ${authState.username || t('auth_author_default')}`);
    const logoutBtn = h('button', {
      class: 'btn btn-ghost btn-sm',
      onclick: async () => {
        await api('/api/auth/logout', { method: 'POST' });
        toast(t('auth_logged_out'), 'info');
        await checkAuth();
      },
    }, t('auth_logout_btn'));
    container.replaceChildren(userLabel, logoutBtn);
  } else {
    const loginBtn = h('button', {
      class: 'btn btn-ghost btn-sm',
      onclick: () => openLoginDialog(),
    }, t('auth_login_btn'));
    container.replaceChildren(loginBtn);
  }
}

function openDialog() {
  if (authState.auth_required && !authState.is_authenticated) {
    toast(t('auth_need_login_create'), 'info');
    openLoginDialog();
    return;
  }
  form.reset();
  dialog.showModal();
  form.elements.title.focus();
}

function questCard(q) {
  const scenes = `📜 ${q.scene_count} ${plural(q.scene_count, ['сцена', 'сцены', 'сцен'], ['scene', 'scenes'])}`;
  return h('article', { class: 'card quest-card', dataset: { questId: q.id } },
    h('div', { style: 'display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;' },
      h('h3', { class: 'quest-card-title', style: 'margin: 0;' }, q.title),
      h('span', { class: 'chip', title: t('cat_quest_id_title', q.id), style: 'font-size: 0.75rem; opacity: 0.7;' }, `#${q.id}`),
    ),
    h('p', { class: 'quest-card-desc' }, q.description || t('cat_no_desc')),
    h('div', { class: 'quest-card-meta' },
      h('span', { class: 'chip' }, scenes),
      q.win_endings ? h('span', { class: 'chip', title: t('cat_win_endings_title') }, `🏆 ${q.win_endings}`) : null,
      q.lose_endings ? h('span', { class: 'chip', title: t('cat_lose_endings_title') }, `💀 ${q.lose_endings}`) : null,
      Object.keys(q.initial_variables || {}).length
        ? h('span', { class: 'chip', title: t('cat_vars_title') }, `📊 ${Object.keys(q.initial_variables).length}`)
        : null,
    ),
    h('div', { class: 'quest-card-actions' },
      h('div', { class: 'quest-card-actions-main' },
        q.playable
          ? h('a', { class: 'btn btn-primary', href: `/play/${q.id}` }, t('cat_play_btn'))
          : h('span', { class: 'btn btn-primary disabled', title: t('cat_play_disabled_title') }, t('cat_play_btn')),
        h('a', {
          class: 'btn btn-ghost',
          href: `/builder/${q.id}`,
          onclick: (e) => {
            if (authState.auth_required && !authState.is_authenticated) {
              e.preventDefault();
              toast(t('auth_need_login_builder'), 'info');
              openLoginDialog(`/builder/${q.id}`);
            }
          },
        }, t('cat_builder_btn')),
      ),
      h('div', { class: 'quest-card-actions-sub' },
        h('a', { class: 'btn btn-ghost btn-sm', href: `/api/quests/${q.id}/export/html`, title: t('cat_offline_html_title') }, t('cat_offline_html_btn')),
        h('a', { class: 'btn btn-ghost btn-sm', href: `/api/quests/${q.id}/export/json`, title: t('cat_export_json_title') }, '💾 JSON'),
        h('button', {
          class: 'btn btn-ghost btn-sm btn-icon-sub',
          title: t('cat_dup_title'),
          'aria-label': t('cat_dup_title'),
          onclick: async () => {
            if (authState.auth_required && !authState.is_authenticated) {
              toast(t('auth_need_login_dup'), 'info');
              openLoginDialog();
              return;
            }
            try {
              const dup = await api(`/api/quests/${q.id}/duplicate`, { method: 'POST' });
              toast(t('cat_dup_success', dup.title), 'success');
              await load();
            } catch (err) {
              toast(t('cat_dup_error', err.message), 'error');
            }
          },
        }, '📋'),
        h('button', {
          class: 'btn btn-danger btn-sm btn-icon-sub',
          title: t('cat_del_title'),
          'aria-label': t('cat_del_title'),
          onclick: async () => {
            if (authState.auth_required && !authState.is_authenticated) {
              toast(t('auth_need_login_del'), 'info');
              openLoginDialog();
              return;
            }
            if (!confirm(t('cat_del_confirm', q.title, q.id))) return;
            try {
              await api(`/api/quests/${q.id}`, { method: 'DELETE' });
              toast(t('cat_del_success', q.title), 'info');
              await load();
            } catch (err) {
              toast(t('cat_del_error', err.message), 'error');
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

  countEl.textContent = filtered.length ? `${filtered.length} ${plural(filtered.length, ['квест', 'квеста', 'квестов'], ['quest', 'quests'])}` : '';
  if (!filtered.length) {
    grid.replaceChildren(h('div', { class: 'card empty' },
      query ? t('cat_empty_search') : t('cat_empty_all'),
    ));
    return;
  }
  grid.replaceChildren(...filtered.map(questCard));
}

async function load() {
  try {
    allQuests = await api('/api/quests');
    hasLoaded = true;
    renderFilteredQuests();
  } catch (e) {
    grid.replaceChildren(h('div', { class: 'card empty' }, t('cat_load_error', e.message)));
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
      toast(t('auth_need_login_import'), 'info');
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
      toast(t('cat_import_success', imported.title), 'success');
      location.href = `/builder/${imported.id}`;
    } catch (err) {
      toast(t('cat_import_error', err.message), 'error');
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

window.addEventListener('pageshow', () => {
  load();
  checkAuth();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    load();
    checkAuth();
  }
});

window.addEventListener('tq:langchange', () => {
  renderAuthUI();
  if (hasLoaded) renderFilteredQuests();
});

initTheme();
checkAuth();
load();

// Общие утилиты фронтенда: запросы к API, создание DOM-элементов, уведомления, темы.

export async function api(path, { method = 'GET', body, cache = 'no-store' } = {}) {
  const options = { method, headers: {}, cache };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, options);
  } catch {
    throw Object.assign(new Error('Нет связи с сервером'), { status: 0 });
  }
  if (res.status === 204) return null;
  const raw = await res.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = raw; }
  }
  if (!res.ok) {
    const error = new Error(extractDetail(data) || `Ошибка сервера (${res.status})`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

function extractDetail(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join('; ');
  return null;
}

/** Безопасное создание элементов: текст всегда вставляется как textContent. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'value') el.value = value; // после детей — чтобы работало для <select>
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  return el;
}

export function toast(message, type = 'info') {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const item = h('div', { class: `toast toast-${type}` }, message);
  box.append(item);
  setTimeout(() => {
    item.classList.add('hide');
    setTimeout(() => item.remove(), 400);
  }, type === 'error' ? 5000 : 3200);
}

export function plural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

const ITEM_ICONS = [
  [/ключ/i, '🗝️'],
  [/линз|стекл|кристалл|хрустал|сфер/i, '🔮'],
  [/карт|план|схем/i, '🗺️'],
  [/свеч|ламп|фонар|факел/i, '🕯️'],
  [/книг|дневник|тетрад|письм|запис|свит/i, '📜'],
  [/монет|золот|деньг/i, '🪙'],
  [/меч|нож|кинжал|клин/i, '🗡️'],
  [/зель|флакон|эликсир/i, '🧪'],
  [/амулет|кольц|медальон/i, '💍'],
  [/верёвк|веревк|канат/i, '🪢'],
];

export function itemIcon(name = '') {
  for (const [re, icon] of ITEM_ICONS) if (re.test(name)) return icon;
  return '✦';
}

export function idFromPath() {
  const last = location.pathname.split('/').filter(Boolean).pop();
  const id = Number(last);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// ================= Поддержка тем (Ночное небо / Пергамент / Киберпанк) =================
const THEMES = ['night', 'parchment', 'cyber'];
const THEME_NAMES = { night: '🌌 Ночь', parchment: '📜 Пергамент', cyber: '⚡ Кибер' };

export function initTheme() {
  const saved = localStorage.getItem('tq_theme') || 'night';
  setTheme(saved);
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = `🎨 ${THEME_NAMES[saved] || 'Тема'}`;
    toggleBtn.addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || 'night';
      const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
      setTheme(next);
      toggleBtn.textContent = `🎨 ${THEME_NAMES[next]}`;
      toast(`Тема: ${THEME_NAMES[next]}`, 'info');
    });
  }
}

export function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('tq_theme', theme); } catch {}
}

'use strict';

// ---------- データ ----------
const STORE_KEY = 'tasks-v1';
const DEFAULT_GENRES = ['就活', '大学', '趣味'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { tasks: [], genres: DEFAULT_GENRES.map(name => ({ id: uid(), name })) };
}

let state = load();

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}

// ---------- 日付 ----------
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

function today() { return ymd(new Date()); }
function endOfWeek() { // 週の終わり = 日曜日
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()) % 7);
  return ymd(d);
}
function endOfMonth() {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

const PRESETS = { today, week: endOfWeek, month: endOfMonth, none: () => null };

function dueLabel(due) {
  if (!due) return null;
  const t = today();
  const d = parse(due);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  if (due < t) return { text: `期限切れ ${md}`, overdue: true };
  if (due === t) return { text: '今日' };
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (due === ymd(tomorrow)) return { text: '明日' };
  return { text: `${md}(${'日月火水木金土'[d.getDay()]})` };
}

// ---------- おすすめの点数 ----------
function duePoints(due) {
  if (!due) return 0;
  if (due <= today()) return 3;
  if (due <= endOfWeek()) return 2;
  if (due <= endOfMonth()) return 1;
  return 0;
}

const score = t => duePoints(t.due) + t.importance;

function byScore(a, b) {
  return score(b) - score(a)
    || (a.due || '9999').localeCompare(b.due || '9999')
    || a.createdAt - b.createdAt;
}

// ---------- 表示 ----------
const $ = id => document.getElementById(id);
const IMP_TEXT = { 3: '高', 2: '中', 1: '低' };
const CHECK_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';

function genreName(id) {
  const g = state.genres.find(g => g.id === id);
  return g ? g.name : null;
}

function tag(text, cls) {
  const s = document.createElement('span');
  s.className = 'tag' + (cls ? ' ' + cls : '');
  s.textContent = text;
  return s;
}

function itemEl(task, rank) {
  const li = document.createElement('li');
  li.className = 'item';
  li.dataset.id = task.id;

  const check = document.createElement('button');
  check.className = 'check';
  check.setAttribute('aria-label', task.done ? '未完了に戻す' : '完了にする');
  check.innerHTML = CHECK_SVG;
  li.append(check);

  if (rank) {
    const r = document.createElement('span');
    r.className = 'rank';
    r.textContent = rank;
    li.append(r);
  }

  const body = document.createElement('button');
  body.className = 'body';
  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = task.title;
  const tags = document.createElement('span');
  tags.className = 'tags';
  const due = dueLabel(task.due);
  if (due && !task.done) tags.append(tag(due.text, due.overdue ? 'overdue' : ''));
  tags.append(tag('重要度 ' + IMP_TEXT[task.importance], 'imp-' + task.importance));
  const g = genreName(task.genreId);
  if (g) tags.append(tag(g));
  body.append(title, tags);
  li.append(body);
  return li;
}

function render() {
  const active = state.tasks.filter(t => !t.done).sort(byScore);
  const done = state.tasks.filter(t => t.done).sort((a, b) => b.doneAt - a.doneAt);

  $('picks').replaceChildren(...active.slice(0, 3).map((t, i) => itemEl(t, i + 1)));
  $('picksEmpty').hidden = active.length > 0;

  $('list').replaceChildren(...active.map(t => itemEl(t)));
  $('count').textContent = active.length ? `${active.length}件` : '';

  $('doneSection').hidden = done.length === 0;
  $('doneList').replaceChildren(...done.map(t => itemEl(t)));
  $('doneCount').textContent = `${done.length}件`;
  document.querySelectorAll('#doneList .item').forEach(li => li.classList.add('done'));
}

// ---------- 完了・取り消し ----------
let undoFn = null;
let toastTimer = null;

function toast(text, undo) {
  $('toastText').textContent = text;
  undoFn = undo;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; undoFn = null; }, 4000);
}

$('toastUndo').addEventListener('click', () => {
  if (undoFn) undoFn();
  undoFn = null;
  $('toast').hidden = true;
});

function toggleDone(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
  t.done = !t.done;
  t.doneAt = t.done ? Date.now() : null;
  save(); render();
  if (t.done) {
    toast('完了しました', () => { t.done = false; t.doneAt = null; save(); render(); });
  }
}

document.querySelector('main').addEventListener('click', e => {
  const li = e.target.closest('.item');
  if (!li) return;
  if (e.target.closest('.check')) toggleDone(li.dataset.id);
  else if (e.target.closest('.body')) openTask(li.dataset.id);
});

// ---------- シート共通 ----------
function openSheet(el) { el.hidden = false; }
function closeSheet(el) { el.hidden = true; }

document.querySelectorAll('.sheet-wrap').forEach(wrap => {
  wrap.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) closeSheet(wrap);
  });
});

// ---------- タスク追加・編集 ----------
const form = { id: null, importance: 2, due: null, genreId: null };

function pressed(container, match) {
  container.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(match(b))));
}

function renderForm() {
  pressed($('importance'), b => Number(b.dataset.v) === form.importance);

  // 期限：プリセットと同じ日付ならそのボタンを、違えば「日付」を選択状態にする
  const preset = form.due === null ? 'none'
    : ['today', 'week', 'month'].find(k => PRESETS[k]() === form.due);
  pressed($('due'), b => b.dataset.v === preset);
  const custom = form.due !== null && !preset;
  $('dueDateLabel').parentElement.classList.toggle('on', custom);
  $('dueDateLabel').textContent = custom ? dueLabel(form.due).text : '日付';
  $('dueDate').value = form.due || '';

  const chips = [{ id: null, name: 'なし' }, ...state.genres].map(g => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.v = g.id || '';
    b.textContent = g.name;
    b.setAttribute('aria-pressed', String(g.id === form.genreId));
    return b;
  });
  $('genre').replaceChildren(...chips);
}

function openTask(id) {
  const t = id && state.tasks.find(t => t.id === id);
  Object.assign(form, t
    ? { id: t.id, importance: t.importance, due: t.due, genreId: t.genreId }
    : { id: null, importance: 2, due: null, genreId: null });
  $('title').value = t ? t.title : '';
  $('deleteTask').hidden = !t;
  renderForm();
  openSheet($('taskSheet'));
  if (!t) $('title').focus(); // iPhoneではタップ直後に呼ばないとキーボードが出ない
}

$('addBtn').addEventListener('click', () => openTask(null));

$('importance').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  form.importance = Number(b.dataset.v);
  renderForm();
});

$('due').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  form.due = PRESETS[b.dataset.v]();
  renderForm();
});

$('dueDate').addEventListener('change', e => {
  form.due = e.target.value || null;
  renderForm();
});

$('genre').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  form.genreId = b.dataset.v || null;
  renderForm();
});

$('taskForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('title').value.trim();
  if (!title) { $('title').focus(); return; }
  const fields = { title, importance: form.importance, due: form.due, genreId: form.genreId };
  const t = form.id && state.tasks.find(t => t.id === form.id);
  if (t) Object.assign(t, fields);
  else state.tasks.push({ id: uid(), ...fields, done: false, doneAt: null, createdAt: Date.now() });
  save(); render();
  $('title').blur();
  closeSheet($('taskSheet'));
});

$('deleteTask').addEventListener('click', () => {
  const i = state.tasks.findIndex(t => t.id === form.id);
  if (i < 0) return;
  const [removed] = state.tasks.splice(i, 1);
  save(); render();
  closeSheet($('taskSheet'));
  toast('削除しました', () => { state.tasks.splice(i, 0, removed); save(); render(); });
});

// ---------- ジャンル設定 ----------
function renderGenres() {
  $('genreList').replaceChildren(...state.genres.map(g => {
    const li = document.createElement('li');
    li.dataset.id = g.id;
    const input = document.createElement('input');
    input.value = g.name;
    input.setAttribute('aria-label', 'ジャンル名');
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '削除';
    li.append(input, del);
    return li;
  }));
}

$('openGenres').addEventListener('click', () => {
  renderGenres();
  openSheet($('genreSheet'));
});

$('genreList').addEventListener('change', e => {
  const li = e.target.closest('li');
  const g = state.genres.find(g => g.id === li.dataset.id);
  const name = e.target.value.trim();
  if (name) g.name = name;
  else e.target.value = g.name;
  save(); render();
});

$('genreList').addEventListener('click', e => {
  if (!e.target.closest('button')) return;
  const id = e.target.closest('li').dataset.id;
  const used = state.tasks.filter(t => t.genreId === id).length;
  const name = genreName(id);
  if (used && !confirm(`「${name}」のタスクが${used}件あります。削除すると、これらのタスクはジャンルなしになります。`)) return;
  state.genres = state.genres.filter(g => g.id !== id);
  state.tasks.forEach(t => { if (t.genreId === id) t.genreId = null; });
  save(); render(); renderGenres();
});

$('genreForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('genreName').value.trim();
  if (!name) return;
  state.genres.push({ id: uid(), name });
  $('genreName').value = '';
  save(); render(); renderGenres();
});

// ---------- 起動 ----------
render();
// 日付が変わったら「今日」や点数が変わるので、画面に戻ってきた時に描き直す
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

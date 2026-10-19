// ===== 1. ВСТАВЬТЕ СВОИ ДАННЫЕ ИЗ SUPABASE (Project Settings → API) =====
const SUPABASE_URL = 'https://xvfxptodkbrtmwrbquwy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2ZnhwdG9ka2JydG13cmJxdXd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMDA5ODMsImV4cCI6MjEwNjY3Njk4M30.mRUIIU_RSi8Fk-r5SCjRTuVIFoD1nXW1NXsythYcmDM';
// ========================================================================

let sb, initError = null;
try {
  if (!window.supabase) throw new Error('Библиотека Supabase не загрузилась (проверьте интернет или блокировщик рекламы)');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(SUPABASE_URL.trim())) throw new Error('SUPABASE_URL должен иметь вид https://xxxx.supabase.co');
  if (!SUPABASE_KEY || SUPABASE_KEY.includes('YOUR')) throw new Error('Вставьте anon/public ключ в SUPABASE_KEY');
  sb = window.supabase.createClient(SUPABASE_URL.trim().replace(/\/$/, ''), SUPABASE_KEY.trim());
} catch (e) { initError = e.message; }
const REGIONS = ['Мир', 'Европа', 'Азия', 'Америка', 'Африка', 'Ближний Восток', 'Центральная Азия'];
const $ = (id) => document.getElementById(id);
const dlg = $('dlg'), dlgBody = $('dlg-body');
let region = 'all', user = null, profile = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d) => new Date(d).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });
const fullName = (p) => (p ? `${esc(p.first_name)} ${esc(p.last_name)}` : 'Аноним');
const open = (html) => { dlgBody.innerHTML = html; if (!dlg.open) dlg.showModal(); };

// ---------- Навигация по регионам ----------
function renderRegions() {
  $('regions').innerHTML = ['all', ...REGIONS].map((r) =>
    `<button class="${r === region ? 'on' : ''}" onclick="setRegion('${r}')">${r === 'all' ? 'Все новости' : r}</button>`).join('');
}
function setRegion(r) { region = r; renderRegions(); loadFeed(); }

// ---------- Лента ----------
const mediaOf = (p) => (p.media && p.media.length ? p.media
  : [p.image_url && { type: 'image', url: p.image_url }, p.video_url && { type: 'video', url: p.video_url }].filter(Boolean).map((m, i) => ({ ...m, id: i + 1 })));
async function loadFeed() {
  let q = sb.from('posts').select('id,title,region,image_url,media,created_at,profiles(first_name,last_name)')
    .eq('status', 'approved').order('created_at', { ascending: false });
  if (region !== 'all') q = q.eq('region', region);
  const { data, error } = await q;
  if (error) return ($('app').innerHTML = `<p class="msg">Ошибка: ${esc(error.message)}</p>`);
  if (!data.length) return ($('app').innerHTML = '<p>В этом регионе пока нет новостей.</p>');
  const card = (p) => { const im = mediaOf(p).find((m) => m.type === 'image'); return `<div class="card" onclick="openPost('${p.id}')">
    ${im ? `<img src="${esc(im.url)}" alt="">` : '<div class="ph"></div>'}
    <div class="tag">${esc(p.region)}</div><h3>${esc(p.title)}</h3>
    <div class="meta">${fmt(p.created_at)} · ${fullName(p.profiles)}</div></div>`; };
  const [first, ...rest] = data;
  $('app').innerHTML = `<div class="hero">${card(first)}<div class="grid" style="grid-template-columns:1fr">${rest.slice(0, 2).map(card).join('')}</div></div>
    <div class="grid">${rest.slice(2).map(card).join('')}</div>`;
}

// ---------- Статья + комментарии ----------
function renderBody(p) {
  const ms = mediaOf(p), used = new Set();
  const m2h = (m) => m.type === 'video' ? `<video src="${esc(m.url)}" controls></video>` : `<img src="${esc(m.url)}" alt="">`;
  const html = String(p.body).split(/(\[\[m\d+\]\])/).map((s) => {
    const k = s.match(/^\[\[m(\d+)\]\]$/);
    if (k) { const m = ms.find((x) => x.id == k[1]); if (m) { used.add(m.id); return m2h(m); } return ''; }
    return s.split('\n').filter(Boolean).map((t) => `<p>${esc(t)}</p>`).join('');
  }).join('');
  return html + ms.filter((m) => !used.has(m.id)).map(m2h).join('');
}
async function openPost(id) {
  const { data: p } = await sb.from('posts').select('*,profiles(first_name,last_name)').eq('id', id).single();
  if (!p) return;
  const role = profile?.role, canEdit = role === 'admin' || (role === 'journalist' && user?.id === p.author_id);
  open(`<div class="article"><div class="tag">${esc(p.region)}</div><h1>${esc(p.title)}</h1>
    <div class="meta">${fmt(p.created_at)}</div>
    ${canEdit ? `<button class="btn alt" onclick="postDialog('${p.id}')">Редактировать</button>` : ''}
    ${renderBody(p)}<div class="author">Автор: ${fullName(p.profiles)}</div></div>
    <h3>Комментарии</h3><div id="comments"></div>
    <div id="cm-form">${user ? `<form onsubmit="addComment(event,'${p.id}')"><textarea name="t" required maxlength="1000" placeholder="Ваш комментарий"></textarea><button class="btn">Отправить</button></form>`
      : '<p><a href="#" onclick="authDialog();return false">Войдите</a>, чтобы комментировать.</p>'}</div>`);
  loadComments(p.id);
}
async function loadComments(postId) {
  const { data } = await sb.from('comments').select('id,body,created_at,profiles(first_name,last_name)')
    .eq('post_id', postId).order('created_at');
  const adm = profile?.role === 'admin';
  $('comments').innerHTML = (data || []).map((c) =>
    `<div class="cm">${adm ? `<button class="btn no" style="float:right;padding:2px 8px" onclick="delComment('${c.id}','${postId}')">✕</button>` : ''}
    <b>${fullName(c.profiles)} <span class="meta">${fmt(c.created_at)}</span></b>${esc(c.body)}</div>`).join('') || '<p class="meta">Пока нет комментариев.</p>';
}
async function addComment(e, postId) {
  e.preventDefault();
  const t = e.target.t.value.trim();
  if (!t) return;
  const { error } = await sb.from('comments').insert({ post_id: postId, user_id: user.id, body: t });
  if (error) return alert(error.message);
  e.target.reset(); loadComments(postId);
}
async function delComment(id, postId) {
  if (!confirm('Удалить комментарий?')) return;
  const { error } = await sb.from('comments').delete().eq('id', id);
  if (error) return alert(error.message);
  loadComments(postId);
}

// ---------- Авторизация, кабинет ----------
function authDialog(mode = 'login') {
  const reg = mode === 'register';
  open(`<div class="tabs"><button class="btn ${reg ? 'alt' : ''}" onclick="authDialog('login')">Вход</button>
    <button class="btn ${reg ? '' : 'alt'}" onclick="authDialog('register')">Регистрация</button></div>
    <form onsubmit="doAuth(event,${reg})">
    ${reg ? '<input name="fn" placeholder="Имя" required><input name="ln" placeholder="Фамилия" required>' : ''}
    <input name="email" type="email" placeholder="Email" required>
    <input name="pw" type="password" placeholder="Пароль (мин. 6 символов)" minlength="6" required>
    <div class="msg" id="auth-msg"></div><button class="btn">${reg ? 'Создать аккаунт' : 'Войти'}</button>
    ${reg ? '' : '<a href="#" onclick="resetPw();return false">Забыли пароль?</a>'}</form>
    <div class="or">или</div>
    <button type="button" class="btn alt gbtn" onclick="googleAuth()"><b style="color:#4285f4">G</b> Продолжить через Google</button>`);
}
async function doAuth(e, reg) {
  e.preventDefault();
  const f = e.target;
  const res = reg
    ? await sb.auth.signUp({ email: f.email.value, password: f.pw.value, options: { data: { first_name: f.fn.value.trim(), last_name: f.ln.value.trim() } } })
    : await sb.auth.signInWithPassword({ email: f.email.value, password: f.pw.value });
  if (res.error) return ($('auth-msg').textContent = res.error.message);
  if (reg && !res.data.session) return ($('auth-msg').textContent = 'Проверьте почту и подтвердите email.');
  dlg.close();
}
async function resetPw() {
  const email = prompt('Введите email аккаунта');
  if (!email) return;
  const { error } = await sb.auth.resetPasswordForEmail(email.trim());
  alert(error ? error.message : 'Письмо для сброса пароля отправлено.');
}
async function googleAuth() {
  if (location.protocol === 'file:') return alert('Вход через Google не работает при открытии файла. Запустите сайт через http://localhost:5500 или откройте опубликованный адрес.');
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) alert(error.message);
}
const logout = () => sb.auth.signOut();
const pwForm = '<form onsubmit="savePw(event)"><input type="password" name="pw" minlength="6" placeholder="Новый пароль" required><div class="msg" id="pw-msg"></div><button class="btn">Изменить пароль</button></form>';
function cabinet() {
  if (!profile) return;
  open(`<h2>Личный кабинет</h2><form onsubmit="saveName(event)">
    <input name="fn" value="${esc(profile.first_name)}" required><input name="ln" value="${esc(profile.last_name)}" required>
    <div class="meta">${esc(user.email)} · роль: ${esc(profile.role)}</div><button class="btn">Сохранить имя</button></form>
    <h3>Смена пароля</h3>${pwForm}`);
}
async function saveName(e) {
  e.preventDefault();
  const f = e.target;
  const { error } = await sb.from('profiles').update({ first_name: f.fn.value.trim(), last_name: f.ln.value.trim() }).eq('id', user.id);
  if (error) return alert(error.message);
  await refreshUser(); dlg.close(); loadFeed();
}
async function savePw(e) {
  e.preventDefault();
  const { error } = await sb.auth.updateUser({ password: e.target.pw.value });
  $('pw-msg').textContent = error ? error.message : 'Пароль изменён.';
}
async function refreshUser() {
  const { data } = await sb.auth.getSession();
  user = data.session?.user || null;
  profile = null;
  if (user) ({ data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single());
  const role = profile?.role;
  $('auth-box').innerHTML = user
    ? `<a href="#" onclick="cabinet();return false">${fullName(profile)}</a>
       ${role === 'journalist' || role === 'admin' ? '<button class="btn" onclick="postDialog()">+ Статья</button>' : ''}
       ${role === 'admin' ? '<button class="btn alt" onclick="modDialog()">Модерация</button><button class="btn alt" onclick="usersDialog()">Пользователи</button>' : ''}
       <button class="btn alt" onclick="logout()">Выйти</button>`
    : '<button class="btn" onclick="authDialog()">Войти</button>';
}

// ---------- Админ: пользователи и роли ----------
async function usersDialog() {
  const { data } = await sb.from('profiles').select('id,first_name,last_name,role').order('last_name');
  open(`<h2>Пользователи</h2><input placeholder="Поиск по имени" oninput="const v=this.value.toLowerCase();document.querySelectorAll('.u').forEach(r=>r.style.display=r.dataset.n.includes(v)?'':'none')">` +
    (data || []).map((u) => `<div class="q u" data-n="${esc((u.first_name + ' ' + u.last_name).toLowerCase())}"><b>${fullName(u)}</b>
    <select style="width:auto;float:right" onchange="setRole('${u.id}',this.value)">${['user', 'journalist', 'admin'].map((r) => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select></div>`).join(''));
}
async function setRole(id, role) {
  const { error } = await sb.from('profiles').update({ role }).eq('id', id);
  if (error) alert(error.message);
}

// ---------- Журналист: создание и редактирование ----------
let draft = { id: null, media: [] };
async function postDialog(id) {
  let p = null;
  draft = { id: id || null, media: [] };
  if (id) { ({ data: p } = await sb.from('posts').select('*').eq('id', id).single()); draft.media = mediaOf(p).map((m, i) => ({ ...m, id: i + 1 })); }
  open(`<h2>${p ? 'Редактирование' : 'Новая статья'}</h2><form onsubmit="submitPost(event)">
    <input name="title" placeholder="Заголовок" required maxlength="200" value="${esc(p?.title)}">
    <select name="region">${REGIONS.map((r) => `<option ${p?.region === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
    <textarea name="body" placeholder="Текст статьи" required>${esc(p?.body)}</textarea>
    <label>Фото и видео (можно несколько) <input type="file" accept="image/*,video/*" multiple onchange="addFiles(this)"></label>
    <div id="media-list"></div>
    <div class="meta">Поставьте курсор в текст и нажмите «Вставить в текст» у нужного файла. Невставленные файлы будут в конце статьи.</div>
    <div class="msg" id="post-msg"></div><button class="btn">${p ? 'Сохранить' : 'Отправить на проверку'}</button></form>`);
  drawMedia();
}
function drawMedia() {
  $('media-list').innerHTML = draft.media.map((m) => `<div class="q">${m.type === 'video' ? '🎬 видео' : `<img src="${esc(m.url)}" style="height:50px;vertical-align:middle;width:auto;margin:0">`}
    <button type="button" class="btn alt" onclick="insertMedia(${m.id})">Вставить в текст</button>
    <button type="button" class="btn no" onclick="dropMedia(${m.id})">✕</button></div>`).join('');
}
function insertMedia(id) {
  const ta = document.querySelector('#dlg-body textarea'), i = ta.selectionStart;
  ta.value = ta.value.slice(0, i) + `\n[[m${id}]]\n` + ta.value.slice(i); ta.focus();
}
function dropMedia(id) { draft.media = draft.media.filter((m) => m.id !== id); drawMedia(); }
async function upload(file) {
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
  const { error } = await sb.storage.from('media').upload(path, file);
  if (error) throw error;
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}
async function addFiles(inp) {
  const msg = $('post-msg');
  for (const f of inp.files) {
    msg.textContent = 'Загрузка ' + f.name + '…';
    try {
      const url = await upload(f);
      draft.media.push({ id: Math.max(0, ...draft.media.map((m) => m.id)) + 1, type: f.type.startsWith('video') ? 'video' : 'image', url });
      drawMedia();
    } catch (err) { msg.textContent = err.message; return; }
  }
  msg.textContent = ''; inp.value = '';
}
async function submitPost(e) {
  e.preventDefault();
  const f = e.target.elements, msg = $('post-msg');
  const row = { title: f.title.value, region: f.region.value, body: f.body.value, media: draft.media };
  const { error } = draft.id
    ? await sb.from('posts').update(row).eq('id', draft.id)
    : await sb.from('posts').insert({ ...row, author_id: user.id });
  if (error) return (msg.textContent = error.message);
  open(draft.id ? '<h3>Изменения сохранены.</h3>' : '<h3>Статья отправлена на проверку администратору.</h3>');
  loadFeed();
}

// ---------- Админ: модерация ----------
async function modDialog() {
  const { data } = await sb.from('posts').select('id,title,region,body,created_at,profiles(first_name,last_name)')
    .eq('status', 'pending').order('created_at');
  open(`<h2>На проверке (${data?.length || 0})</h2>` + (data || []).map((p) => `<div class="q">
    <div class="tag">${esc(p.region)}</div><b>${esc(p.title)}</b>
    <div class="meta">${fullName(p.profiles)} · ${fmt(p.created_at)}</div>
    <p>${esc(p.body.slice(0, 300))}…</p>
    <button class="btn alt" onclick="openPost('${p.id}')">Открыть</button>
    <button class="btn ok" onclick="moderate('${p.id}','approved')">Одобрить</button>
    <button class="btn no" onclick="moderate('${p.id}','rejected')">Отклонить</button></div>`).join(''));
}
async function moderate(id, status) {
  const { error } = await sb.from('posts').update({ status }).eq('id', id);
  if (error) return alert(error.message);
  modDialog(); loadFeed();
}

// ---------- Старт ----------
const H = location.hash;
renderRegions();
if (initError) {
  $('auth-box').innerHTML = '<button class="btn" onclick="authDialog()">Войти</button>';
  $('app').innerHTML = `<p class="msg"><b>Ошибка подключения:</b> ${esc(initError)}</p>`;
} else {
  sb.auth.onAuthStateChange(() => refreshUser());
  refreshUser(); loadFeed();
  if (/type=(signup|email)/.test(H)) open('<h2>✅ Email подтверждён</h2><p>Пользователь подтверждён. Вы можете закрыть письмо и пользоваться сайтом.</p>');
  else if (/type=recovery/.test(H)) open('<h2>Новый пароль</h2>' + pwForm);
  else if (/error_description/.test(H)) open('<h3>Ссылка недействительна или устарела</h3><p>Запросите письмо ещё раз.</p>');
  if (H) history.replaceState(null, '', location.pathname + location.search);
}
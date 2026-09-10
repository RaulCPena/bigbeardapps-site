/**
 * Big Beard Ops — auth + lean solo-dev dashboard
 * Cloudflare Worker: sessions, apps, checklists, notes, links
 */

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  ADMIN_PASSWORD: string;
}

const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;

type AppRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  app_store_url: string | null;
  site_url: string | null;
  next_action: string | null;
  sort_order: number;
  updated_at: number;
};

type ChecklistRow = {
  id: string;
  app_id: string;
  title: string;
  done: number;
  sort_order: number;
};

type NoteRow = {
  id: string;
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
};

type LinkRow = {
  id: string;
  title: string;
  url: string;
  category: string;
  sort_order: number;
};

function json(data: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra }
  });
}

function generateId(prefix = ''): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  const hex = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  return prefix ? `${prefix}${hex}` : hex;
}

function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

async function verifySession(env: Env, sessionId: string): Promise<boolean> {
  const now = Date.now();
  const result = await env.DB.prepare(
    'SELECT id FROM sessions WHERE id = ? AND expires_at > ?'
  ).bind(sessionId, now).first();

  if (result) {
    await env.DB.prepare(
      'UPDATE sessions SET last_activity = ? WHERE id = ?'
    ).bind(now, sessionId).run();
    return true;
  }
  return false;
}

function getSessionId(request: Request): string | null {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;
  const match = cookie.match(/session=([^;]+)/);
  return match ? match[1] : null;
}

async function requireAuth(request: Request, env: Env): Promise<Response | null> {
  const sessionId = getSessionId(request);
  if (!sessionId || !(await verifySession(env, sessionId))) {
    return json({ error: 'Unauthorized' }, 401);
  }
  return null;
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const { password } = await request.json() as { password: string };
    if (!password) return json({ error: 'Password required' }, 400);

    const hashedInput = await hashPassword(password);
    const hashedAdmin = await hashPassword(env.ADMIN_PASSWORD);
    if (hashedInput !== hashedAdmin) return json({ error: 'Invalid password' }, 401);

    const sessionId = generateSessionId();
    const now = Date.now();
    const expiresAt = now + SESSION_DURATION;

    await env.DB.prepare(
      'INSERT INTO sessions (id, user_id, created_at, expires_at, last_activity) VALUES (?, ?, ?, ?, ?)'
    ).bind(sessionId, 'admin', now, expiresAt, now).run();

    const cookie = `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DURATION / 1000}`;
    return json({ success: true, sessionId, expiresAt }, 200, { 'Set-Cookie': cookie });
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  const sessionId = getSessionId(request);
  if (sessionId) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }
  return json({ success: true }, 200, {
    'Set-Cookie': 'session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
  });
}

async function handleVerify(request: Request, env: Env): Promise<Response> {
  const sessionId = getSessionId(request);
  if (!sessionId) return json({ authenticated: false });
  return json({ authenticated: await verifySession(env, sessionId) });
}

async function handleGetDashboard(env: Env): Promise<Response> {
  const [apps, checklists, notes, links] = await Promise.all([
    env.DB.prepare('SELECT * FROM apps ORDER BY sort_order ASC').all<AppRow>(),
    env.DB.prepare('SELECT * FROM checklist_items ORDER BY sort_order ASC').all<ChecklistRow>(),
    env.DB.prepare('SELECT * FROM notes ORDER BY updated_at DESC').all<NoteRow>(),
    env.DB.prepare('SELECT * FROM links ORDER BY sort_order ASC').all<LinkRow>()
  ]);

  const checklistByApp: Record<string, ChecklistRow[]> = {};
  for (const item of checklists.results || []) {
    (checklistByApp[item.app_id] ||= []).push(item);
  }

  return json({
    apps: (apps.results || []).map(app => ({
      ...app,
      checklist: checklistByApp[app.id] || []
    })),
    notes: notes.results || [],
    links: links.results || []
  });
}

async function handlePatchApp(request: Request, env: Env, id: string): Promise<Response> {
  const body = await request.json() as Partial<AppRow>;
  const existing = await env.DB.prepare('SELECT * FROM apps WHERE id = ?').bind(id).first<AppRow>();
  if (!existing) return json({ error: 'App not found' }, 404);

  const status = body.status ?? existing.status;
  const next_action = body.next_action !== undefined ? body.next_action : existing.next_action;
  const app_store_url = body.app_store_url !== undefined ? body.app_store_url : existing.app_store_url;
  const now = Date.now();

  await env.DB.prepare(
    'UPDATE apps SET status = ?, next_action = ?, app_store_url = ?, updated_at = ? WHERE id = ?'
  ).bind(status, next_action, app_store_url, now, id).run();

  const updated = await env.DB.prepare('SELECT * FROM apps WHERE id = ?').bind(id).first();
  return json({ app: updated });
}

async function handleToggleChecklist(env: Env, id: string): Promise<Response> {
  const item = await env.DB.prepare('SELECT * FROM checklist_items WHERE id = ?').bind(id).first<ChecklistRow>();
  if (!item) return json({ error: 'Item not found' }, 404);

  const done = item.done ? 0 : 1;
  await env.DB.prepare('UPDATE checklist_items SET done = ? WHERE id = ?').bind(done, id).run();
  return json({ id, done: Boolean(done) });
}

async function handleCreateNote(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { title?: string; body?: string };
  const title = (body.title || '').trim();
  if (!title) return json({ error: 'Title required' }, 400);

  const now = Date.now();
  const id = generateId('note-');
  await env.DB.prepare(
    'INSERT INTO notes (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, title, body.body || '', now, now).run();

  const note = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first();
  return json({ note }, 201);
}

async function handleUpdateNote(request: Request, env: Env, id: string): Promise<Response> {
  const existing = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first<NoteRow>();
  if (!existing) return json({ error: 'Note not found' }, 404);

  const body = await request.json() as { title?: string; body?: string };
  const title = body.title !== undefined ? body.title.trim() : existing.title;
  const noteBody = body.body !== undefined ? body.body : existing.body;
  if (!title) return json({ error: 'Title required' }, 400);

  const now = Date.now();
  await env.DB.prepare(
    'UPDATE notes SET title = ?, body = ?, updated_at = ? WHERE id = ?'
  ).bind(title, noteBody, now, id).run();

  const note = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first();
  return json({ note });
}

async function handleDeleteNote(env: Env, id: string): Promise<Response> {
  await env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
  return json({ success: true });
}

async function handleCreateLink(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { title?: string; url?: string; category?: string };
  const title = (body.title || '').trim();
  const url = (body.url || '').trim();
  if (!title || !url) return json({ error: 'Title and URL required' }, 400);

  const max = await env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM links').first<{ m: number }>();
  const id = generateId('lnk-');
  await env.DB.prepare(
    'INSERT INTO links (id, title, url, category, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, title, url, body.category || 'general', (max?.m || 0) + 1).run();

  const link = await env.DB.prepare('SELECT * FROM links WHERE id = ?').bind(id).first();
  return json({ link }, 201);
}

async function handleDeleteLink(env: Env, id: string): Promise<Response> {
  await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(id).run();
  return json({ success: true });
}

function serveLoginPage(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Big Beard Ops — Login</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      min-height: 100vh; display: grid; place-items: center;
      background: #0f172a; color: #0f172a; padding: 24px;
    }
    .card {
      width: 100%; max-width: 380px; background: #fff;
      border-radius: 12px; padding: 36px 28px;
      box-shadow: 0 20px 50px rgba(0,0,0,.35);
    }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .sub { color: #64748b; font-size: .9rem; margin-bottom: 24px; }
    label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: 6px; color: #334155; }
    input {
      width: 100%; padding: 12px 14px; border: 1px solid #cbd5e1; border-radius: 8px;
      font-size: 1rem; margin-bottom: 16px;
    }
    input:focus { outline: 2px solid #2563eb; border-color: transparent; }
    button {
      width: 100%; padding: 12px; border: 0; border-radius: 8px;
      background: #2563eb; color: #fff; font-weight: 600; font-size: 1rem; cursor: pointer;
    }
    button:disabled { opacity: .6; cursor: wait; }
    .error {
      display: none; background: #fef2f2; color: #991b1b; border-radius: 8px;
      padding: 10px 12px; margin-bottom: 14px; font-size: .9rem;
    }
    .error.show { display: block; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Big Beard Ops</h1>
    <p class="sub">Sign in to your ops board</p>
    <div class="error" id="error"></div>
    <form id="loginForm">
      <label for="password">Password</label>
      <input id="password" type="password" required autofocus>
      <button id="submitBtn" type="submit">Sign In</button>
    </form>
  </div>
  <script>
    const form = document.getElementById('loginForm');
    const errorDiv = document.getElementById('error');
    const submitBtn = document.getElementById('submitBtn');
    const passwordInput = document.getElementById('password');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorDiv.classList.remove('show');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Signing in…';
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: passwordInput.value })
        });
        const data = await res.json();
        if (res.ok) window.location.href = '/dashboard';
        else {
          errorDiv.textContent = data.error || 'Login failed';
          errorDiv.classList.add('show');
          passwordInput.value = '';
          passwordInput.focus();
        }
      } catch {
        errorDiv.textContent = 'Network error. Try again.';
        errorDiv.classList.add('show');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In';
      }
    });
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function serveDashboard(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Big Beard Ops</title>
  <style>
    :root {
      --bg: #f1f5f9;
      --card: #ffffff;
      --ink: #0f172a;
      --muted: #64748b;
      --line: #e2e8f0;
      --accent: #2563eb;
      --live: #15803d;
      --beta: #a16207;
      --dev: #475569;
      --review: #1d4ed8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
      background: var(--bg); color: var(--ink); min-height: 100vh;
    }
    header {
      background: var(--card); border-bottom: 1px solid var(--line);
      padding: 14px 20px; display: flex; justify-content: space-between; align-items: center;
      position: sticky; top: 0; z-index: 10;
    }
    .brand { font-weight: 700; font-size: 1.05rem; }
    .brand span { color: var(--muted); font-weight: 500; margin-left: 8px; font-size: .85rem; }
    nav { display: flex; gap: 6px; flex-wrap: wrap; }
    nav button, .btn {
      border: 1px solid var(--line); background: var(--card); color: var(--ink);
      padding: 8px 12px; border-radius: 8px; font-size: .9rem; cursor: pointer;
    }
    nav button.active { background: var(--ink); color: #fff; border-color: var(--ink); }
    .btn-primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    .btn-danger { color: #991b1b; border-color: #fecaca; }
    main { max-width: 960px; margin: 0 auto; padding: 24px 16px 64px; }
    .panel { display: none; }
    .panel.active { display: block; }
    .grid { display: grid; gap: 14px; }
    .card {
      background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px;
    }
    .card h2 { font-size: 1.1rem; margin-bottom: 4px; }
    .meta { color: var(--muted); font-size: .85rem; margin-bottom: 12px; }
    .badge {
      display: inline-block; font-size: .72rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .04em; padding: 3px 8px; border-radius: 999px; background: #e2e8f0;
    }
    .badge.live { background: #dcfce7; color: var(--live); }
    .badge.beta { background: #fef3c7; color: var(--beta); }
    .badge.review { background: #dbeafe; color: var(--review); }
    .badge.development { background: #e2e8f0; color: var(--dev); }
    .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
    .row a { color: var(--accent); font-size: .9rem; }
    label.check {
      display: flex; gap: 8px; align-items: flex-start; padding: 6px 0;
      border-top: 1px solid var(--line); font-size: .92rem; cursor: pointer;
    }
    label.check:first-of-type { border-top: 0; }
    input[type=text], input[type=url], select, textarea {
      width: 100%; border: 1px solid var(--line); border-radius: 8px;
      padding: 10px 12px; font: inherit; background: #fff;
    }
    textarea { min-height: 120px; resize: vertical; }
    .field { margin-bottom: 10px; }
    .field label { display: block; font-size: .8rem; font-weight: 600; color: var(--muted); margin-bottom: 4px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .link-cat { margin: 22px 0 8px; font-size: .75rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
    .link-item {
      display: flex; justify-content: space-between; gap: 12px; align-items: center;
      padding: 12px 0; border-bottom: 1px solid var(--line);
    }
    .link-item a { color: var(--ink); font-weight: 600; text-decoration: none; }
    .link-item a:hover { color: var(--accent); }
    .empty { color: var(--muted); padding: 24px 0; }
    .next { font-size: .95rem; margin: 8px 0 4px; }
    @media (max-width: 640px) {
      header { flex-direction: column; align-items: stretch; gap: 10px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">Big Beard Ops <span>solo-dev board</span></div>
    <nav>
      <button class="tab active" data-tab="apps">Apps</button>
      <button class="tab" data-tab="notes">Notes</button>
      <button class="tab" data-tab="links">Links</button>
      <button id="logoutBtn">Sign out</button>
    </nav>
  </header>
  <main>
    <section id="apps" class="panel active"><div class="grid" id="appsGrid"></div></section>
    <section id="notes" class="panel">
      <div class="card" style="margin-bottom:14px">
        <h2>New note</h2>
        <div class="field"><label>Title</label><input id="noteTitle" type="text" placeholder="Decision, reminder…"></div>
        <div class="field"><label>Body</label><textarea id="noteBody" placeholder="Details"></textarea></div>
        <button class="btn btn-primary" id="addNoteBtn">Add note</button>
      </div>
      <div class="grid" id="notesGrid"></div>
    </section>
    <section id="links" class="panel">
      <div class="card" style="margin-bottom:14px">
        <h2>Add link</h2>
        <div class="field"><label>Title</label><input id="linkTitle" type="text"></div>
        <div class="field"><label>URL</label><input id="linkUrl" type="url" placeholder="https://"></div>
        <div class="field"><label>Category</label><input id="linkCategory" type="text" placeholder="Apple, Cloudflare…"></div>
        <button class="btn btn-primary" id="addLinkBtn">Add link</button>
      </div>
      <div id="linksList"></div>
    </section>
  </main>
  <script>
    let state = { apps: [], notes: [], links: [] };

    async function api(path, opts) {
      opts = opts || {};
      const res = await fetch(path, Object.assign({
        headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {})
      }, opts));
      if (res.status === 401) { location.href = '/'; return null; }
      const data = await res.json().catch(function(){ return {}; });
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    }

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
        return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c];
      });
    }

    function renderApps() {
      const el = document.getElementById('appsGrid');
      if (!state.apps.length) { el.innerHTML = '<p class="empty">No apps yet.</p>'; return; }
      el.innerHTML = state.apps.map(function(app) {
        const checks = (app.checklist || []).map(function(item) {
          return '<label class="check">' +
            '<input type="checkbox" data-check="' + esc(item.id) + '"' + (item.done ? ' checked' : '') + '>' +
            '<span>' + esc(item.title) + '</span></label>';
        }).join('');
        const statuses = ['live','review','beta','development'].map(function(s) {
          return '<option value="' + s + '"' + (app.status === s ? ' selected' : '') + '>' + s + '</option>';
        }).join('');
        return '<article class="card" data-app="' + esc(app.id) + '">' +
          '<div class="row"><h2>' + esc(app.name) + '</h2>' +
          '<span class="badge ' + esc(app.status) + '">' + esc(app.status) + '</span></div>' +
          '<p class="next"><strong>Next:</strong> ' + esc(app.next_action || '—') + '</p>' +
          '<div class="row">' +
            (app.site_url ? '<a href="' + esc(app.site_url) + '" target="_blank" rel="noopener">Site</a>' : '') +
            (app.app_store_url ? '<a href="' + esc(app.app_store_url) + '" target="_blank" rel="noopener">App Store</a>' : '<span class="meta">No App Store URL</span>') +
          '</div>' +
          '<div class="field"><label>Status</label><select data-status="' + esc(app.id) + '">' + statuses + '</select></div>' +
          '<div class="field"><label>Next action</label>' +
          '<input type="text" data-next="' + esc(app.id) + '" value="' + esc(app.next_action || '') + '"></div>' +
          '<div class="actions"><button class="btn btn-primary" data-save-app="' + esc(app.id) + '">Save</button></div>' +
          '<div style="margin-top:14px">' + (checks || '<p class="meta">No checklist</p>') + '</div></article>';
      }).join('');
    }

    function renderNotes() {
      const el = document.getElementById('notesGrid');
      if (!state.notes.length) { el.innerHTML = '<p class="empty">No notes yet.</p>'; return; }
      el.innerHTML = state.notes.map(function(n) {
        return '<article class="card">' +
          '<div class="field"><label>Title</label><input type="text" data-note-title="' + esc(n.id) + '" value="' + esc(n.title) + '"></div>' +
          '<div class="field"><label>Body</label><textarea data-note-body="' + esc(n.id) + '">' + esc(n.body) + '</textarea></div>' +
          '<p class="meta">Updated ' + new Date(n.updated_at).toLocaleString() + '</p>' +
          '<div class="actions">' +
          '<button class="btn btn-primary" data-save-note="' + esc(n.id) + '">Save</button>' +
          '<button class="btn btn-danger" data-del-note="' + esc(n.id) + '">Delete</button></div></article>';
      }).join('');
    }

    function renderLinks() {
      const el = document.getElementById('linksList');
      if (!state.links.length) { el.innerHTML = '<p class="empty">No links yet.</p>'; return; }
      const byCat = {};
      state.links.forEach(function(l) { (byCat[l.category] = byCat[l.category] || []).push(l); });
      el.innerHTML = Object.keys(byCat).map(function(cat) {
        return '<h3 class="link-cat">' + esc(cat) + '</h3>' + byCat[cat].map(function(l) {
          return '<div class="link-item"><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.title) + '</a>' +
            '<button class="btn btn-danger" data-del-link="' + esc(l.id) + '">Remove</button></div>';
        }).join('');
      }).join('');
    }

    function renderAll() { renderApps(); renderNotes(); renderLinks(); }

    async function load() {
      const data = await api('/api/dashboard');
      if (!data) return;
      state = data;
      renderAll();
    }

    document.querySelectorAll('.tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(function(b){ b.classList.remove('active'); });
        document.querySelectorAll('.panel').forEach(function(p){ p.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });

    document.getElementById('logoutBtn').addEventListener('click', async function() {
      await api('/api/logout', { method: 'POST' });
      location.href = '/';
    });

    document.getElementById('appsGrid').addEventListener('change', async function(e) {
      if (e.target.matches('[data-check]')) {
        await api('/api/checklist/' + e.target.dataset.check + '/toggle', { method: 'POST' });
        await load();
      }
    });

    document.getElementById('appsGrid').addEventListener('click', async function(e) {
      const btn = e.target.closest('[data-save-app]');
      if (!btn) return;
      const id = btn.dataset.saveApp;
      const status = document.querySelector('[data-status="' + id + '"]').value;
      const next_action = document.querySelector('[data-next="' + id + '"]').value;
      await api('/api/apps/' + id, { method: 'PATCH', body: JSON.stringify({ status: status, next_action: next_action }) });
      await load();
    });

    document.getElementById('addNoteBtn').addEventListener('click', async function() {
      const title = document.getElementById('noteTitle').value.trim();
      const body = document.getElementById('noteBody').value;
      if (!title) return alert('Title required');
      await api('/api/notes', { method: 'POST', body: JSON.stringify({ title: title, body: body }) });
      document.getElementById('noteTitle').value = '';
      document.getElementById('noteBody').value = '';
      await load();
    });

    document.getElementById('notesGrid').addEventListener('click', async function(e) {
      const save = e.target.closest('[data-save-note]');
      const del = e.target.closest('[data-del-note]');
      if (save) {
        const id = save.dataset.saveNote;
        const title = document.querySelector('[data-note-title="' + id + '"]').value;
        const body = document.querySelector('[data-note-body="' + id + '"]').value;
        await api('/api/notes/' + id, { method: 'PATCH', body: JSON.stringify({ title: title, body: body }) });
        await load();
      }
      if (del) {
        if (!confirm('Delete this note?')) return;
        await api('/api/notes/' + del.dataset.delNote, { method: 'DELETE' });
        await load();
      }
    });

    document.getElementById('addLinkBtn').addEventListener('click', async function() {
      const title = document.getElementById('linkTitle').value.trim();
      const url = document.getElementById('linkUrl').value.trim();
      const category = document.getElementById('linkCategory').value.trim() || 'general';
      if (!title || !url) return alert('Title and URL required');
      await api('/api/links', { method: 'POST', body: JSON.stringify({ title: title, url: url, category: category }) });
      document.getElementById('linkTitle').value = '';
      document.getElementById('linkUrl').value = '';
      document.getElementById('linkCategory').value = '';
      await load();
    });

    document.getElementById('linksList').addEventListener('click', async function(e) {
      const del = e.target.closest('[data-del-link]');
      if (!del) return;
      await api('/api/links/' + del.dataset.delLink, { method: 'DELETE' });
      await load();
    });

    load().catch(function(err) {
      console.error(err);
      alert('Failed to load dashboard');
    });
  </script>
</body>
</html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    try {
      if (path === '/api/login' && request.method === 'POST') return handleLogin(request, env);
      if (path === '/api/logout' && request.method === 'POST') return handleLogout(request, env);
      if (path === '/api/verify' && request.method === 'GET') return handleVerify(request, env);

      // Authenticated API
      if (path.startsWith('/api/')) {
        const denied = await requireAuth(request, env);
        if (denied) return denied;

        if (path === '/api/dashboard' && request.method === 'GET') return handleGetDashboard(env);

        const appMatch = path.match(/^\/api\/apps\/([^/]+)$/);
        if (appMatch && request.method === 'PATCH') return handlePatchApp(request, env, appMatch[1]);

        const checkMatch = path.match(/^\/api\/checklist\/([^/]+)\/toggle$/);
        if (checkMatch && request.method === 'POST') return handleToggleChecklist(env, checkMatch[1]);

        if (path === '/api/notes' && request.method === 'POST') return handleCreateNote(request, env);
        const noteMatch = path.match(/^\/api\/notes\/([^/]+)$/);
        if (noteMatch && request.method === 'PATCH') return handleUpdateNote(request, env, noteMatch[1]);
        if (noteMatch && request.method === 'DELETE') return handleDeleteNote(env, noteMatch[1]);

        if (path === '/api/links' && request.method === 'POST') return handleCreateLink(request, env);
        const linkMatch = path.match(/^\/api\/links\/([^/]+)$/);
        if (linkMatch && request.method === 'DELETE') return handleDeleteLink(env, linkMatch[1]);

        return json({ error: 'Not found' }, 404);
      }

      if (path === '/dashboard') {
        const sessionId = getSessionId(request);
        if (sessionId && await verifySession(env, sessionId)) return serveDashboard();
        return Response.redirect(url.origin + '/', 302);
      }

      if (path === '/') return serveLoginPage();
      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error(err);
      return json({ error: 'Server error' }, 500);
    }
  }
};

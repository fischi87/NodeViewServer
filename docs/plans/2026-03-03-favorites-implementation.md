# Favorites Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a star icon to the top bar that navigates to a favorites view, with the ability to mark/unmark files as favorites from the file list.

**Architecture:** Server-side persistence via a new `favorites.json` file (mirroring the pattern of `paths.json`/`pathsStore.js`). Two new API endpoints in `routes.js`. Frontend uses a virtual path sentinel `'__favorites__'` for `currentPath` to trigger the favorites view inline in the existing main content area.

**Tech Stack:** Node.js/Express backend, vanilla JS + HTML + CSS frontend (no frameworks, no build step)

---

## Task 1: Backend – favoritesStore.js

**Files:**
- Create: `favoritesStore.js`

**Context:**
This module mirrors `pathsStore.js`. It reads/writes a `favorites.json` file.
Each favorite entry: `{ name: string, path: string }` where `path` is the relative path used by `/api/file?path=...`.

**Step 1: Create favoritesStore.js**

```js
// favoritesStore.js
const fs = require('fs');
const path = require('path');

const FAVORITES_FILE = path.join(__dirname, 'favorites.json');

function readFavoritesFromDisk() {
  try {
    if (!fs.existsSync(FAVORITES_FILE)) return [];
    const raw = fs.readFileSync(FAVORITES_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.favorites)) {
      return data.favorites.filter(
        f => f && typeof f.name === 'string' && typeof f.path === 'string'
      );
    }
    return [];
  } catch (err) {
    console.error('[favoritesStore] Fehler beim Lesen:', err);
    return [];
  }
}

function writeFavoritesToDisk(favorites) {
  try {
    fs.writeFileSync(
      FAVORITES_FILE,
      JSON.stringify({ favorites }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('[favoritesStore] Fehler beim Schreiben:', err);
  }
}

let currentFavorites = readFavoritesFromDisk();

module.exports = {
  getFavorites() {
    return currentFavorites;
  },
  setFavorites(favorites) {
    currentFavorites = favorites;
    writeFavoritesToDisk(favorites);
  }
};
```

**Step 2: Verify the file was created correctly**

```bash
node -e "const f = require('./favoritesStore'); console.log(f.getFavorites());"
```
Expected output: `[]`

**Step 3: Commit**

```bash
git add favoritesStore.js
git commit -m "feat: add favoritesStore module for server-side favorites persistence"
```

---

## Task 2: Backend – API routes in routes.js

**Files:**
- Modify: `routes.js`

**Context:**
The routes file uses `auth.requireAuthApi` for all `/api/*` endpoints. The pattern for GET/POST follows the existing `/api/paths` endpoints exactly.

Add at the top of `routes.js` with the other requires (after line 11 `require('./pathsStore')`):
```js
const { getFavorites, setFavorites } = require('./favoritesStore');
```

**Step 1: Add the require for favoritesStore in routes.js**

In `routes.js`, after this line:
```js
const { getRoots, setRoots, validateRootsInput, isUnderAllowedBase } = require('./pathsStore');
```

Add:
```js
const { getFavorites, setFavorites } = require('./favoritesStore');
```

**Step 2: Add GET /api/favorites route**

Add this block in `routes.js` after the `/api/paths` POST handler (after line ~243):

```js
// -----------------------------------------------------------------------------
// /api/favorites – Favoriten verwalten
// -----------------------------------------------------------------------------

router.get('/api/favorites', auth.requireAuthApi, (req, res) => {
  res.json({ favorites: getFavorites() });
});

router.post('/api/favorites', auth.requireAuthApi, (req, res) => {
  const { favorites } = req.body;

  if (!Array.isArray(favorites)) {
    return res.status(400).json({ error: 'favorites muss ein Array sein' });
  }

  const cleaned = favorites.filter(
    f => f && typeof f.name === 'string' && typeof f.path === 'string'
       && f.name.trim() && f.path.trim()
  ).map(f => ({ name: f.name.trim(), path: f.path.trim() }));

  setFavorites(cleaned);
  res.json({ ok: true, favorites: getFavorites() });
});
```

**Step 3: Verify the server starts without errors**

```bash
node -e "require('./routes')"
```
Expected: no output, no crash.

**Step 4: Commit**

```bash
git add routes.js
git commit -m "feat: add GET/POST /api/favorites API endpoints"
```

---

## Task 3: Frontend CSS – Star button styles

**Files:**
- Modify: `webSite/style.css`

**Context:**
The existing settings button uses class `.top-bar__btn-settings`. We add a matching `.top-bar__btn-favorites`. The file-row star toggle button uses `.btn-favorite` (similar to `.btn-delete`).

**Step 1: Add CSS for the top-bar favorites button**

Append to `webSite/style.css` after the `.top-bar__btn-settings` block. Search for `.top-bar__btn-settings` and add right after its closing brace:

```css
/* ─── FAVORITES BUTTON (Top Bar) ─────────────────────────────────────────── */

.top-bar__btn-favorites {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  flex-shrink: 0;
}

.top-bar__btn-favorites svg {
  width: 18px;
  height: 18px;
}

.top-bar__btn-favorites:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}

.top-bar__btn-favorites.active {
  color: var(--accent);
}
```

**Step 2: Add CSS for the per-row star toggle button**

Append to `webSite/style.css` (after `.btn-delete`):

```css
/* ─── FAVORITE TOGGLE BUTTON (File Row) ─────────────────────────────────── */

.btn-favorite {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.2rem 0.4rem;
  font-size: 0.85rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  line-height: 1;
}

.btn-favorite:hover {
  color: var(--warning);
  border-color: rgba(251, 191, 36, 0.3);
  background: rgba(251, 191, 36, 0.06);
}

.btn-favorite.active {
  color: var(--warning);
}
```

**Step 3: Add CSS for the favorites path column**

```css
/* ─── FAVORITES VIEW ─────────────────────────────────────────────────────── */

.favorites-path {
  font-size: 0.75rem;
  color: var(--text-dim);
  font-family: var(--font-mono);
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**Step 4: Commit**

```bash
git add webSite/style.css
git commit -m "feat: add CSS for favorites button and file-row star toggle"
```

---

## Task 4: Frontend HTML – Star button in top bar

**Files:**
- Modify: `webSite/main.html`

**Context:**
The top bar actions div currently has the settings button and logout form. We insert the new star button **before** the settings button.

Current HTML at line 23-33 in `main.html`:
```html
<div class="top-bar__actions">
  <button id="btn-settings" class="top-bar__btn-settings" ...>
    ...gear SVG...
  </button>
  <form id="logoutForm" ...>
    <button type="submit" class="btn-logout">Abmelden</button>
  </form>
</div>
```

**Step 1: Add favorites button before the settings button**

Replace the `<div class="top-bar__actions">` block so it reads:

```html
<div class="top-bar__actions">
  <button id="btn-favorites" class="top-bar__btn-favorites" aria-label="Favoriten">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  </button>
  <button id="btn-settings" class="top-bar__btn-settings" aria-label="Einstellungen">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  </button>
  <form id="logoutForm" action="/logout" method="POST">
    <button type="submit" class="btn-logout">Abmelden</button>
  </form>
</div>
```

**Step 2: Verify page loads without console errors**

Open the browser, navigate to `/main.html`. Check browser console – should be no errors.

**Step 3: Commit**

```bash
git add webSite/main.html
git commit -m "feat: add star/favorites button to top bar"
```

---

## Task 5: Frontend JS – Favorites state and API functions

**Files:**
- Modify: `webSite/script.js`

**Context:**
Add favorites state and API functions at the top of `script.js`, after the `currentPath` declaration (line 4).
The `favorites` array holds objects `{ name, path }`. The `path` field is the full relative path used by `/api/file?path=...`.

**Step 1: Add favorites state variable after `let currentPath = '';`**

After line 4 in `script.js`:
```js
let currentPath = '';   // already exists
```

Add:
```js
let favorites = [];   // { name, path }[] – geladen von /api/favorites
```

**Step 2: Add loadFavorites() function**

Add in the `// ─── HILFSFUNKTIONEN` section (after `formatDate`):

```js
// ─── FAVORITEN ────────────────────────────────────────────────────────────────

async function loadFavorites() {
  try {
    const res = await fetch('/api/favorites');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    favorites = Array.isArray(data.favorites) ? data.favorites : [];
  } catch (err) {
    console.error('[loadFavorites] Fehler:', err);
    favorites = [];
  }
}

async function saveFavorites() {
  try {
    await fetch('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favorites })
    });
  } catch (err) {
    console.error('[saveFavorites] Fehler:', err);
  }
}

function isFavorite(filePath) {
  return favorites.some(f => f.path === filePath);
}

async function toggleFavorite(name, filePath) {
  if (isFavorite(filePath)) {
    favorites = favorites.filter(f => f.path !== filePath);
  } else {
    favorites.push({ name, path: filePath });
  }
  await saveFavorites();
}

function updateFavoritesButtonState() {
  const btn = document.getElementById('btn-favorites');
  if (!btn) return;
  btn.classList.toggle('active', currentPath === '__favorites__');
}
```

**Step 3: Commit**

```bash
git add webSite/script.js
git commit -m "feat: add favorites state, load/save/toggle API functions"
```

---

## Task 6: Frontend JS – Favorites view rendering

**Files:**
- Modify: `webSite/script.js`

**Context:**
When `currentPath === '__favorites__'`, `renderFileList()` should show the favorites list instead of a normal directory. The breadcrumb should also reflect this special state.

**Step 1: Modify renderBreadcrumb() to handle `'__favorites__'`**

In `renderBreadcrumb()`, add a check at the very beginning (after `if (!el) return;`):

Replace the existing early-return for empty path:
```js
  if (!currentPath) {
    const seg = document.createElement('span');
    seg.className = 'breadcrumb__segment current';
    seg.textContent = 'Bereiche';
    el.appendChild(seg);
    return;
  }
```

With:
```js
  if (!currentPath) {
    const seg = document.createElement('span');
    seg.className = 'breadcrumb__segment current';
    seg.textContent = 'Bereiche';
    el.appendChild(seg);
    return;
  }

  if (currentPath === '__favorites__') {
    const seg = document.createElement('span');
    seg.className = 'breadcrumb__segment current';
    seg.textContent = '★ Favoriten';
    el.appendChild(seg);
    return;
  }
```

**Step 2: Add renderFavoritesView() function**

Add this new function right before `renderFileList()`:

```js
// ─── FAVORITES VIEW ───────────────────────────────────────────────────────────

function renderFavoritesView() {
  const container = document.getElementById('file-list');
  if (!container) return;

  if (favorites.length === 0) {
    container.innerHTML = '<div class="file-list__empty">Noch keine Favoriten gespeichert. Markiere Dateien mit ★ in der Dateiliste.</div>';
    return;
  }

  const table = document.createElement('table');
  table.className = 'file-list__table';
  table.innerHTML = `
    <thead>
      <tr>
        <th style="width:100%">Name</th>
        <th>Pfad</th>
        <th></th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement('tbody');

  favorites.forEach(fav => {
    const tr = document.createElement('tr');
    tr.className = 'file-row';

    tr.innerHTML = `
      <td><div class="file-row__name">${ICON_FILE}<span class="file-row__label">${fav.name}</span></div></td>
      <td class="file-row__meta"><span class="favorites-path">${fav.path}</span></td>
      <td class="file-row__actions">
        <button class="btn-favorite active" title="Aus Favoriten entfernen" data-path="${fav.path}">★</button>
      </td>
    `;

    // Zeile klicken öffnet Datei
    tr.addEventListener('click', e => {
      if (e.target.closest('.btn-favorite')) return;
      const url = `/api/file?path=${encodeURIComponent(fav.path)}`;
      const type = getFileType(fav.name);
      if (type === 'other') {
        window.open(url, '_blank');
      } else {
        openPreviewModal(fav.name, url, type);
      }
    });

    // Stern-Button entfernt Favorit
    tr.querySelector('.btn-favorite').addEventListener('click', async e => {
      e.stopPropagation();
      await toggleFavorite(fav.name, fav.path);
      renderFavoritesView();
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);
}
```

**Step 3: Modify renderFileList() to dispatch to renderFavoritesView() when in favorites mode**

In `renderFileList()`, add at the very beginning (after the null check for `container`):

```js
  if (currentPath === '__favorites__') {
    renderFavoritesView();
    return;
  }
```

**Step 4: Commit**

```bash
git add webSite/script.js
git commit -m "feat: add favorites view rendering and breadcrumb support"
```

---

## Task 7: Frontend JS – Star button in file list rows

**Files:**
- Modify: `webSite/script.js`

**Context:**
Each file row in `renderFileList()` currently has a "Löschen" button in `<td class="file-row__actions">`. We add a `★` star button next to it.

The full relative path for a file in `currentPath` is: `` `${currentPath}/${item.name}` ``

**Step 1: Modify the file row HTML generation in renderFileList()**

Find this block inside `items.forEach(item => { ... })` in `renderFileList()`:

```js
      const deleteBtn   = item.type === 'file'
        ? `<button class="btn-delete" data-name="${item.name}">Löschen</button>`
        : '';

      tr.innerHTML = `
        <td><div class="file-row__name">${icon}<span class="${labelClass}">${item.name}</span></div></td>
        <td class="file-row__meta">${sizeCell}</td>
        <td class="file-row__meta">${dateCell}</td>
        <td class="file-row__actions">${deleteBtn}</td>
      `;
```

Replace with:

```js
      const filePath    = `${currentPath}/${item.name}`;
      const favActive   = item.type === 'file' && isFavorite(filePath) ? ' active' : '';
      const starBtn     = item.type === 'file'
        ? `<button class="btn-favorite${favActive}" data-path="${filePath}" data-name="${item.name}" title="Favorit">★</button>`
        : '';
      const deleteBtn   = item.type === 'file'
        ? `<button class="btn-delete" data-name="${item.name}">Löschen</button>`
        : '';

      tr.innerHTML = `
        <td><div class="file-row__name">${icon}<span class="${labelClass}">${item.name}</span></div></td>
        <td class="file-row__meta">${sizeCell}</td>
        <td class="file-row__meta">${dateCell}</td>
        <td class="file-row__actions">${starBtn}${deleteBtn}</td>
      `;
```

**Step 2: Add click handler for star button inside the `else` branch (file clicks)**

In the file row event wiring (the `else` branch after `if (item.type === 'folder')`), the existing code is:

```js
      } else {
        tr.addEventListener('click', e => {
          if (e.target.closest('.btn-delete')) return;
          openFile(item.name);
        });
        const btn = tr.querySelector('.btn-delete');
        if (btn) {
          btn.addEventListener('click', e => {
            e.stopPropagation();
            deleteFile(item.name);
          });
        }
      }
```

Replace with:

```js
      } else {
        tr.addEventListener('click', e => {
          if (e.target.closest('.btn-delete')) return;
          if (e.target.closest('.btn-favorite')) return;
          openFile(item.name);
        });
        const deleteBtn = tr.querySelector('.btn-delete');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', e => {
            e.stopPropagation();
            deleteFile(item.name);
          });
        }
        const starBtn = tr.querySelector('.btn-favorite');
        if (starBtn) {
          starBtn.addEventListener('click', async e => {
            e.stopPropagation();
            await toggleFavorite(item.name, filePath);
            starBtn.classList.toggle('active', isFavorite(filePath));
          });
        }
      }
```

**Step 3: Commit**

```bash
git add webSite/script.js
git commit -m "feat: add star toggle button to each file row in file list"
```

---

## Task 8: Frontend JS – Wire up top bar button and load favorites on init

**Files:**
- Modify: `webSite/script.js`

**Context:**
In the `DOMContentLoaded` handler at the bottom of `script.js`, we need to:
1. Call `loadFavorites()` on startup
2. Wire the `#btn-favorites` click to navigate to the favorites view

**Step 1: Add loadFavorites() to the DOMContentLoaded init**

In the `document.addEventListener('DOMContentLoaded', () => { ... })` block, the first line calls `fetchServerVersion()`. Add `loadFavorites()` right after:

```js
  fetchServerVersion();
  loadFavorites();  // ← neu
```

**Step 2: Add btn-favorites click handler**

In the same `DOMContentLoaded` block, after the settings button wiring, add:

```js
  // Favorites button
  document.getElementById('btn-favorites')
    ?.addEventListener('click', () => {
      currentPath = '__favorites__';
      updateSidebarActive();
      updateFavoritesButtonState();
      renderBreadcrumb();
      renderFileList();
    });
```

**Step 3: Call updateFavoritesButtonState() when navigating away**

In the sidebar click handler inside `loadSidebar()` (the `item.addEventListener('click', () => { ... })` block), add after `updateSidebarActive()`:

```js
      item.addEventListener('click', () => {
        currentPath = root.name;
        updateSidebarActive();
        updateFavoritesButtonState();  // ← neu
        renderBreadcrumb();
        renderFileList();
      });
```

Also in the DOMContentLoaded init where the first sidebar root is auto-selected:

```js
  loadSidebar().then(() => {
    if (sidebarRoots.length > 0) {
      currentPath = sidebarRoots[0].name;
      updateSidebarActive();
    }
    renderBreadcrumb();
    renderFileList();
  });
```

This doesn't need `updateFavoritesButtonState()` since `currentPath` is not `'__favorites__'` here.

**Step 4: Verify end-to-end in browser**

1. Open `http://localhost:<port>/main.html`
2. Click the `★` button in the top bar → breadcrumb shows "★ Favoriten", file list shows empty state
3. Navigate back to a folder → star file → star icon turns yellow/gold
4. Click top bar `★` again → file appears in favorites list
5. Click the file in favorites → preview opens
6. Click `★` in favorites list → file removed
7. Restart server → favorites still present (loaded from `favorites.json`)

**Step 5: Commit**

```bash
git add webSite/script.js
git commit -m "feat: wire favorites button, load favorites on init, active state"
```

---

## Summary of files changed

| File | Change |
|------|--------|
| `favoritesStore.js` | New – read/write favorites.json |
| `routes.js` | New routes: GET/POST /api/favorites |
| `webSite/style.css` | New: `.top-bar__btn-favorites`, `.btn-favorite`, `.favorites-path` |
| `webSite/main.html` | Add `#btn-favorites` star button to top bar |
| `webSite/script.js` | Favorites state, API calls, view rendering, row buttons, init wiring |
| `favorites.json` | Auto-created at runtime |

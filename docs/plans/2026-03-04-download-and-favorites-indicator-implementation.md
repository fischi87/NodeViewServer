# Download-Button + Favoriten-Indikator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Download-Button in der Aktionsspalte jeder Datei-Zeile + dauerhaft sichtbares Favoriten-★-Symbol direkt beim Dateinamen.

**Architecture:** Reine Frontend-Änderungen — kein Backend nötig. `/api/file?path=...` existiert bereits und liefert Dateien. Zwei Dateien werden geändert: `style.css` (zwei neue CSS-Klassen) und `script.js` (erweiterte Zeilen-Template in `renderFileList()`).

**Tech Stack:** Vanilla JS, CSS Custom Properties, Express (Backend unverändert)

---

## KONTEXT

### Aktuelle Datei-Zeilen-Struktur (`webSite/script.js`, ca. Zeile 324–337)

```js
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

Und der Click-Handler für Datei-Zeilen (ca. Zeile 347–351):
```js
tr.addEventListener('click', e => {
  if (e.target.closest('.btn-delete')) return;
  if (e.target.closest('.btn-favorite')) return;
  openFile(item.name);
});
```

### CSS-Struktur (`webSite/style.css`)

- `.file-row__actions` hat `opacity: 0` — wird bei Hover auf `1` gesetzt
- `.btn-delete` (Zeile 409): roter Button, `border: 1px solid rgba(248,113,113,0.2)`
- `.btn-favorite` (Zeile 428): transparenter Button, bei `.active` gelb (`--warning: #fbbf24`)
- `.file-row__name` (Zeile 366): `display: flex; align-items: center; gap: 0.6rem`

---

## Task 1: CSS — btn-download + file-row__fav-indicator

**Files:**
- Modify: `webSite/style.css`

**Step 1: `.btn-download` Klasse einfügen**

Nach dem Block `.btn-delete:hover { ... }` (ca. Zeile 424) folgenden Block einfügen:

```css
/* ─── DOWNLOAD BUTTON (File Row) ─────────────────────────────────────── */

.btn-download {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.18rem 0.45rem;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  cursor: pointer;
  text-decoration: none;
  font-size: 0.8rem;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.btn-download:hover {
  color: var(--text-main);
  border-color: rgba(255, 255, 255, 0.15);
  background: var(--bg-hover);
}
```

**Step 2: `.file-row__fav-indicator` Klasse einfügen**

Nach dem Block `.btn-favorite.active { ... }` (ca. Zeile 451) folgenden Block einfügen:

```css
.file-row__fav-indicator {
  color: var(--warning);
  font-size: 0.7rem;
  margin-left: 0.15rem;
  opacity: 0.85;
  flex-shrink: 0;
  line-height: 1;
}
```

**Step 3: Verifikation**

```bash
cd /Volumes/DEV/NodeViewServer && node -e "require('./routes')"
```
Erwartet: keine Ausgabe, kein Crash (CSS-Datei wird nicht von Node geladen, aber das bestätigt dass der Rest des Servers noch intakt ist).

**Step 4: Commit**

```bash
cd /Volumes/DEV/NodeViewServer
git add webSite/style.css
git commit -m "$(cat <<'EOF'
feat: add CSS for download button and favorites indicator in file list

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: JS — renderFileList() erweitern

**Files:**
- Modify: `webSite/script.js`

**Kontext:** In `renderFileList()` gibt es zwei Stellen die geändert werden müssen:
1. Den Template-Block (die Zeilen mit `const favActive`, `starBtn`, `deleteBtn`, `tr.innerHTML`)
2. Den Click-Handler der Datei-Zeilen (der `.btn-delete`/`.btn-favorite` Check)

**Step 1: Template-Block ersetzen**

Finde diesen exakten Block (ca. Zeile 324–337):

```js
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

Ersetze ihn mit:

```js
      const isFav        = item.type === 'file' && isFavorite(filePath);
      const favActive    = isFav ? ' active' : '';
      const favIndicator = isFav ? '<span class="file-row__fav-indicator">★</span>' : '';
      const starBtn      = item.type === 'file'
        ? `<button class="btn-favorite${favActive}" data-path="${filePath}" data-name="${item.name}" title="Favorit">★</button>`
        : '';
      const dlBtn        = item.type === 'file'
        ? `<a class="btn-download" href="/api/file?path=${encodeURIComponent(filePath)}" download="${escapeHtml(item.name)}" title="Herunterladen">↓</a>`
        : '';
      const deleteBtn    = item.type === 'file'
        ? `<button class="btn-delete" data-name="${item.name}">Löschen</button>`
        : '';

      tr.innerHTML = `
        <td><div class="file-row__name">${icon}<span class="${labelClass}">${item.name}</span>${favIndicator}</div></td>
        <td class="file-row__meta">${sizeCell}</td>
        <td class="file-row__meta">${dateCell}</td>
        <td class="file-row__actions">${dlBtn}${starBtn}${deleteBtn}</td>
      `;
```

**Step 2: Click-Handler um `.btn-download`-Guard erweitern**

Finde diesen Block (ca. Zeile 347–351):

```js
        tr.addEventListener('click', e => {
          if (e.target.closest('.btn-delete')) return;
          if (e.target.closest('.btn-favorite')) return;
          openFile(item.name);
        });
```

Ersetze ihn mit:

```js
        tr.addEventListener('click', e => {
          if (e.target.closest('.btn-delete')) return;
          if (e.target.closest('.btn-favorite')) return;
          if (e.target.closest('.btn-download')) return;
          openFile(item.name);
        });
```

**Step 3: Manueller Smoke-Test**

Server starten: `cd /Volumes/DEV/NodeViewServer && node server.js`

Im Browser prüfen:
- [ ] Datei-Zeile zeigt beim Hover: `↓ ★ Löschen`
- [ ] Klick auf `↓` startet Download (kein Viewer, kein Navigieren)
- [ ] Favorisierte Datei zeigt `★` Symbol direkt beim Dateinamen (auch ohne Hover)
- [ ] Nicht-favorisierte Datei zeigt kein `★` beim Namen
- [ ] Klick auf Dateinamen öffnet weiterhin Vorschau/Viewer
- [ ] Ordner-Zeilen haben weiterhin keinen Download-Button und kein Favoriten-Symbol

**Step 4: Commit**

```bash
cd /Volumes/DEV/NodeViewServer
git add webSite/script.js
git commit -m "$(cat <<'EOF'
feat: add download button and persistent favorites indicator to file list

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Push

```bash
cd /Volumes/DEV/NodeViewServer && git push
```

---

## Manuelle End-to-End-Prüfung

1. Datei downloaden: In einem Verzeichnis mit Dateien auf `↓` klicken → Datei wird heruntergeladen
2. Favoriten-Stern sichtbar: Datei favorisieren → kleines `★` erscheint beim Namen, auch ohne Hover
3. Favorit entfernen: Stern-Button klicken → kleines `★` beim Namen verschwindet sofort
4. Zeilen-Klick unbeeinflusst: Klick auf Dateinamen öffnet weiterhin Viewer
5. Ordner unverändert: Ordner-Zeilen haben weiterhin nur den Löschen-Button

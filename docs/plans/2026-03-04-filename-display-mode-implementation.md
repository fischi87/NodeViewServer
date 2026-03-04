# Dateiname-Anzeigemodus Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Dateinamen mit Kamera-Timestamp-Muster lesbar anzeigen (3 Modi: Original / Lesbar / Nur Datum), umschaltbar im Settings-Modal.

**Architecture:** Reine Frontend-Änderungen. Eine neue `formatFilename(name, mode)`-Funktion in `script.js` parst Kamera-Dateinamen per Regex (identisch zur iOS-Logik). Der gewählte Modus wird in `localStorage` gespeichert und sofort beim Klick auf den Radio-Button angewendet. Neue Sektion im bestehenden Settings-Modal mit 3 Radio-Buttons.

**Tech Stack:** Vanilla JS, localStorage, CSS Custom Properties

---

## KONTEXT

### Dateiname-Muster

Kamera-Dateien folgen dem Schema: `Prefix_Index_YYYYMMDDHHMMSS.ext`
Beispiel: `Vorne_00_20260304195021.mp4`

Regex (ohne Extension): `^(.*?)(?:_(\d+))?_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$`

### Anzeigemodi

| Modus | Beispiel-Ausgabe |
|-------|-----------------|
| `original` (default) | `Vorne_00_20260304195021.mp4` |
| `readable` | `Vorne 00 — 04.03.2026, 19:50` |
| `dateOnly` | `04.03.2026, 19:50` |

### Betroffene Render-Stellen in `webSite/script.js`

**`renderFileList()`** ca. Zeile 338:
```js
<span class="${labelClass}">${escapeHtml(item.name)}</span>
```
→ `item.name` wird durch `formatFilename(item.name, getFilenameMode())` ersetzt.

**`renderFavoritesView()`** ca. Zeile 218:
```js
${escapeHtml(fav.alias || fav.name)}
```
→ `fav.name` wird durch `formatFilename(fav.name, getFilenameMode())` ersetzt.

### Settings-Modal HTML (`webSite/main.html`)

Aktueller `settings-modal__body`-Inhalt (gekürzt):
```html
<div class="settings-modal__body">
  <div class="settings-section__label">Freigegebene Pfade</div>
  <div id="settings-paths-list" ...></div>
  <div class="settings-section__label" style="margin-top:1.5rem">Pfad hinzufügen</div>
  <div class="settings-add-form">...</div>
  <div id="settings-errors" ...></div>
</div>
```

Die neue Sektion kommt **nach** `id="settings-errors"` und **vor** `</div>` (Ende von `settings-modal__body`).

### Settings-Modal JS (`webSite/script.js`)

`openSettingsModal()` lädt aktuell die Pfade und setzt die Inputs zurück.
Der neue Code muss dort die Radio-Buttons mit dem gespeicherten Modus vorbelegen.

---

## Task 1: CSS — Display-Mode-Selector Styles

**Files:**
- Modify: `webSite/style.css`

**Step 1: Neue CSS-Klassen nach dem `.settings-save-btn`-Block einfügen**

Suche den Block `.settings-save-btn { ... }` (letzter Block vor dem `@media`-Query im Settings-Bereich). Füge **danach** (aber vor dem `@media`) ein:

```css
/* ─── DISPLAY MODE SELECTOR (Settings) ───────────────────────────────── */

.settings-display-mode {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.settings-display-mode__option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.12s;
  background: rgba(255, 255, 255, 0.02);
}

.settings-display-mode__option:hover {
  background: var(--bg-hover);
}

.settings-display-mode__option input[type="radio"] {
  accent-color: var(--accent);
  flex-shrink: 0;
  cursor: pointer;
}

.settings-display-mode__option-label {
  font-size: 0.85rem;
  color: var(--text-main);
  font-weight: 500;
  min-width: 5.5rem;
}

.settings-display-mode__example {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**Step 2: Syntax-Check**

```bash
cd /Volumes/DEV/NodeViewServer && node -e "require('./routes')" && echo OK
```
Erwartet: `OK`

**Step 3: Commit**

```bash
cd /Volumes/DEV/NodeViewServer
git add webSite/style.css
git commit -m "$(cat <<'EOF'
feat: add CSS for filename display mode selector in settings

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: HTML — Neue Sektion im Settings-Modal

**Files:**
- Modify: `webSite/main.html`

**Step 1: Neue Sektion in `settings-modal__body` einfügen**

Finde `<div id="settings-errors" class="settings-errors"></div>` im Settings-Modal.
Füge **danach** (aber noch innerhalb von `<div class="settings-modal__body">`) ein:

```html
      <!-- Dateiname-Anzeige -->
      <div class="settings-section__label" style="margin-top:1.5rem">Dateiname-Anzeige</div>
      <div class="settings-display-mode">
        <label class="settings-display-mode__option">
          <input type="radio" name="filename-display-mode" value="original">
          <span class="settings-display-mode__option-label">Original</span>
          <span class="settings-display-mode__example">Vorne_00_20260304195021.mp4</span>
        </label>
        <label class="settings-display-mode__option">
          <input type="radio" name="filename-display-mode" value="readable">
          <span class="settings-display-mode__option-label">Lesbar</span>
          <span class="settings-display-mode__example">Vorne 00 — 04.03.2026, 19:50</span>
        </label>
        <label class="settings-display-mode__option">
          <input type="radio" name="filename-display-mode" value="dateOnly">
          <span class="settings-display-mode__option-label">Nur Datum</span>
          <span class="settings-display-mode__example">04.03.2026, 19:50</span>
        </label>
      </div>
```

**Step 2: Commit**

```bash
cd /Volumes/DEV/NodeViewServer
git add webSite/main.html
git commit -m "$(cat <<'EOF'
feat: add filename display mode section to settings modal

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: JS — formatFilename, Render-Stellen, Settings-Handler

**Files:**
- Modify: `webSite/script.js`

**Step 1: `formatFilename`, `getFilenameMode`, `setFilenameMode` hinzufügen**

Finde in `script.js` den Block mit `function escapeHtml(s) { ... }` (ca. Zeile 24–30). Füge **danach** diese drei Funktionen ein:

```js
// ─── DATEINAME-FORMATIERUNG ──────────────────────────────────────────────────

const CAMERA_NAME_REGEX = /^(.*?)(?:_(\d+))?_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/;

function formatFilename(name, mode) {
  if (!mode || mode === 'original') return name;
  const base  = name.replace(/\.[^.]+$/, ''); // Extension entfernen
  const match = base.match(CAMERA_NAME_REGEX);
  if (!match) return name;
  const [, prefix, index, year, month, day, hour, minute] = match;
  const dateStr = `${day}.${month}.${year}, ${hour}:${minute}`;
  if (mode === 'dateOnly') return dateStr;
  const parts = prefix ? [prefix] : [];
  if (index !== undefined) parts.push(index);
  return parts.length > 0 ? `${parts.join(' ')} — ${dateStr}` : dateStr;
}

function getFilenameMode() {
  return localStorage.getItem('filenameDisplayMode') || 'original';
}

function setFilenameMode(mode) {
  localStorage.setItem('filenameDisplayMode', mode);
}
```

**Step 2: `renderFileList()` anpassen**

Finde in `renderFileList()` diese Zeile (ca. Zeile 338 nach den letzten Commits, Zeile kann leicht abweichen — suche nach `file-row__label`):

```js
        <td><div class="file-row__name">${icon}<span class="${labelClass}">${escapeHtml(item.name)}</span>${favIndicator}</div></td>
```

Ersetze sie mit:

```js
        <td><div class="file-row__name">${icon}<span class="${labelClass}">${escapeHtml(formatFilename(item.name, getFilenameMode()))}</span>${favIndicator}</div></td>
```

**Step 3: `renderFavoritesView()` anpassen**

Finde in `renderFavoritesView()` diese Zeile (ca. Zeile 218):

```js
      <td><div class="file-row__name">${ICON_FILE}<span class="file-row__label">${escapeHtml(fav.alias || fav.name)}</span></div></td>
```

Ersetze sie mit:

```js
      <td><div class="file-row__name">${ICON_FILE}<span class="file-row__label">${escapeHtml(fav.alias || formatFilename(fav.name, getFilenameMode()))}</span></div></td>
```

**Step 4: `openSettingsModal()` anpassen — Radio-Buttons vorbelegen**

Finde die Funktion `openSettingsModal()`. Am Anfang des Funktionskörpers (direkt nach dem `const overlay = ...` und den `document.getElementById` Resets) füge hinzu:

```js
  // Aktuellen Anzeigemodus in Radio-Buttons setzen
  const currentMode = getFilenameMode();
  document.querySelectorAll('input[name="filename-display-mode"]').forEach(radio => {
    radio.checked = radio.value === currentMode;
  });
```

**Step 5: Radio-Change-Event-Listener im DOMContentLoaded hinzufügen**

Finde im `DOMContentLoaded`-Block den Bereich mit den Settings-Event-Listenern (suche nach `btn-settings`). Füge nach dem letzten Settings-Listener einen neuen hinzu:

```js
  // Dateiname-Anzeigemodus: sofort anwenden bei Klick
  document.querySelectorAll('input[name="filename-display-mode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      setFilenameMode(radio.value);
      renderFileList();
    });
  });
```

**Step 6: Syntax-Check**

```bash
cd /Volumes/DEV/NodeViewServer && node -e "
const fs = require('fs');
new Function(fs.readFileSync('webSite/script.js', 'utf8'));
console.log('OK');
"
```
Erwartet: `OK`

**Step 7: Commit**

```bash
cd /Volumes/DEV/NodeViewServer
git add webSite/script.js
git commit -m "$(cat <<'EOF'
feat: filename display mode – formatFilename, settings integration, render update

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Push

```bash
cd /Volumes/DEV/NodeViewServer && git push
```

---

## Manueller Smoke-Test

Server starten: `node server.js`

1. **Standard:** Dateiliste zeigt Original-Namen (kein Umbenennen ohne Modal)
2. **Lesbar:** Settings öffnen → „Lesbar" wählen → Liste zeigt sofort `Vorne 00 — 04.03.2026, 19:50`
3. **Nur Datum:** „Nur Datum" wählen → Liste zeigt `04.03.2026, 19:50`
4. **Seitenreload:** Modus bleibt nach Reload erhalten (localStorage)
5. **Nicht-Kamera-Dateien:** Bleiben immer im Original (`README.md`, `config.json` etc.)
6. **Favoriten-Ansicht:** Zeigt bei Kamera-Favoriten auch den formatierten Namen (sofern kein Alias gesetzt)
7. **Alias hat Vorrang:** Favorit mit Alias zeigt immer den Alias, nicht den formatierten Namen

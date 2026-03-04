# Design: Dateiname-Anzeigemodus im Web

**Datum:** 2026-03-04
**Projekt:** NodeViewServer

---

## Ziel

Dateinamen mit Kamera-Timestamp-Muster (z.B. `Vorne_00_20260304195021.mp4`) werden in der Dateiliste lesbar angezeigt. Der Nutzer kann zwischen drei Modi wechseln, wie in der iOS-App.

---

## Anzeigemodi

| Modus | Beispiel |
|-------|---------|
| `original` | `Vorne_00_20260304195021.mp4` |
| `readable` | `Vorne 00 — 04.03.2026, 19:50` |
| `dateOnly` | `04.03.2026, 19:50` |

Dateien die das Muster nicht erfüllen, werden immer im Original angezeigt.

---

## Kamera-Muster (Regex)

`^(.*?)(?:_(\d+))?_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$` (auf Basis ohne Extension)

- Gruppe 1: Prefix (z.B. `Vorne`)
- Gruppe 2: Optional Index (z.B. `00`)
- Gruppen 3–8: Year, Month, Day, Hour, Minute, Second

Identisch zur iOS `FilenameFormatter.swift`-Logik.

---

## Persistenz

`localStorage.getItem('filenameDisplayMode')` — Werte: `original`, `readable`, `dateOnly`. Default: `original`.

---

## UX

- Neue Sektion **„Dateiname-Anzeige"** im bestehenden Settings-Modal, unter den Freigegebenen Pfaden
- 3 Radio-Buttons mit Beispiel-Text
- **Sofortige Wirkung:** Beim Klick auf einen Radio-Button wird `renderFileList()` sofort aufgerufen — kein separates Speichern nötig (reine localStorage-Einstellung)

---

## Verwendung

`formatFilename(name, mode)` ersetzt den Anzeige-Text:
- `renderFileList()` — `<span class="file-row__label">`
- `renderFavoritesView()` — `fav.alias || formatFilename(fav.name, mode)` (Alias hat Vorrang)

---

## Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `webSite/style.css` | `.settings-display-mode` + `.settings-display-mode__option` + `.settings-display-mode__example` |
| `webSite/main.html` | Neue Sektion im `settings-modal__body` |
| `webSite/script.js` | `formatFilename()`, `getFilenameMode()`, `setFilenameMode()`, Verwendung in render-Funktionen, Radio-Change-Handler |

## Nicht-Ziele (YAGNI)

- Keine Server-Änderungen
- Kein separater „Speichern"-Button für den Modus
- Keine Sortierung nach formatiertem Name

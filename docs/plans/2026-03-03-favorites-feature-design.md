# Design: Favoriten-Feature

**Datum:** 2026-03-03
**Projekt:** NodeViewServer

---

## Zusammenfassung

Hinzufügen eines Favoriten-Features: Stern-Icon in der Top-Bar, Favoriten-Ansicht als Inline-Panel im Hauptbereich, Favoritisieren von Dateien direkt aus der Dateiliste, serverseitige Persistenz via `favorites.json`.

---

## 1. Top Bar – Stern-Icon

- Neuer `<button id="btn-favorites">` mit Stern-SVG-Icon wird **links vom Settings-Icon** in `.top-bar__actions` eingefügt
- Klick wechselt in die Favoriten-Ansicht (`currentPath = '__favorites__'`)
- Wenn Favoriten-Ansicht aktiv: Icon leuchtet in `--accent` Farbe auf (CSS-Klasse `active`)

---

## 2. Favoriten-Ansicht (Inline-Panel)

Wenn `currentPath === '__favorites__'`:
- Breadcrumb zeigt: `★ Favoriten`
- Dateiliste zeigt alle gespeicherten Favoriten
- Tabellenspalten: **Name**, **Pfad**, **Aktionen** (Datei öffnen + Favorit entfernen)
- Leere-Zustand: "Noch keine Favoriten gespeichert."
- Klick auf eine Zeile öffnet die Datei via `openFile()` (nutzt `/api/file?path=...`)

---

## 3. Favorit hinzufügen / entfernen

- In der normalen Dateiliste bekommt jede **Datei-Zeile** einen kleinen `★` Button in der Aktions-Spalte (neben "Löschen")
- Wenn die Datei bereits favorisiert ist: Icon ist ausgefüllt/farbig (Toggle-Verhalten)
- Klick fügt hinzu oder entfernt den Favoriten sofort (kein Bestätigungs-Dialog)

---

## 4. Datenmodell

```json
{
  "favorites": [
    { "name": "bericht.pdf", "path": "Kamera/2024/bericht.pdf" }
  ]
}
```

- `name`: Dateiname (für Anzeige)
- `path`: Relativer Pfad wie bei `/api/file?path=...`
- Gespeichert in `favorites.json` im Root-Verzeichnis des Servers

---

## 5. Backend – neue Endpunkte

### `GET /api/favorites`
Gibt alle gespeicherten Favoriten zurück.
```json
{ "favorites": [...] }
```

### `POST /api/favorites`
Speichert die gesamte Favoritenliste (ersetzt alles).
```json
{ "favorites": [...] }
```

---

## 6. Dateien die geändert werden

| Datei | Änderung |
|-------|----------|
| `webSite/main.html` | Stern-Button in Top Bar, kein neues Modal nötig |
| `webSite/script.js` | `renderFavoritesList()`, Favoriten-Logik, API-Calls, Toggle-Button in Dateiliste |
| `webSite/style.css` | `.top-bar__btn-favorites`, `.btn-favorite`, `.btn-favorite.active` |
| `server.js` (oder Haupt-Server-Datei) | `GET /api/favorites`, `POST /api/favorites` |
| `favorites.json` | Neu, automatisch angelegt |

---

## 7. iOS-App Kompatibilität

Die iOS-App (`/Volumes/DEV/NodeView`) nutzt dieselbe API-Basis. Die neuen Endpunkte können später in `FileService.swift` ergänzt werden.

---

## Nicht-Ziele (YAGNI)

- Keine Ordner als Favoriten (nur Dateien)
- Keine Drag-and-Drop-Sortierung der Favoriten
- Keine Kategorisierung/Tags

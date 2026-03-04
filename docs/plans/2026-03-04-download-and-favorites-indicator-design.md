# Design: Download-Button + Favoriten-Indikator

**Datum:** 2026-03-04
**Projekt:** NodeViewServer

---

## Ziel

Zwei UI-Verbesserungen für die Dateiliste im Web-Frontend:
1. Download-Button in der Aktionsspalte jeder Datei-Zeile
2. Permanenter Favoriten-Indikator (★) direkt beim Dateinamen

---

## 1. Download-Button

### Ansatz

Ein `<a download>` Element in der Aktionsspalte, das den bereits vorhandenen `/api/file?path=...` Endpoint nutzt. Kein neues Backend erforderlich.

### Details

- **Element:** `<a>` mit `download` Attribut und `href="/api/file?path=<encodeURIComponent(filePath)>"`
- **Icon:** Pfeil-nach-unten SVG
- **CSS-Klasse:** `btn-download`
- **Sichtbarkeit:** Nur beim Hover (wie Stern & Löschen-Button — via `.file-row:hover .file-row__actions { opacity: 1 }`)
- **Position:** In der Aktionsspalte vor dem Stern-Button: `[↓] [★] [Löschen]`
- **Nur für Dateien:** Ordner bekommen keinen Download-Button (wie beim Stern-Button)

### Visuelles Verhalten

```
Datei.pdf   123 KB   04.03.26   [↓] [★] [Löschen]   ← beim Hover
Ordner/      —        —          [Löschen]              ← kein Download, kein Stern
```

---

## 2. Favoriten-Indikator beim Dateinamen

### Ansatz

Ein kleines `★`-Symbol direkt nach dem Dateinamen in der ersten Spalte — immer sichtbar, unabhängig vom Hover-Status der Zeile.

### Details

- **Position:** Nach dem `<span class="file-row__label">`, innerhalb der `.file-row__name`-Div
- **Element:** `<span class="file-row__fav-indicator">★</span>` (nur wenn Datei favorisiert)
- **CSS:** Klein (0.7rem), gelb (`--warning`), leicht transparent, kein Hover-Effekt

### Visuelles Verhalten

```
📄 Favorit.pdf ★    123 KB   04.03.26
📄 Datei.pdf         456 KB   04.03.26
```

---

## Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `webSite/script.js` | `renderFileList()`: Download-Link + Favoriten-Indikator einfügen |
| `webSite/style.css` | `.btn-download` + `.file-row__fav-indicator` hinzufügen |

## Nicht-Ziele (YAGNI)

- Kein Massen-Download mehrerer Dateien
- Kein Download von Ordnern (ZIP)
- Kein Fortschrittsbalken
- Kein Favoriten-Indikator in der Favoriten-Ansicht (dort ist alles ein Favorit)

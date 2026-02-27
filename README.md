# NodeViewServer

Der **NodeViewServer** ist ein moderner, einfacher und sicherer Datei- und Pfadserver,
entwickelt **in Kombination mit der NodeView iOS-App**, die:

- sich am Server authentifizieren kann
- freigegebene Pfade und Dateien durchsucht
- Dateien lädt und anzeigt
- neue Pfade freigeben kann
- Server-Einstellungen abfragt
- erkennt, wenn ein Server-Update verfügbar ist (`/api/version`)
- den Server per Button aktualisieren kann (`/api/update`)

Der Server läuft vollständig unter **Node.js** und ist durch ein Installationsscript besonders einfach einzurichten.

---

## 🚀 Features

- 🔐 **Login-System** (bcrypt + Session)
- 📂 **Pfad-Freigabe-System** (`paths.json`) – kompatibel mit der iOS-App
- 📁 **File Browser API** für Dateien & Ordner
- 🔒 **Rate Limiting** & Session-Security
- 🔧 **Automatische Konfiguration** durch `install.sh`
- 🔄 **Update-System** mit `update.sh` und API-Update-Trigger
- 📡 **Version API** (`/api/version`) für App-seitige Update-Erkennung
- 🌐 **Whitelist-Unterstützung** für IP-basierte Einschränkungen
- ⚙️ Optional: **PM2 + Autostart**

---

## 📋 Voraussetzungen

- **Node.js** v18 oder neuer → [nodejs.org](https://nodejs.org)
- **npm** (wird mit Node.js mitgeliefert)
- **git** (für Updates via `update.sh` und die App-interne Update-Funktion)
- Optional: **PM2** für automatischen Neustart nach Systemstart

---

## 📥 Installation

### 1. Repository klonen

```bash
git clone https://github.com/fischi87/NodeViewServer.git
cd NodeViewServer
```

### 2. Setup-Script ausführen

```bash
bash install.sh
```

> **Hinweis:** Mit `bash` aufrufen (nicht `sh`). Das Script erkennt fehlende
> Bash-Umgebungen und startet sich automatisch neu – zur Sicherheit immer `bash` verwenden.

Das Script richtet automatisch ein:

- npm-Abhängigkeiten
- `.env` (SESSION_SECRET + Passwort-Hash)
- `config.js` (Port, Verzeichnisse, Benutzer)
- `paths.json` (Startverzeichnis)
- Optional: selbstsigniertes HTTPS-Zertifikat **mit SAN** (iOS-kompatibel)
- Optional: PM2 + Autostart

---

## 🔒 HTTPS einrichten (empfohlen)

Wird während `install.sh` angeboten. Nachträglich aktivieren:

```bash
bash setup-ssl.sh
```

Zurück zu HTTP:

```bash
bash disable-ssl.sh
```

> Das selbstsignierte Zertifikat enthält einen **Subject Alternative Name (SAN)**,
> damit die iOS-App (iOS 13+) und moderne Browser die Verbindung akzeptieren.

---

## ▶️ Server starten

**Mit PM2** (empfohlen – läuft nach Neustart automatisch weiter):

```bash
pm2 start server.js --name nodeviewserver --time
pm2 save
```

**Ohne PM2:**

```bash
npm start
```

---

## 🔑 Passwort zurücksetzen

```bash
node hashPassword.js
# oder direkt:
node hashPassword.js "NeuesPasswort123"
```

Den ausgegebenen Hash in die `.env`-Datei eintragen:

```
USER_AXEL_HASH=$2b$10$...
```

---

## 🔄 Updates

```bash
bash update.sh
```

Oder über den **Update-Button in der iOS-App** – erfordert, dass der Server per `git clone` installiert wurde.

---

## 📁 Projektstruktur

| Datei/Ordner      | Beschreibung                        |
|-------------------|-------------------------------------|
| `server.js`       | Einstiegspunkt                      |
| `routes.js`       | API-Routen                          |
| `auth.js`         | Login & Session                     |
| `fileUtils.js`    | Datei-Hilfsfunktionen               |
| `pathsStore.js`   | Pfad-Verwaltung                     |
| `install.sh`      | Ersteinrichtung                     |
| `update.sh`       | Update-Script                       |
| `setup-ssl.sh`    | SSL nachträglich einrichten         |
| `disable-ssl.sh`  | SSL deaktivieren                    |
| `.env`            | Secrets *(nicht im Git)*            |
| `config.js`       | Konfiguration *(nicht im Git)*      |
| `paths.json`      | Freigabe-Pfade *(nicht im Git)*     |
| `.ssl/`           | SSL-Zertifikate *(nicht im Git)*    |

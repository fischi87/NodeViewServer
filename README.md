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

- 🔐 **Login-System** (bcrypt + persistente Sessions, überleben Neustarts)
- 📂 **Pfad-Freigabe-System** (`paths.json`) – kompatibel mit der iOS-App
- 📁 **File Browser API** für Dateien & Ordner
- 📱 **Responsive Web-UI**: erkennt Handy, Tablet und PC automatisch (umschaltbar unter Einstellungen → Ansicht)
- 🔒 **Rate Limiting**, CSRF-Schutz (Origin-Check), Security-Header, sichere Downloads
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

## 🌍 Zugriff von unterwegs (empfohlen: Tailscale)

Den Server **nicht per Portfreigabe ins Internet stellen** – bei DS-Lite-Anschlüssen ist
eine IPv4-Portfreigabe ohnehin nicht möglich. Stattdessen **Tailscale** (privates VPN,
kostenlos für Privatnutzung): Es braucht keine Freigabe, der Server ist nicht öffentlich
erreichbar, und es gibt ein echtes HTTPS-Zertifikat ohne Browser-Warnung.

1. Auf dem Server ausführen und **Option 3 (Tailscale-Zertifikat)** wählen:

   ```bash
   bash setup-ssl.sh
   pm2 restart nodeviewserver
   ```

   Das Skript installiert Tailscale bei Bedarf (Linux, offizielles Skript von tailscale.com),
   zeigt einen Anmelde-Link für den Browser und holt danach das Zertifikat.
2. Wenn das Skript es verlangt: in der [Tailscale-Admin-Konsole](https://login.tailscale.com/admin/dns) unter **DNS** *MagicDNS* und *HTTPS Certificates* aktivieren und im Skript Enter drücken (das lässt sich nicht automatisieren).
3. Tailscale-App auf Handy/PC installieren und mit **demselben Konto** anmelden.
4. Aufruf von überall (mit aktivem Tailscale): `https://<servername>.<netz>.ts.net:<PORT>`

Das Zertifikat gilt ca. 90 Tage. `setup-ssl.sh` trägt auf Wunsch einen Cronjob ein, der es
wöchentlich über `renew-tailscale-cert.sh` erneuert; der laufende Server lädt es täglich
neu, ein Neustart ist nicht nötig. Auf dem Handy kann Tailscale als „Verbindung bei Bedarf“
laufen und verbraucht dann kaum Akku. Geräte ohne Tailscale haben **keinen** Zugriff.

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

Den ausgegebenen Hash in der `.env` beim Benutzer eintragen. Der genaue Variablenname
steht in `config.js` unter `users` (bei Benutzer „Axel“ z. B. `USER_AXEL_HASH`):

```
USER_AXEL_HASH=$2b$10$...
```

Danach neu starten (`pm2 restart nodeviewserver`).

---

## ⚙️ Konfiguration (`config.js`)

| Option              | Bedeutung                                                                      |
|---------------------|--------------------------------------------------------------------------------|
| `allowedBasePaths`  | Verzeichnisse, unter denen Freigaben erlaubt sind                              |
| `expertMode`        | `true` erlaubt Freigaben außerhalb von `allowedBasePaths` (nur bewusst nutzen) |
| `trustProxy`        | `true` nur hinter Reverse-Proxy (nginx/Caddy), sonst `false`                   |
| `favoritesDir`      | Ordner für Favoriten-Dateien (Standard: `favorites/` im Serverordner)           |
| `allowRemoteUpdate` | `false` sperrt den Update-Button der App                                       |
| `whitelist`         | IPs, die `/files/*` ohne Login nutzen dürfen (Standard: leer)                  |

## ⭐ Favoriten

Wer eine Datei mit ★ markiert, **verschiebt** sie in den geschützten Ordner `favorites/`
(Einstellung `favoritesDir`). Dort erreichen sie externe Aufräum- oder Löschroutinen
(z. B. Skripte, die alte Aufnahmen entfernen) nicht mehr. Beim Entfernen des ★ wird die
Datei an ihren ursprünglichen Ort zurückverschoben.

- `favoritesDir` muss **außerhalb** der freigegebenen Verzeichnisse und des Bereichs
  der Löschroutine liegen (der Server warnt beim Start, wenn nicht).
- Alte Favoriten (reine Verweise) werden beim ersten Laden verschoben, sofern die Datei
  noch existiert; sonst erscheinen sie mit ⚠ als „nicht mehr vorhanden“.

## 🛡️ Sicherheitshinweise

- **HTTPS verwenden**, sonst wird das Passwort im Klartext übers Netzwerk geschickt.
- Den Server **nicht ungeschützt ins Internet** stellen; für Zugriff von außen ein VPN (z. B. WireGuard/Tailscale) nutzen.
- `.env`, `config.js`, `.ssl/` und `.sessions/` enthalten Geheimnisse und sind nicht im Git.
- Bilder, Videos, Audio und PDFs werden inline ausgeliefert (Vorschau/Streaming). Alles andere – insbesondere HTML, SVG und Skripte – kommt nur als Download, damit es nie im Kontext der App ausgeführt wird.

---

## 🔄 Updates

```bash
bash update.sh
```

Oder über den **Update-Button in der iOS-App** – erfordert, dass der Server per `git clone` installiert wurde.

Das Update macht nur Fast-Forward-Pulls, installiert Abhängigkeiten exakt nach `package-lock.json`
und setzt bei einem Fehler automatisch auf den vorherigen Stand zurück. Ausgabe: `update.log`.

---

## 📁 Projektstruktur

| Datei/Ordner      | Beschreibung                        |
|-------------------|-------------------------------------|
| `server.js`       | Einstiegspunkt                      |
| `routes.js`       | API-Routen                          |
| `auth.js`         | Login & Session                     |
| `webSite/`        | Web-UI (`device.js` erkennt Handy/PC, `mobile.css` Handy-Layout) |
| `fileUtils.js`    | Datei-Hilfsfunktionen               |
| `pathsStore.js`   | Pfad-Verwaltung                     |
| `sessionStore.js` | Persistenter Session-Store          |
| `favoritesStore.js` | Favoriten                         |
| `install.sh`      | Ersteinrichtung                     |
| `update.sh`       | Update-Script                       |
| `setup-ssl.sh`    | SSL nachträglich einrichten (inkl. Tailscale) |
| `renew-tailscale-cert.sh` | Tailscale-Zertifikat erneuern |
| `disable-ssl.sh`  | SSL deaktivieren                    |
| `.sessions/`      | Login-Sessions *(nicht im Git)*     |
| `favorites/`      | Geschützte Favoriten *(nicht im Git)* |
| `.env`            | Secrets *(nicht im Git)*            |
| `config.js`       | Konfiguration *(nicht im Git)*      |
| `paths.json`      | Freigabe-Pfade *(nicht im Git)*     |
| `.ssl/`           | SSL-Zertifikate *(nicht im Git)*    |

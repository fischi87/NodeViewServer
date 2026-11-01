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

### Kurz-Checkliste für eine neue Installation

1. `git clone` + `bash install.sh` (Port, Verzeichnis, Benutzer, Passwort; PM2 mit Autostart bestätigen).
2. Im Browser testen: `http(s)://<SERVER-IP>:<PORT>` im Heimnetz.
3. Von unterwegs erreichen: [Tailscale einrichten](#-zugriff-von-unterwegs-mit-tailscale-empfohlen)
   (`bash setup-ssl.sh` → Option 3, Key Expiry abschalten, Tailscale-App auf dem Handy).
4. Updates später: Update-Button in der App oder `bash update.sh`.

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

`setup-ssl.sh` bietet drei Varianten an:

| Option | Wann | Browser-Warnung |
|---|---|---|
| 1) Selbstsigniert | Nur im Heimnetz, schnell eingerichtet | ja (einmal bestätigen) |
| 2) Vorhandenes Zertifikat | Du hast schon eins (z. B. Let's Encrypt) | nein |
| 3) Tailscale | Zugriff von unterwegs, auch bei DS-Lite | nein – siehe [Zugriff von unterwegs](#-zugriff-von-unterwegs-mit-tailscale-empfohlen) |

---

## 🌍 Zugriff von unterwegs mit Tailscale (empfohlen)

**Problem:** Eine Portfreigabe im Router ist unsicher und bei **DS-Lite-Anschlüssen** (keine eigene
öffentliche IPv4) gar nicht möglich. Außerdem warnt der Browser bei einem selbstsignierten
HTTPS-Zertifikat immer.

**Lösung:** [Tailscale](https://tailscale.com) ist ein privates VPN. Nur deine eigenen Geräte
(Server, Handy, PC) sehen sich darüber. Es braucht **keine Portfreigabe**, der Server ist **nicht
öffentlich erreichbar**, und es gibt ein **echtes HTTPS-Zertifikat ohne Browser-Warnung**.
Für Privatnutzung ist Tailscale kostenlos (Tarif und Bedingungen bei tailscale.com prüfen).

Wichtig zu wissen:

- Tailscale auf dem Server leitet **keinen anderen Datenverkehr um**. Andere Dienste auf dem
  Rechner (z. B. ioBroker) laufen unverändert über das normale Netzwerk weiter.
- Auf dem Handy läuft nur der Verkehr zu deinen eigenen Geräten durch den Tunnel, normales
  Internet geht direkt. Das VPN bleibt im Hintergrund an, bis du es in der App ausschaltest,
  und verbraucht im Leerlauf kaum Akku.
- **Jedes Gerät, das auf den Server zugreifen soll, braucht Tailscale.** Ohne Tailscale gibt es
  von außen keinen Zugriff (das ist gewollt).

### Einrichtung (einmalig, ca. 15 Minuten)

**1. Tailscale-Konto anlegen**
Auf [login.tailscale.com](https://login.tailscale.com) mit einem Konto anmelden (Google, Microsoft,
Apple o. Ä.). Dieses Konto brauchst du später für **alle** Geräte.

**2. Auf dem Server: Zertifikat einrichten**

```bash
cd ~/NodeViewServer
bash update.sh          # sicherstellen, dass der neueste Stand installiert ist
bash setup-ssl.sh       # y  →  Option 3 (Tailscale-Zertifikat)
pm2 restart nodeviewserver
```

Das Skript erledigt der Reihe nach:

1. Tailscale installieren, falls es fehlt (Linux, offizielles Skript von tailscale.com, braucht `sudo`).
2. Server anmelden: Es zeigt einen **Link**, den du im Browser öffnest und mit deinem Konto bestätigst.
3. Zertifikat für den Server-Namen (`<servername>.<netz>.ts.net`) holen und eintragen.
4. Auf Wunsch (Standard: ja) einen **Cronjob** einrichten, der das Zertifikat jede Woche erneuert.

**3. In der Tailscale-Admin-Konsole (lässt sich nicht automatisieren)**
Auf [login.tailscale.com/admin/dns](https://login.tailscale.com/admin/dns):

- **MagicDNS** aktivieren
- **HTTPS Certificates** aktivieren

Das Skript fragt danach, sobald es nötig ist, und wartet auf Enter. Lass **„Override local DNS“**
ausgeschaltet, damit die DNS-Einstellungen des Servers unverändert bleiben.

**4. Wichtig: Key Expiry für den Server abschalten**
Tailscale-Geräte müssen sich standardmäßig nach etwa **180 Tagen neu anmelden**. Läuft das beim
Server ab, ist er plötzlich nicht mehr erreichbar. Deshalb:

1. [login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines) öffnen
2. Beim Server die drei Punkte `⋯` anklicken
3. **Disable key expiry** wählen

(Für Handy und PC kann die Neuanmeldung bleiben.)

**5. Auf dem Handy / PC**

1. Tailscale-App installieren (App Store, Play Store oder [tailscale.com/download](https://tailscale.com/download)).
2. Mit **demselben Konto** anmelden.
3. Den Schalter einschalten (beim ersten Mal die VPN-Erlaubnis bestätigen).
4. Im Browser öffnen: `https://<servername>.<netz>.ts.net:<PORT>`
   (den genauen Namen zeigt `setup-ssl.sh` am Ende an; der Port steht in `config.js`).

**6. Die NodeView-iOS-App** auf dieselbe Adresse umstellen. Auch zu Hause besser den
Tailscale-Namen verwenden, denn über die alte LAN-IP passt das Zertifikat nicht zum Namen
(Browser-Warnung).

### Prüfen, ob alles läuft

- **Von außen testen:** WLAN am Handy ausschalten und die Adresse über Mobilfunk öffnen.
- **Server-Log:** `pm2 logs nodeviewserver` → es muss `HTTPS-Server läuft auf https://localhost:<PORT>` erscheinen.
- **Cronjob:** `crontab -l` → eine Zeile mit `renew-tailscale-cert.sh` (montags 04:17 Uhr).
- **Zertifikat manuell erneuern:** `bash renew-tailscale-cert.sh` (der Server lädt es innerhalb von 24 Stunden selbst neu, kein Neustart nötig). Ausgabe des Cronjobs: `cert-renew.log`.

### Zertifikat und Verlängerung

Das Tailscale-Zertifikat gilt ca. **90 Tage**. Der Cronjob erneuert es wöchentlich über
`renew-tailscale-cert.sh`; der laufende Server liest es täglich neu ein. Läuft auf dem Rechner kein
Cron-Dienst (selten), das Skript alle paar Wochen von Hand ausführen.

### Mehrere Personen / Geräte

- **Eigenes Konto pro Haushalt** (am einfachsten): Der Vater legt ein eigenes Tailscale-Konto an
  und richtet damit **seinen** Server und seine Geräte ein. Das ist ein getrenntes Netz.
- Ein Server kann auch mit einer anderen Person **geteilt** werden („Share“ in der Admin-Konsole
  bei den Maschinen), ohne dass sie in dein ganzes Netz kommt.
- **Achtung:** Geräte im selben Tailscale-Netz erreichen **alle** Ports des Servers, nicht nur
  NodeViewServer (z. B. auch die ioBroker-Admin-Oberfläche). Bei mehreren Personen im selben
  Netz Zugriffsregeln (ACLs) in der Admin-Konsole verwenden.

### Wenn etwas nicht klappt

| Problem | Lösung |
|---|---|
| Seite lädt nicht | In der Tailscale-App prüfen: verbunden? Server in der Geräteliste? Passenden Port benutzt? |
| Browser warnt trotz Tailscale | Statt der LAN-IP den Namen `….ts.net` verwenden. |
| `setup-ssl.sh` meldet, das Zertifikat konnte nicht geholt werden | MagicDNS und HTTPS Certificates in der Admin-Konsole aktivieren, dann erneut. |
| Server nach Monaten nicht mehr erreichbar | Key Expiry abgelaufen → `sudo tailscale up` auf dem Server, danach „Disable key expiry“ setzen. |
| Zertifikat abgelaufen | `bash renew-tailscale-cert.sh`, danach `pm2 restart nodeviewserver`. |
| Zurück zu HTTP / altem Zertifikat | `bash disable-ssl.sh` bzw. `bash setup-ssl.sh` mit Option 1 oder 2. |

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

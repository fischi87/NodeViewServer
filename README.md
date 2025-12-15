# NodeViewServer

Der **NodeViewServer** ist ein moderner, einfacher und sicherer Datei- und Pfadserver,  
entwickelt **in Kombination mit einer iOS-App**, die:

- sich am Server authentifizieren kann  
- freigegebene Pfade und Dateien durchsucht  
- Dateien lädt / anzeigt  
- neue Pfade freigeben kann  
- Server-Einstellungen abfragt  
- erkennt, wenn ein Server-Update verfügbar ist (via /api/version)  
- den Server per Button aktualisieren kann (via /api/update)

Der Server läuft vollständig unter **Node.js** und ist durch ein Installationsscript besonders einfach einzurichten.

---

# 🚀 Features

- 🔐 **Login-System** (bcrypt + Session)  
- 📂 **Pfad-Freigabe-System** (`paths.json`) – kompatibel mit deiner iOS-App  
- 📁 **File Browser API** für Dateien & Ordner  
- 🔒 **Rate Limiting** & Session-Security  
- 🔧 **Automatische Konfiguration** durch `install.sh`  
- 🔄 **Update-System** mit `update.sh` und **API-Update-Trigger**  
- 📡 **Version API** (`/api/version`) für App-seitige Update-Erkennung  
- 🌐 **Whitelist-Unterstützung** für IP-basierte Einschränkungen  
- ⚙️ Optional: **PM2 + Autostart**  

---

# 📱 Zusammenhang mit der iOS-App

Dieser Server wurde speziell für eine **begleitende iOS-App** entwickelt.

Die App kann:

- sich auf dem Server anmelden  
- die vom Server freigegebenen Pfade einsehen  
- Dateien laden und anzeigen  
- Pfade freigeben & verwalten  
- Server-Version abfragen (`/api/version`)  
- erkennen, wenn ein Update verfügbar ist  
- per Knopfdruck ein Update auf dem Server starten (`/api/update`)  

Die iOS-App kommuniziert ausschließlich über **API-Routen**, die in diesem Server implementiert sind.

---

# 📥 Installation (für Server-Admins)

### 1. Repository klonen

```bash
git clone https://github.com/fischi87/NodeViewServer.git
cd NodeViewServer

chmod +x install.sh

./install.sh
```

Das Script richtet ein:
Node-Abhängigkeiten
* .env Datei (SESSION_SECRET + Hash des Benutzerpassworts)
* config.js (angepasst auf deine Eingaben)
* paths.json (Startverzeichnis)
* optional PM2 + Autostart

* optional PM2 + Autostart

### 🔒 HTTPS Einrichten (Wichtig für iOS!)

Da moderne iOS-Apps (wie NodeView) zwingend HTTPS erfordern, solltest du ein SSL-Zertifikat einrichten.

```bash
chmod +x setup-ssl.sh
./setup-ssl.sh
```

Das Skript führt dich durch die Einrichtung:
1. Es erstellt ein **selbstsigniertes Zertifikat** (inklusiv Domain-Namen für iOS-Kompatibilität).
2. Es speichert die Pfade in `.ssl-config.json`.
3. Nach einem Neustart (`pm2 restart nodeviewserver` oder `npm start`) ist der Server per HTTPS erreichbar.

> **Tipp:** Wenn du eine eigene Domain hast, kannst du auch "Let's Encrypt" verwenden. Das Skript unterstützt aber aktuell primär die schnelle Einrichtung selbstsignierter Zertifikate für den privaten Gebrauch.

### Server starten

Ohne PM2: 

```
npm start
```

mit PM2: 

```
pm2 start server.js --name nodeviewserver
pm2 status
```

Passwort zurücksetzen: 

```
node hashPassword.js
# oder
node hashPassword.js "NeuesPasswort123"
```

den Hash (die Ausgabe) in deine .env datei eintragen.

Updates

```
./update.sh
```










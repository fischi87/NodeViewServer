#!/usr/bin/env bash
# Automatischer Fallback: falls mit `sh` statt `bash` aufgerufen,
# wird das Script mit bash neu gestartet. Kein manueller Eingriff nötig.
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi
set -e

echo "===================================="
echo "   Setup deines Node-Webservers"
echo "===================================="
echo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1) Checks
if ! command -v node >/dev/null 2>&1; then
  echo "Fehler: Node.js ist nicht installiert!"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Fehler: npm ist nicht installiert!"
  exit 1
fi

echo "Gefundene Node-Version: $(node -v)"
echo

# 2) Dependencies
if [ ! -d node_modules ]; then
  echo "Installiere NPM-Abhängigkeiten (npm install)..."
  npm install
  echo
else
  echo "node_modules existiert bereits – überspringe npm install."
  echo
fi

# 3) User-Input
read -p "HTTP-Port [3000]: " PORT
PORT=${PORT:-3000}

read -p "Basis-Pfad / Root-Verzeichnis [/home]: " BASE_PATH
BASE_PATH=${BASE_PATH:-/home}

read -p "Anzeigename des Wurzelverzeichnisses [Home]: " ROOT_NAME
ROOT_NAME=${ROOT_NAME:-Home}

read -p "Benutzername für Login [Axel]: " USERNAME
USERNAME=${USERNAME:-Axel}

USERNAME_ENV=$(echo "$USERNAME" | tr '[:lower:]' '[:upper:]' | tr -c 'A-Z0-9' '_')

echo
echo "Bitte Passwort für Benutzer \"$USERNAME\" eingeben."
while true; do
  read -s -p "Passwort: " PASSWORD
  echo
  read -s -p "Passwort wiederholen: " PASSWORD2
  echo
  if [ -z "$PASSWORD" ]; then
    echo "Passwort darf nicht leer sein."
  elif [ "$PASSWORD" != "$PASSWORD2" ]; then
    echo "Passwörter stimmen nicht überein."
  else
    break
  fi
done
echo

# 4) Bcrypt-Hash erzeugen
echo "Erzeuge Bcrypt-Hash..."
HASH=$(
  PASS="$PASSWORD" node -e "
    const bcrypt = require('bcrypt');
    const pwd = process.env.PASS;
    if (!pwd) { console.error('Kein Passwort übergeben'); process.exit(1); }
    bcrypt.hash(pwd, 10)
      .then(h => console.log(h))
      .catch(err => { console.error('Fehler beim Hashen:', err); process.exit(1); });
  "
)

unset PASSWORD
unset PASSWORD2

if [ -z "$HASH" ]; then
  echo 'Fehler: Hash ist leer. Abbruch.'
  exit 1
fi

# 5) Session-Secret erzeugen
echo "Erzeuge zufälliges Session-Secret..."
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# 6) .env erzeugen (mit Backup)
if [ -f .env ]; then
  BACKUP_NAME=".env.bak.$(date +%Y%m%d%H%M%S)"
  echo "Bestehende .env gefunden – Backup nach ${BACKUP_NAME}..."
  cp .env "$BACKUP_NAME"
fi

cat > .env <<EOF
SESSION_SECRET=${SESSION_SECRET}
USER_${USERNAME_ENV}_HASH=${HASH}
EOF

echo ".env erzeugt/aktualisiert."
echo

# 6b) HTTPS / SSL Setup
read -p "Möchtest du HTTPS aktivieren? (y/n) [n]: " USE_HTTPS
USE_HTTPS=${USE_HTTPS:-n}

SSL_ENABLED="false"
SSL_KEY_PATH=""
SSL_CERT_PATH=""

if [[ "$USE_HTTPS" =~ ^[Yy]$ ]]; then
  SSL_ENABLED="true"
  echo
  echo "HTTPS-Konfiguration:"
  echo "1) Selbstsigniertes Zertifikat generieren (Einfach, Browser warnt)"
  echo "2) Vorhandenes Zertifikat nutzen (pfad zu key/cert angeben)"
  read -p "Auswahl [1]: " SSL_CHOICE
  SSL_CHOICE=${SSL_CHOICE:-1}

  if [ "$SSL_CHOICE" == "1" ]; then
    # Check openssl
    if ! command -v openssl >/dev/null 2>&1; then
      echo "Fehler: openssl ist nicht installiert. Kann kein Zertifikat erzeugen."
      exit 1
    fi

    # Hostname/IP für SAN ermitteln (iOS 13+ und Browser benötigen Subject Alternative Names)
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    DEFAULT_CN="${LOCAL_IP:-NodeViewServer}"
    read -p "Hostname oder IP für das Zertifikat (SAN) [$DEFAULT_CN]: " CERT_CN
    CERT_CN=${CERT_CN:-$DEFAULT_CN}

    echo "Generiere selbstsigniertes Zertifikat mit SAN für '$CERT_CN' in .ssl/ ..."
    mkdir -p .ssl

    # OpenSSL-Konfiguration mit SAN erstellen
    # DNS.1 = localhost als Fallback; IP.x / DNS.x je nach Eingabe
    cat > .ssl/openssl.cnf <<SSLEOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = $CERT_CN

[v3_req]
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
SSLEOF

    # IP-Adresse oder Hostname als weiteren SAN eintragen
    if [[ "$CERT_CN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "IP.1 = $CERT_CN"   >> .ssl/openssl.cnf
      echo "IP.2 = 127.0.0.1"  >> .ssl/openssl.cnf
    else
      echo "DNS.2 = $CERT_CN"  >> .ssl/openssl.cnf
      echo "IP.1 = 127.0.0.1"  >> .ssl/openssl.cnf
    fi

    openssl req -x509 -newkey rsa:4096 \
      -keyout .ssl/key.pem -out .ssl/cert.pem \
      -days 365 -nodes -config .ssl/openssl.cnf 2>/dev/null

    SSL_KEY_PATH=".ssl/key.pem"
    SSL_CERT_PATH=".ssl/cert.pem"
    echo "Zertifikat erstellt (CN=$CERT_CN, mit SAN)."
  else
    read -p "Pfad zum Private Key (.key/.pem): " CUSTOM_KEY
    read -p "Pfad zum Certificate (.crt/.pem): " CUSTOM_CERT
    SSL_KEY_PATH="$CUSTOM_KEY"
    SSL_CERT_PATH="$CUSTOM_CERT"
  fi
fi

# 7) config.js generieren (überschreibt alte)
cat > config.js <<EOF
require('dotenv').config(); // Lädt die Umgebungsvariablen aus der .env-Datei

module.exports = {
    port: ${PORT},
    sessionSecret: process.env.SESSION_SECRET,
    sessionMaxAge: 1000 * 60 * 60 * 24 * 7,
    rateLimitWindowMs: 15 * 60 * 1000,
    rateLimitMax: 5,

    whitelist: [
        // Beispiel:
        // '192.168.178.10',
        // '192.168.178.11'
    ],

    allowedBasePaths: ['${BASE_PATH}'],

    directories: {
        "${ROOT_NAME}": "${BASE_PATH}"
    },

    users: {
        "${USERNAME}": process.env.USER_${USERNAME_ENV}_HASH
    },

    ssl: {
        enabled: ${SSL_ENABLED},
        key: '${SSL_KEY_PATH}',
        cert: '${SSL_CERT_PATH}'
    }
};
EOF

echo "config.js erzeugt."
echo

# 8) paths.json generieren
cat > paths.json <<EOF
{
  "roots": [
    {
      "name": "${ROOT_NAME}",
      "path": "${BASE_PATH}"
    }
  ]
}
EOF

echo "paths.json erzeugt."
echo

# 9) PM2 (optional)
read -p "Soll pm2 installiert werden? (y/n) [y]: " INSTALL_PM2
INSTALL_PM2=${INSTALL_PM2:-y}

if [[ "$INSTALL_PM2" =~ ^[Yy]$ ]]; then
  if ! command -v pm2 >/dev/null 2>&1; then
    echo "Installiere PM2 global (sudo npm install -g pm2)..."
    sudo npm install -g pm2
  else
    echo "PM2 ist bereits installiert."
  fi

  echo "Starte Node-Server mit PM2..."
  pm2 start server.js --name nodeviewserver --time

  read -p "Soll PM2 Autostart eingerichtet werden? (y/n) [y]: " PM2_AUTOSTART
  PM2_AUTOSTART=${PM2_AUTOSTART:-y}

  if [[ "$PM2_AUTOSTART" =~ ^[Yy]$ ]]; then
    echo "Richte PM2 Startup ein..."
    sudo pm2 startup systemd -u "$USER" --hp "$HOME"
    pm2 save
    echo "PM2 Autostart aktiviert."
  else
    echo "PM2 Autostart deaktiviert."
  fi
fi

# 10) Fertig
echo "===================================="
echo "Setup abgeschlossen!"
echo
if [[ "$INSTALL_PM2" =~ ^[Yy]$ ]]; then
  echo "Server läuft jetzt unter PM2:"
  echo "  pm2 status"
  echo "  pm2 logs nodeviewserver"
else
  echo "Du kannst den Server starten mit:"
  echo "  npm start"
fi

PROTOCOL="http"
if [[ "$SSL_ENABLED" == "true" ]]; then
  PROTOCOL="https"
fi

echo
echo "Zugriff im Browser:"
echo "  ${PROTOCOL}://<SERVER-IP>:${PORT}"
if [[ "$SSL_ENABLED" == "true" ]]; then
  echo
  echo "Hinweis: Das selbstsignierte Zertifikat muss im Browser/iOS einmalig"
  echo "  akzeptiert werden (Sicherheitswarnung bestätigen)."
fi
echo
echo "Login:"
echo "  Benutzer: ${USERNAME}"
echo "===================================="

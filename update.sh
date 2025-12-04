#!/usr/bin/env bash
set -e

echo "===================================="
echo "   Update deines NodeViewServers"
echo "===================================="
echo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 1) git pull (falls .git vorhanden)
if [ -d .git ]; then
  echo "Hole neuesten Stand von GitHub..."
  git fetch --quiet        # holt neue Commits (keine Tags mehr)
  git pull
  echo
else
  echo "Hinweis: kein .git-Verzeichnis – überspringe git pull."
  echo
fi

# 2) npm installieren / aktualisieren
echo "Installiere/aktualisiere NPM-Abhängigkeiten..."
npm install
echo

# 3) Server neu starten (PM2 falls vorhanden)
if command -v pm2 >/dev/null 2>&1; then
  echo "PM2 ist installiert."
  if pm2 list | grep -q "nodeviewserver"; then
    echo "Starte PM2-Prozess 'nodeviewserver' neu..."
    pm2 restart nodeviewserver
  else
    echo "Kein PM2-Prozess namens 'nodeviewserver' gefunden."
    echo "Starte ihn mit:"
    echo "  pm2 start server.js --name nodeviewserver"
  fi
else
  echo "PM2 ist nicht installiert."
  echo "Starte den Server manuell mit:"
  echo "  npm start"
fi

echo
echo "===================================="
echo "Update abgeschlossen!"
echo "===================================="

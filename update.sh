#!/usr/bin/env bash
set -euo pipefail

echo "===================================="
echo "   Update deines NodeViewServers"
echo "===================================="
echo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d .git ]; then
  echo "Fehler: kein .git-Verzeichnis – Update nur für per 'git clone' installierte Server."
  exit 1
fi

OLD_HEAD="$(git rev-parse HEAD)"

rollback() {
  echo
  echo "Update fehlgeschlagen – setze auf vorherigen Stand ($OLD_HEAD) zurück..."
  git reset --hard "$OLD_HEAD" >/dev/null
  npm ci --omit=dev --no-audit --no-fund || true
  echo "Rollback abgeschlossen. Der Server läuft mit dem alten Stand weiter."
}
trap rollback ERR

# 1) Nur Fast-Forward: lokale Änderungen/abweichende Historie brechen ab statt zu mergen
echo "Hole neuesten Stand von GitHub..."
git fetch --quiet
git merge --ff-only '@{u}'
echo

# 2) Abhängigkeiten exakt nach package-lock.json installieren
echo "Installiere NPM-Abhängigkeiten..."
npm ci --omit=dev --no-audit --no-fund
echo

# 3) Konfiguration kurz prüfen, bevor neu gestartet wird
node -e "require('./routes')" >/dev/null 2>&1 || { echo "Fehler: Server-Code lässt sich nicht laden."; false; }

trap - ERR

# 4) Neustart
if command -v pm2 >/dev/null 2>&1 && pm2 describe nodeviewserver >/dev/null 2>&1; then
  echo "Starte PM2-Prozess 'nodeviewserver' neu..."
  pm2 restart nodeviewserver
else
  echo "Kein PM2-Prozess 'nodeviewserver' gefunden – bitte Server manuell neu starten:"
  echo "  npm start"
fi

echo
echo "===================================="
echo "Update abgeschlossen!"
echo "===================================="

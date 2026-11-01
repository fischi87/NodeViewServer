#!/usr/bin/env bash
# Holt bzw. erneuert das Tailscale-HTTPS-Zertifikat (gilt ca. 90 Tage).
# Der laufende Server lädt neue Zertifikate selbst (prüft täglich) – kein Neustart nötig.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

HOST_FILE=".ssl/tailscale-host"
if [ ! -f "$HOST_FILE" ]; then
  echo "Fehler: $HOST_FILE fehlt. Bitte zuerst 'bash setup-ssl.sh' (Option 3) ausführen."
  exit 1
fi
HOST="$(cat "$HOST_FILE")"

command -v tailscale >/dev/null 2>&1 || { echo "Fehler: tailscale ist nicht installiert."; exit 1; }

run_cert() {
  "$@" cert --cert-file .ssl/cert.pem.new --key-file .ssl/key.pem.new "$HOST"
}

# ohne Operator-Rechte klappt der Aufruf nur mit sudo
if ! run_cert tailscale 2>/dev/null; then
  run_cert sudo tailscale
  sudo chown "$(id -un)" .ssl/cert.pem.new .ssl/key.pem.new
fi

chmod 600 .ssl/key.pem.new
mv .ssl/key.pem.new .ssl/key.pem
mv .ssl/cert.pem.new .ssl/cert.pem
echo "Zertifikat für $HOST aktualisiert."

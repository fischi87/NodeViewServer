#!/usr/bin/env bash
set -e

echo "===================================="
echo "   HTTPS Einrichten (Nachträglich)"
echo "===================================="
echo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Defaults
SSL_ENABLED="false"
SSL_KEY_PATH=""
SSL_CERT_PATH=""

read -p "Möchtest du HTTPS aktivieren? (y/n) [y]: " USE_HTTPS
USE_HTTPS=${USE_HTTPS:-y}

if [[ "$USE_HTTPS" =~ ^[Yy]$ ]]; then
  SSL_ENABLED="true"
  echo
  echo "HTTPS-Konfiguration:"
  echo "1) Selbstsigniertes Zertifikat generieren (Einfach, Browser warnt)"
  echo "2) Vorhandenes Zertifikat nutzen (pfad zu key/cert angeben)"
  read -p "Auswahl [1]: " SSL_CHOICE
  SSL_CHOICE=${SSL_CHOICE:-1}

  if [ "$SSL_CHOICE" == "1" ]; then
    read -p "Hostname für das Zertifikat (z.B. meinserver.de oder IP) [NodeViewServer]: " CERT_CN
    CERT_CN=${CERT_CN:-NodeViewServer}

    echo "Generiere selbstsigniertes Zertifikat für '$CERT_CN' in .ssl/ ..."
    mkdir -p .ssl
    
    # Check openssl
    if ! command -v openssl >/dev/null 2>&1; then
      echo "Fehler: openssl ist nicht installiert. Kann kein Zertifikat erzeugen."
      exit 1
    fi

    # Zertifikat mit passendem CN erstellen
    openssl req -x509 -newkey rsa:4096 -keyout .ssl/key.pem -out .ssl/cert.pem -days 365 -nodes -subj "/CN=$CERT_CN" 2>/dev/null

    SSL_KEY_PATH=".ssl/key.pem"
    SSL_CERT_PATH=".ssl/cert.pem"
    echo "Zertifikat erstellt."
  else
    read -p "Pfad zum Private Key (.key/.pem): " CUSTOM_KEY
    read -p "Pfad zum Certificate (.crt/.pem): " CUSTOM_CERT
    SSL_KEY_PATH="$CUSTOM_KEY"
    SSL_CERT_PATH="$CUSTOM_CERT"
  fi
fi

# Write to JSON overlay
cat > .ssl-config.json <<EOF
{
  "ssl": {
    "enabled": ${SSL_ENABLED},
    "key": "${SSL_KEY_PATH}",
    "cert": "${SSL_CERT_PATH}"
  }
}
EOF

echo
echo "Konfiguration gespeichert in .ssl-config.json"
echo "Starten Sie den Server neu, um die Änderungen zu übernehmen:"
echo "  pm2 restart nodeviewserver"
echo "  # oder"
echo "  npm start"

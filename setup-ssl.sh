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
  echo "3) Tailscale-Zertifikat (echtes Zertifikat, keine Browser-Warnung – siehe README)"
  read -p "Auswahl [1]: " SSL_CHOICE
  SSL_CHOICE=${SSL_CHOICE:-1}

  if [ "$SSL_CHOICE" == "1" ]; then
    read -p "Hostname für das Zertifikat (z.B. meinserver.de oder IP) [NodeViewServer]: " CERT_CN
    CERT_CN=${CERT_CN:-NodeViewServer}
    if [[ ! "$CERT_CN" =~ ^[A-Za-z0-9.-]+$ ]]; then
      echo "Fehler: Ungültiger Hostname/IP für das Zertifikat."
      exit 1
    fi

    echo "Generiere selbstsigniertes Zertifikat für '$CERT_CN' in .ssl/ ..."
    mkdir -p .ssl
    
    # Check openssl
    if ! command -v openssl >/dev/null 2>&1; then
      echo "Fehler: openssl ist nicht installiert. Kann kein Zertifikat erzeugen."
      exit 1
    fi

    echo "Lösche alte Zertifikate..."
    rm -f .ssl/key.pem .ssl/cert.pem
    
    # OpenSSL Config für SAN (Subject Alternative Name) erstellen
    # Das ist für iOS notwendig (nur CN reicht oft nicht mehr).
    if [[ "$CERT_CN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      CN_SAN="IP.1 = $CERT_CN"
    else
      CN_SAN="DNS.1 = $CERT_CN"
    fi

    cat > .ssl/openssl.cnf <<EOF
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
$CN_SAN
DNS.2 = localhost
IP.2 = 127.0.0.1
EOF

    # Zertifikat mit SAN generieren
    openssl req -x509 -newkey rsa:4096 -keyout .ssl/key.pem -out .ssl/cert.pem -days 825 -nodes -config .ssl/openssl.cnf 2>/dev/null

    chmod 600 .ssl/key.pem
    SSL_KEY_PATH=".ssl/key.pem"
    SSL_CERT_PATH=".ssl/cert.pem"
    echo "Zertifikat erstellt."
  elif [ "$SSL_CHOICE" == "3" ]; then
    if ! command -v tailscale >/dev/null 2>&1; then
      echo "Fehler: Tailscale ist nicht installiert (https://tailscale.com/download)."
      echo "Danach 'sudo tailscale up' ausführen und in der Tailscale-Admin-Konsole"
      echo "unter DNS 'MagicDNS' und 'HTTPS Certificates' aktivieren."
      exit 1
    fi

    TS_HOST="$(tailscale status --json | node -e "
      let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
        try{console.log((JSON.parse(d).Self.DNSName||'').replace(/\\.$/,''));}catch(e){}
      });")"
    if [[ ! "$TS_HOST" =~ ^[A-Za-z0-9.-]+\.ts\.net$ ]]; then
      echo "Fehler: Tailscale-Name nicht gefunden. Läuft 'tailscale up' und ist MagicDNS aktiv?"
      exit 1
    fi

    echo "Tailscale-Name dieses Servers: $TS_HOST"
    mkdir -p .ssl
    echo "$TS_HOST" > .ssl/tailscale-host
    bash ./renew-tailscale-cert.sh

    SSL_KEY_PATH=".ssl/key.pem"
    SSL_CERT_PATH=".ssl/cert.pem"

    read -p "Zertifikat wöchentlich automatisch erneuern (Cronjob)? (y/n) [y]: " ADD_CRON
    ADD_CRON=${ADD_CRON:-y}
    if [[ "$ADD_CRON" =~ ^[Yy]$ ]]; then
      CRON_LINE="17 4 * * 1 $SCRIPT_DIR/renew-tailscale-cert.sh >> $SCRIPT_DIR/cert-renew.log 2>&1"
      ( crontab -l 2>/dev/null | grep -v "renew-tailscale-cert.sh" ; echo "$CRON_LINE" ) | crontab -
      echo "Cronjob eingetragen (montags 04:17 Uhr)."
    fi
    echo
    echo "Erreichbar unter: https://$TS_HOST:<PORT>  (nur im Tailscale-Netz)"
  else
    read -p "Pfad zum Private Key (.key/.pem): " CUSTOM_KEY
    read -p "Pfad zum Certificate (.crt/.pem): " CUSTOM_CERT
    SSL_KEY_PATH="$CUSTOM_KEY"
    SSL_CERT_PATH="$CUSTOM_CERT"
  fi
fi

# Write to JSON overlay (via node, damit Pfade korrekt maskiert werden)
NVS_SSL="$SSL_ENABLED" NVS_KEY="$SSL_KEY_PATH" NVS_CERT="$SSL_CERT_PATH" node -e "
const e = process.env;
require('fs').writeFileSync('.ssl-config.json', JSON.stringify(
  { ssl: { enabled: e.NVS_SSL === 'true', key: e.NVS_KEY, cert: e.NVS_CERT } }, null, 2) + '\\n');
"

echo
echo "Konfiguration gespeichert in .ssl-config.json"
echo "Starten Sie den Server neu, um die Änderungen zu übernehmen:"
echo "  pm2 restart nodeviewserver"
echo "  # oder"
echo "  npm start"

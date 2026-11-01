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
    # --- 1) Tailscale installieren, falls nötig -------------------------------
    if ! command -v tailscale >/dev/null 2>&1; then
      echo "Tailscale ist nicht installiert."
      if [ "$(uname)" != "Linux" ]; then
        echo "Bitte Tailscale von https://tailscale.com/download installieren und das Skript erneut starten."
        exit 1
      fi
      read -p "Jetzt installieren (offizielles Skript von tailscale.com, benötigt sudo)? (y/n) [y]: " INSTALL_TS
      INSTALL_TS=${INSTALL_TS:-y}
      if [[ ! "$INSTALL_TS" =~ ^[Yy]$ ]]; then
        echo "Abgebrochen. Installation: https://tailscale.com/download"
        exit 1
      fi
      curl -fsSL https://tailscale.com/install.sh | sh
      command -v tailscale >/dev/null 2>&1 || { echo "Fehler: Installation fehlgeschlagen."; exit 1; }
    fi

    # --- 2) Anmelden (falls noch nicht geschehen) -----------------------------
    if ! tailscale status >/dev/null 2>&1; then
      echo
      echo "Tailscale ist noch nicht angemeldet. Gleich erscheint ein Link –"
      echo "diesen im Browser öffnen und mit deinem Tailscale-Konto anmelden."
      echo
      sudo tailscale up --operator="$USER"
    else
      # Operator setzen, damit 'tailscale cert' ohne sudo funktioniert
      sudo tailscale set --operator="$USER" >/dev/null 2>&1 || true
    fi

    # --- 3) Name ermitteln + Zertifikat holen (MagicDNS/HTTPS müssen aktiv sein) -
    mkdir -p .ssl
    TS_OK="false"
    for ATTEMPT in 1 2 3; do
      TS_HOST="$(tailscale status --json 2>/dev/null | node -e "
        let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
          try{console.log((JSON.parse(d).Self.DNSName||'').replace(/\\.$/,''));}catch(e){}
        });")"

      if [[ "$TS_HOST" =~ ^[A-Za-z0-9.-]+\.ts\.net$ ]]; then
        echo "Tailscale-Name dieses Servers: $TS_HOST"
        echo "$TS_HOST" > .ssl/tailscale-host
        if bash ./renew-tailscale-cert.sh; then TS_OK="true"; break; fi
      fi

      echo
      echo "Das Zertifikat konnte noch nicht geholt werden. Bitte in der Tailscale-Admin-Konsole"
      echo "  https://login.tailscale.com/admin/dns"
      echo "unter 'DNS' MagicDNS und 'HTTPS Certificates' aktivieren."
      read -p "Enter drücken, wenn erledigt (Versuch $ATTEMPT/3) … " _
    done

    if [ "$TS_OK" != "true" ]; then
      echo "Fehler: Zertifikat konnte nicht geholt werden. Nichts wurde geändert."
      exit 1
    fi

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

#!/usr/bin/env bash
    
echo "Deaktiviere HTTPS / SSL..."
rm -f .ssl-config.json
echo "HTTPS deaktiviert. Der Server läuft nach dem Neustart wieder via HTTP."
echo "Bitte neu starten:"
echo "  pm2 restart nodeviewserver"
echo "  # oder"
echo "  npm start"

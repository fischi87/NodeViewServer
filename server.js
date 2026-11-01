// server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

// Sicherstellen, dass config.js vorhanden ist
const configPath = path.join(__dirname, 'config.js');
if (!fs.existsSync(configPath)) {
  console.error('config.js fehlt. Bitte install.sh ausführen, um die Konfiguration zu erzeugen.');
  process.exit(1);
}

const config = require(configPath);

// OVERLAY: Prüfen auf .ssl-config.json (Migration für bestehende Nutzer)
const sslConfigPath = path.join(__dirname, '.ssl-config.json');
if (fs.existsSync(sslConfigPath)) {
  try {
    const sslOverlay = require(sslConfigPath);
    if (sslOverlay && sslOverlay.ssl) {
      console.log('Lade SSL-Konfiguration aus .ssl-config.json');
      config.ssl = sslOverlay.ssl;
    }
  } catch (err) {
    console.error('Fehler beim Laden von .ssl-config.json:', err);
  }
}

// Session-Secret erzwingen – ohne Secret kein Start
const sessionSecret = config.sessionSecret || process.env.SESSION_SECRET;
if (!sessionSecret || !String(sessionSecret).trim()) {
  console.error('SESSION_SECRET ist nicht gesetzt. Bitte install.sh ausführen oder ein Session-Secret hinterlegen.');
  process.exit(1);
}

const routes = require('./routes');
const FileStore = require('./sessionStore');

// Warnen, wenn kein Benutzer einen gültigen Passwort-Hash hat (Login wäre unmöglich)
const validUsers = Object.entries(config.users || {})
  .filter(([, h]) => typeof h === 'string' && /^\$2[aby]\$/.test(h));
if (validUsers.length === 0) {
  console.error('WARNUNG: Kein Benutzer mit gültigem bcrypt-Hash konfiguriert (.env prüfen, siehe README).');
}

// Favoriten werden in einen eigenen Ordner verschoben – der darf nicht in einem
// freigegebenen Verzeichnis liegen (sonst erreichen ihn Aufräum-Routinen wieder).
{
  const favDir = path.resolve(config.favoritesDir || path.join(__dirname, 'favorites'));
  const inside = Object.values(config.directories || {}).some(d => {
    const r = path.resolve(d);
    return favDir === r || favDir.startsWith(r + path.sep);
  });
  if (inside) {
    console.error(`WARNUNG: Favoriten-Ordner (${favDir}) liegt in einem freigegebenen Verzeichnis. ` +
      'Bitte "favoritesDir" in config.js auf einen Ordner außerhalb setzen.');
  }
}

const app = express();

// Optional: wenn hinter Proxy/Load-Balancer
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

// 0) Security-Header
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin'
  });
  if (config.ssl && config.ssl.enabled) {
    res.set('Strict-Transport-Security', 'max-age=15552000');
  }
  next();
});

// 1) Bodyparser (mit Größenlimit)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// 2) Session (MUSS vor /api!)
const sessionMaxAge = config.sessionMaxAge || 1000 * 60 * 60 * 24 * 7;

app.use(session({
  name: 'nodeView.sid',
  store: process.env.NODE_ENV === 'test'
    ? undefined
    : new FileStore({ dir: path.join(__dirname, '.sessions'), ttlMs: sessionMaxAge }),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    maxAge: sessionMaxAge,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' ? true : 'auto'
  }
}));

// 2b) CSRF-Schutz: schreibende Requests mit fremdem Origin ablehnen
app.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let host = null;
    try { host = new URL(origin).host; } catch (_) { /* ungültig */ }
    if (host !== req.get('host')) {
      return res.status(403).json({ error: 'Ungültiger Origin' });
    }
  }
  next();
});

// 3) Throttling für Login
const loginLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  limit: config.rateLimitMax,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Zu viele Anmeldeversuche, bitte versuche es später erneut.'
});
app.use('/login', loginLimiter);
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: config.apiRateLimitPerMin || 600,
  standardHeaders: true,
  legacyHeaders: false
}));

// 4) Alle Routen (Browser + API)
app.use('/', routes);

// 5) Statisches Frontend (nach Routen, damit /main.html nicht Auth umgeht)
app.use(express.static(path.join(__dirname, 'webSite')));

// 6) Fehler-Handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Interner Serverfehler');
});

// 7) Start (nur wenn direkt ausgeführt)
if (require.main === module) {
  let server;

  if (config.ssl && config.ssl.enabled) {
    const https = require('https');

    try {
      const options = {
        key: fs.readFileSync(path.resolve(__dirname, config.ssl.key)),
        cert: fs.readFileSync(path.resolve(__dirname, config.ssl.cert))
      };

      server = https.createServer(options, app).listen(config.port, () => {
        console.log(`HTTPS-Server läuft auf https://localhost:${config.port}`);
      });
    } catch (err) {
      console.error('Fehler beim Starten des HTTPS-Servers:', err.message);
      process.exit(1);
    }
  } else {
    server = app.listen(config.port, () => {
      console.log(`HTTP-Server läuft auf http://localhost:${config.port}`);
    });
  }

  // Zertifikate (z. B. Tailscale/Let's Encrypt, ~90 Tage gültig) täglich neu einlesen,
  // damit eine Erneuerung ohne Server-Neustart wirksam wird.
  if (config.ssl && config.ssl.enabled && typeof server.setSecureContext === 'function') {
    const reloadCerts = () => {
      try {
        server.setSecureContext({
          key: fs.readFileSync(path.resolve(__dirname, config.ssl.key)),
          cert: fs.readFileSync(path.resolve(__dirname, config.ssl.cert))
        });
      } catch (err) {
        console.error('Zertifikat konnte nicht neu geladen werden:', err.message);
      }
    };
    setInterval(reloadCerts, 24 * 60 * 60 * 1000).unref();
  }

  // Graceful Shutdown (PM2 restart / Ctrl+C)
  const shutdown = (signal) => {
    console.log(`${signal} empfangen, fahre herunter...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
  });
}

module.exports = app;

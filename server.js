// server.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');

const routes = require('./routes');
const config = require('./config');

const app = express();

// Optional: wenn hinter Proxy/Load-Balancer
if (config.trustProxy) {
  app.set('trust proxy', 1);
}

// 1) Bodyparser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2) Session (MUSS vor /api!)
app.use(session({
  name: 'nodeView.sid',
  secret: process.env.SESSION_SECRET || 'dev-secret-only-for-local',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 Tage
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

// 3) Throttling für Login
const loginLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  message: 'Zu viele Anmeldeversuche, bitte versuche es später erneut.'
});
app.use('/login', loginLimiter);

// 4) Alle Routen (Browser + API)
app.use('/', routes);

// 5) Statisches Frontend (nach Routen, damit /main.html nicht Auth umgeht)
app.use(express.static(path.join(__dirname, 'webSite')));

// 6) Fehler-Handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Interner Serverfehler');
});

// 7) Start
app.listen(config.port, () => {
  console.log(`HTTP-Server läuft auf http://localhost:${config.port}`);
});

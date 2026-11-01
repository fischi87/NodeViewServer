// routes.js
const express = require('express');
const serveIndex = require('serve-index');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs/promises');
const { exec } = require('child_process'); // Git-Check + update.sh

const config = require('./config');
const auth = require('./auth');
const { sortFilesByMTime } = require('./fileUtils');
const { getRoots, setRoots, validateRootsInput, isUnderAllowedBase } = require('./pathsStore');
const { getFavorites, setFavorites, getFavoritesDir } = require('./favoritesStore');
const pkg = require('./package.json'); // Version aus package.json

const router = express.Router();

// -----------------------------------------------------------------------------
// IP-Whitelist Middleware
// -----------------------------------------------------------------------------
function ipWhitelist(req, res, next) {
  // req.ip beachtet 'trust proxy' korrekt; ein vom Client gesendeter
  // X-Forwarded-For-Eintrag wird so nicht blind übernommen.
  let clientIp = req.ip || (req.socket && req.socket.remoteAddress) || '';
  if (clientIp.startsWith('::ffff:')) {
    clientIp = clientIp.slice(7);
  }


  if (config.whitelist.includes(clientIp)) {
    return next();
  }

  return auth.checkAuthentication(req, res, next);
}

// -----------------------------------------------------------------------------
// Klassische Browser-Routen (webSite)
// -----------------------------------------------------------------------------

// JSON-Liste der Dateien in den "alten" statischen Verzeichnissen (snapshot / vorne / hinten)
router.get('/files/:dir', ipWhitelist, async (req, res) => {
  const dir = req.params.dir;
  const dirPath = config.directories[dir];

  if (!dirPath) {
    return res.status(404).send('Daten nicht gefunden');
  }

  try {
    const sortedFiles = await sortFilesByMTime(dirPath);
    res.json(sortedFiles);
  } catch (err) {
    console.error('[routes] Fehler bei /files/:dir:', err);
    res.status(500).send('Fehler beim Lesen der Dateien');
  }
});

// Statisches Serving + Directory-Index für die alten Verzeichnisse
Object.keys(config.directories).forEach(dir => {
  const dirPath = config.directories[dir];
  router.use(`/files/${dir}`, ipWhitelist, express.static(dirPath));
  router.use(`/files/${dir}`, ipWhitelist, serveIndex(dirPath, { icons: true }));
});

// Login / Logout
router.post('/login', (req, res) => auth.login(req, res));
router.post('/logout', (req, res) => auth.logout(req, res));

// Auth-Status für Clients: prüft Session ohne Redirects
router.get('/api/auth/status', (req, res) => {
  if (req.session && req.session.loggedIn) {
    return res.json({
      authenticated: true,
      user: req.session.username || null
    });
  }
  return res.status(401).json({ authenticated: false });
});

// Login-Seite
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'webSite', 'login.html'));
});

// Haupt-Seite (Dateibrowser)
router.get('/main.html', ipWhitelist, auth.checkAuthentication, (req, res) => {
  res.sendFile(path.join(__dirname, 'webSite', 'main.html'));
});

// -----------------------------------------------------------------------------
// Helper: Expert-Mode + sichtbare Roots
// -----------------------------------------------------------------------------

// Expert-Mode wird ausschließlich serverseitig (config.expertMode bzw.
// Env EXPERT_MODE=true) aktiviert – niemals durch Client-Header.
function isExpertMode() {
  return config.expertMode === true || process.env.EXPERT_MODE === 'true';
}

// Nur "sichere" Roots, wenn NICHT Expert-Mode
function getVisibleRoots(req) {
  const all = getRoots();
  if (isExpertMode()) {
    return all;
  }
  return all.filter(r => isUnderAllowedBase(r.path));
}

/**
 * Sicheren absoluten Pfad bestimmen, abhängig davon,
 * ob Expert-Mode aktiv ist (Header x-expert-mode).
 */
function resolveTargetPath(relativePath, req) {
  if (!relativePath) return null;

  const parts = String(relativePath).split('/').filter(Boolean);
  const rootName = parts.shift();
  if (!rootName) return null;

  const roots = getVisibleRoots(req);
  const root = roots.find(f => f.name === rootName);
  if (!root) return null;

  const base = root.path;
  const target = path.resolve(base, parts.join('/'));

  if (target !== base && !target.startsWith(base + path.sep)) return null;
  return { target, base };
}

// Realpath-Validierung verhindert Symlink-Traversal
async function resolveAndValidatePath(relativePath, req) {
  const resolved = resolveTargetPath(relativePath, req);
  if (!resolved) return null;

  const realPath = await fs.realpath(resolved.target).catch(() => null);
  if (!realPath) return null;

  // Root selbst kann ein Symlink sein (z. B. /var -> /private/var auf macOS)
  const base = await fs.realpath(resolved.base).catch(() => null);
  if (!base) return null;
  if (realPath !== base && !realPath.startsWith(base + path.sep)) {
    return null;
  }

  return { target: resolved.target, realPath, base };
}

// -----------------------------------------------------------------------------
// Helper: Git-Update-Status prüfen (nur Commits, keine Tags)
//  -> git fetch --quiet && git rev-parse HEAD && git rev-parse @{u}
//     + git log -1 --pretty=format:%s @{u}
// -----------------------------------------------------------------------------
function checkForUpdate() {
  return new Promise((resolve) => {
    const cmd = [
      'git -c credential.helper= fetch --quiet',
      'git rev-parse HEAD',
      'git rev-parse @{u}',
      'git log -1 --pretty=format:%s @{u}'
    ].join(' && ');

    exec(cmd, {
      cwd: __dirname,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',   // Kein interaktiver Credential-Prompt (PM2 hat kein TTY)
        GIT_ASKPASS: '/bin/echo'    // Gibt leeren String zurück statt zu hängen
      }
    }, (err, stdout) => {
      if (err) {
        console.warn('[checkForUpdate] Fehler:', err.message);
        return resolve({ updateAvailable: false, latestMessage: null });
      }

      const lines = String(stdout).trim().split('\n');
      if (lines.length < 3) {
        return resolve({ updateAvailable: false, latestMessage: null });
      }

      const local = lines[0].trim();   // HEAD
      const remote = lines[1].trim();  // @{u}
      const message = lines.slice(2).join('\n').trim(); // Commit-Subject

      if (!local || !remote) {
        return resolve({ updateAvailable: false, latestMessage: null });
      }

      const different = local !== remote;
      console.log('[checkForUpdate] local =', local,
                  'remote =', remote,
                  'different =', different,
                  'message =', message);

      resolve({
        updateAvailable: different,
        latestMessage: different ? message : null
      });
    });
  });
}

// -----------------------------------------------------------------------------
// API: Root-Pfade verwalten (SettingsView)
// -----------------------------------------------------------------------------

router.get('/api/paths', auth.requireAuthApi, (req, res) => {
  const roots = getRoots(); // In Settings immer ALLE zeigen
  res.json({ roots });
});

router.post('/api/paths', auth.requireAuthApi, async (req, res) => {
  const { roots } = req.body;

  if (!Array.isArray(roots)) {
    return res.status(400).json({ error: 'roots muss ein Array sein' });
  }

  const allowDangerous = isExpertMode();
  const { cleaned, errors } = validateRootsInput(roots, { allowDangerous });

  if (cleaned.length === 0) {
    return res.status(400).json({
      error: 'Keine gültigen Pfade übernommen',
      details: errors
    });
  }

  setRoots(cleaned);

  return res.status(errors.length > 0 ? 207 : 200).json({
    ok: errors.length === 0,
    roots: getRoots(),
    errors
  });
});

// -----------------------------------------------------------------------------
// /api/favorites – Favoriten verwalten
// -----------------------------------------------------------------------------

// Datei verschieben; über Dateisystemgrenzen hinweg per Kopie + Löschen
async function moveFile(from, to) {
  try {
    await fs.rename(from, to);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    await fs.copyFile(from, to, require('fs').constants.COPYFILE_EXCL);
    await fs.unlink(from);
  }
}

// Favoriten-Operationen nacheinander ausführen (JSON-Datei + Dateisystem konsistent halten)
let favQueue = Promise.resolve();
function serialized(fn) {
  const run = favQueue.then(fn, fn);
  favQueue = run.catch(() => {});
  return run;
}

function publicFavorite(f) {
  return { id: f.id, name: f.name, path: f.path, alias: f.alias, missing: !!f.missing, legacy: !f.storedName };
}

// Realer Pfad der geschützten Favoriten-Datei (null, wenn nicht vorhanden)
async function favoriteFile(f) {
  if (!f.storedName) return null;
  const dir = await fs.realpath(getFavoritesDir()).catch(() => null);
  if (!dir) return null;
  const real = await fs.realpath(path.join(dir, f.storedName)).catch(() => null);
  return real && real.startsWith(dir + path.sep) ? real : null;
}

// Alte Favoriten (nur Verweise) einmalig in den geschützten Ordner verschieben,
// soweit die Datei noch existiert; sonst als "missing" markieren.
let migrated = false;
async function migrateLegacyFavorites() {
  if (migrated) return;
  migrated = true;
  const list = getFavorites().map(f => ({ ...f }));
  let changed = false;
  for (const f of list) {
    if (f.storedName) continue;
    if (!f.id) { f.id = crypto.randomUUID(); changed = true; }
    try {
      const parts = f.path.split('/').filter(Boolean);
      const rootName = parts.shift();
      const root = getRoots().find(r => r.name === rootName);
      if (!root) { f.missing = true; changed = true; continue; }
      const target = path.resolve(root.path, parts.join('/'));
      const real = await fs.realpath(target);
      const rootReal = await fs.realpath(root.path);
      const st = await fs.stat(real);
      if (!real.startsWith(rootReal + path.sep) || !st.isFile()) { f.missing = true; changed = true; continue; }
      await fs.mkdir(getFavoritesDir(), { recursive: true, mode: 0o700 });
      const storedName = f.id + path.extname(f.name);
      await moveFile(real, path.join(getFavoritesDir(), storedName));
      f.storedName = storedName;
      f.origin = real;
      delete f.missing;
      changed = true;
    } catch (err) {
      f.missing = true;
      changed = true;
    }
  }
  if (changed) {
    try { setFavorites(list); } catch (err) { console.error('[favorites] Migration nicht gespeichert:', err); }
  }
}

router.get('/api/favorites', auth.requireAuthApi, async (req, res) => {
  try {
    await serialized(migrateLegacyFavorites);
    res.json({ favorites: getFavorites().map(publicFavorite) });
  } catch (err) {
    console.error('[api/favorites] Fehler:', err);
    res.status(500).json({ error: 'Fehler beim Laden der Favoriten' });
  }
});

// Favorit hinzufügen: Datei wird in den geschützten Favoriten-Ordner VERSCHOBEN
router.post('/api/favorites/add', auth.requireAuthApi, (req, res) => {
  serialized(async () => {
    const relPath = req.body && typeof req.body.path === 'string' ? req.body.path.trim() : '';
    if (!relPath) return res.status(400).json({ error: 'path fehlt' });

    if (getFavorites().some(f => f.path === relPath)) {
      return res.status(409).json({ error: 'Ist bereits ein Favorit' });
    }

    const resolved = await resolveAndValidatePath(relPath, req);
    const stat = resolved && await fs.stat(resolved.realPath).catch(() => null);
    if (!stat || !stat.isFile()) return res.status(404).json({ error: 'Datei nicht gefunden' });

    const id = crypto.randomUUID();
    const name = path.basename(resolved.target);
    const storedName = id + path.extname(name);
    const dest = path.join(getFavoritesDir(), storedName);

    await fs.mkdir(getFavoritesDir(), { recursive: true, mode: 0o700 });
    await moveFile(resolved.realPath, dest);

    try {
      setFavorites([...getFavorites(), { id, name, path: relPath, storedName, origin: resolved.realPath }]);
    } catch (err) {
      await moveFile(dest, resolved.realPath).catch(() => {});
      throw err;
    }
    res.json({ ok: true, favorites: getFavorites().map(publicFavorite) });
  }).catch(err => {
    console.error('[api/favorites/add] Fehler:', err);
    res.status(500).json({ error: 'Favorit konnte nicht gespeichert werden' });
  });
});

// Favorit entfernen: Datei wird an den ursprünglichen Ort zurückverschoben
router.post('/api/favorites/remove', auth.requireAuthApi, (req, res) => {
  serialized(async () => {
    const id = req.body && typeof req.body.id === 'string' ? req.body.id : '';
    const fav = getFavorites().find(f => f.id === id);
    if (!fav) return res.status(404).json({ error: 'Favorit nicht gefunden' });

    let restoredTo = null;
    const stored = await favoriteFile(fav);
    if (stored && fav.origin) {
      let dest = fav.origin;
      if (await fs.stat(dest).then(() => true, () => false)) {
        const ext = path.extname(dest);
        dest = path.join(path.dirname(dest), path.basename(dest, ext) + ' (Favorit)' + ext);
      }
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await moveFile(stored, dest);
      restoredTo = dest;
    }

    try {
      setFavorites(getFavorites().filter(f => f.id !== id));
    } catch (err) {
      if (restoredTo) await moveFile(restoredTo, stored).catch(() => {});
      throw err;
    }
    res.json({ ok: true, favorites: getFavorites().map(publicFavorite) });
  }).catch(err => {
    console.error('[api/favorites/remove] Fehler:', err);
    res.status(500).json({ error: 'Favorit konnte nicht entfernt werden' });
  });
});

// -----------------------------------------------------------------------------
// /api/list – Ordnerinhalt anzeigen
// -----------------------------------------------------------------------------
router.get('/api/list', auth.requireAuthApi, async (req, res) => {
  try {
    const relativePath = req.query.path ? String(req.query.path).trim() : '';

    // Root-Liste
    if (!relativePath) {
      const roots = getVisibleRoots(req);
      return res.json({
        currentPath: '',
        items: roots.map(r => ({ name: r.name, type: 'folder' }))
      });
    }

    const resolved = await resolveAndValidatePath(relativePath, req);

    if (!resolved) {
      return res.status(400).json({ error: 'Ungültiger Pfad' });
    }

    const stat = await fs.stat(resolved.realPath).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      return res.status(404).json({ error: 'Verzeichnis nicht gefunden' });
    }

    const entries = await fs.readdir(resolved.realPath, { withFileTypes: true });

    const folderNames = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name);

    const fileEntries = entries
      .filter(e => !e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name);

    // Fetch stats for files (size + mtime for display and sorting)
    const fileStats = await Promise.all(
      fileEntries.map(async name => {
        const stat = await fs.stat(path.join(resolved.realPath, name)).catch(() => null);
        return stat ? { name, size: stat.size, mtime: stat.mtime } : { name, size: null, mtime: null };
      })
    );
    fileStats.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));

    // Fetch mtime for folders
    const folderStats = await Promise.all(
      folderNames.map(async name => {
        const stat = await fs.stat(path.join(resolved.realPath, name)).catch(() => null);
        return { name, mtime: stat ? stat.mtime : null };
      })
    );

    return res.json({
      currentPath: relativePath,
      items: [
        ...folderStats.map(s => ({ name: s.name, type: 'folder', mtime: s.mtime })),
        ...fileStats.map(s => ({ name: s.name, type: 'file', size: s.size, mtime: s.mtime }))
      ]
    });
  } catch (err) {
    console.error('[api/list] Fehler beim Lesen:', err);
    res.status(500).json({ error: 'Fehler beim Lesen des Verzeichnisses' });
  }
});

// -----------------------------------------------------------------------------
// /api/file – Datei herunterladen
// -----------------------------------------------------------------------------
const INLINE_TYPES = {
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
  '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
  '.wav': 'audio/wav', '.flac': 'audio/flac', '.oga': 'audio/ogg', '.ogg': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif'
};

router.get('/api/file', auth.requireAuthApi, async (req, res) => {
  try {
    let resolved;

    if (req.query.fav) {
      // Favorit aus dem geschützten Favoriten-Ordner
      const fav = getFavorites().find(f => f.id === String(req.query.fav));
      const realPath = fav && await favoriteFile(fav);
      if (!realPath) return res.status(404).json({ error: 'Datei nicht gefunden' });
      resolved = { realPath };
    } else {
      const relativePath = req.query.path ? String(req.query.path).trim() : '';

      if (!relativePath) {
        return res.status(400).json({ error: 'path fehlt' });
      }

      resolved = await resolveAndValidatePath(relativePath, req);

      if (!resolved) {
        return res.status(400).json({ error: 'Ungültiger Pfad' });
      }
    }

    const stat = await fs.stat(resolved.realPath).catch(err => {
      return null;
    });

    if (!stat || !stat.isFile()) {
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }

    res.set('X-Content-Type-Options', 'nosniff');

    // Medien/PDF dürfen inline (Vorschau, Streaming mit Range) – mit fester
    // Content-Type aus der Allowlist. Alles Ausführbare (HTML, SVG, JS, ...)
    // nur als Download + CSP-Sandbox, damit es nie im Origin der App läuft.
    const inlineType = INLINE_TYPES[path.extname(resolved.realPath).toLowerCase()];
    if (inlineType && req.query.download !== '1') {
      res.type(inlineType);
      return res.sendFile(resolved.realPath, { dotfiles: 'allow' });
    }

    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    return res.download(resolved.realPath, path.basename(resolved.realPath), { dotfiles: 'allow' });
  } catch (err) {
    console.error('[api/file] Fehler beim Senden:', err);
    res.status(500).json({ error: 'Fehler beim Senden der Datei' });
  }
});

// -----------------------------------------------------------------------------
// /api/delete – Dateien löschen
// -----------------------------------------------------------------------------
router.post('/api/delete', auth.requireAuthApi, async (req, res) => {
  const { paths } = req.body;

  if (!Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'paths muss ein nicht-leeres Array sein' });
  }

  const deleted = [];
  const failed = [];

  for (const relPath of paths) {
    try {
      const resolved = await resolveAndValidatePath(relPath, req);
      if (!resolved) {
        failed.push({ path: relPath, reason: 'Ungültiger Pfad' });
        continue;
      }

      const stat = await fs.stat(resolved.realPath).catch(() => null);
      if (!stat) {
        failed.push({ path: relPath, reason: 'Datei existiert nicht' });
        continue;
      }

      if (stat.isDirectory()) {
        failed.push({ path: relPath, reason: 'Ordner-Löschen nicht erlaubt' });
        continue;
      }

      await fs.unlink(resolved.realPath);
      deleted.push(relPath);
    } catch (err) {
      failed.push({ path: relPath, reason: err.message });
    }
  }

  return res.status(failed.length === 0 ? 200 : 207).json({ deleted, failed });
});

// -----------------------------------------------------------------------------
// /api/version – Version aus package.json + Update-Status nur über Commits
// -----------------------------------------------------------------------------
let versionCache = { at: 0, info: null };
const VERSION_CACHE_MS = 5 * 60 * 1000;

router.get('/api/version', auth.requireAuthApi, async (req, res) => {
  try {
    if (!versionCache.info || Date.now() - versionCache.at > VERSION_CACHE_MS) {
      versionCache = { at: Date.now(), info: await checkForUpdate() };
    }
    const info = versionCache.info;
    const updateAvailable = info && info.updateAvailable === true;

    res.json({
      version: pkg.version || 'unknown',
      updateAvailable,
      latestMessage: info && info.latestMessage ? info.latestMessage : null
    });
  } catch (err) {
    console.error('[api/version] Fehler:', err);
    res.status(500).json({ error: 'Fehler beim Lesen der Version' });
  }
});

// -----------------------------------------------------------------------------
// /api/update – führt update.sh aus (git pull + npm install + Restart)
// -----------------------------------------------------------------------------
let updateRunning = false;

router.post('/api/update', auth.requireAuthApi, (req, res) => {
  if (config.allowRemoteUpdate === false) {
    return res.status(403).json({ ok: false, message: 'Update über die API ist deaktiviert' });
  }

  if (updateRunning) {
    return res.status(409).json({
      ok: false,
      message: 'Update läuft bereits'
    });
  }

  updateRunning = true;

  const scriptPath = path.join(__dirname, 'update.sh');

  console.log('[api/update] Starte Update-Script:', scriptPath);

  // Ausgabe in update.log, damit fehlgeschlagene Updates nachvollziehbar sind
  const logFd = require('fs').openSync(path.join(__dirname, 'update.log'), 'a');
  const child = require('child_process').spawn('bash', [scriptPath], {
    cwd: __dirname,
    detached: true,
    stdio: ['ignore', logFd, logFd]
  });

  child.unref();

  child.on('exit', (code) => {
    updateRunning = false;
    console.log('[api/update] Script beendet mit Code:', code);
  });

  child.on('error', (err) => {
    updateRunning = false;
    console.error('[api/update] Fehler beim Starten:', err);
  });

  return res.status(202).json({
    ok: true,
    message: 'Update gestartet'
  });
});

module.exports = router;

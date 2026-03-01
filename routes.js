// routes.js
const express = require('express');
const serveIndex = require('serve-index');
const path = require('path');
const fs = require('fs/promises');
const { exec, execFile } = require('child_process'); // Git-Check + update.sh

const config = require('./config');
const auth = require('./auth');
const { sortFilesByMTime } = require('./fileUtils');
const { getRoots, setRoots, validateRootsInput, isUnderAllowedBase } = require('./pathsStore');
const pkg = require('./package.json'); // Version aus package.json 

const router = express.Router();

const trustProxy = !!config.trustProxy;

// -----------------------------------------------------------------------------
// IP-Whitelist Middleware
// -----------------------------------------------------------------------------
function ipWhitelist(req, res, next) {
  const remoteAddr = (req.connection && req.connection.remoteAddress) || req.socket.remoteAddress || '';
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIpRaw = trustProxy && forwardedFor
    ? forwardedFor.split(',')[0].trim()
    : remoteAddr;

  let clientIp = clientIpRaw;
  if (clientIpRaw.startsWith('::ffff:')) {
    clientIp = clientIpRaw.slice(7);
  }

  console.log(`Client IP: ${clientIp}`);

  if (config.whitelist.includes(clientIp)) {
    console.log(`IP ${clientIp} ist in der Whitelist. Zugriff erlaubt.`);
    return next();
  }

  console.log(`IP ${clientIp} ist nicht in der Whitelist. Weiter zur Authentifizierung.`);
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

function isExpertMode(req) {
  const raw = String(req.get('x-expert-mode') || '').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

// Nur "sichere" Roots, wenn NICHT Expert-Mode
function getVisibleRoots(req) {
  const all = getRoots();
  if (isExpertMode(req)) {
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

  const base = path.resolve(resolved.base);
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
  console.log('[api/paths] GET ->', roots);
  res.json({ roots });
});

router.post('/api/paths', auth.requireAuthApi, async (req, res) => {
  const { roots } = req.body;

  if (!Array.isArray(roots)) {
    return res.status(400).json({ error: 'roots muss ein Array sein' });
  }

  const allowDangerous = isExpertMode(req);
  const { cleaned, errors } = validateRootsInput(roots, { allowDangerous });

  if (cleaned.length === 0) {
    return res.status(400).json({
      error: 'Keine gültigen Pfade übernommen',
      details: errors
    });
  }

  setRoots(cleaned);
  console.log('[api/paths] Root-Pfade aktualisiert:', getRoots());

  return res.status(errors.length > 0 ? 207 : 200).json({
    ok: errors.length === 0,
    roots: getRoots(),
    errors
  });
});

// -----------------------------------------------------------------------------
// /api/list – Ordnerinhalt anzeigen
// -----------------------------------------------------------------------------
router.get('/api/list', auth.requireAuthApi, async (req, res) => {
  try {
    const relativePath = req.query.path ? String(req.query.path).trim() : '';
    console.log('[api/list] relativePath =', `"${relativePath}"`,
                'expertMode =', isExpertMode(req));

    // Root-Liste
    if (!relativePath) {
      const roots = getVisibleRoots(req);
      console.log('[api/list] -> Root-Liste', roots);
      return res.json({
        currentPath: '',
        items: roots.map(r => ({ name: r.name, type: 'folder' }))
      });
    }

    const resolved = await resolveAndValidatePath(relativePath, req);
    console.log('[api/list] resolved =', resolved);

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
router.get('/api/file', auth.requireAuthApi, async (req, res) => {
  try {
    const relativePath = req.query.path ? String(req.query.path).trim() : '';
    console.log('[api/file] relativePath =', `"${relativePath}"`,
                'expertMode =', isExpertMode(req));

    if (!relativePath) {
      return res.status(400).json({ error: 'path fehlt' });
    }

    const resolved = await resolveAndValidatePath(relativePath, req);
    console.log('[api/file] resolved =', resolved);

    if (!resolved) {
      console.log('[api/file] resolveTargetPath -> null');
      return res.status(400).json({ error: 'Ungültiger Pfad' });
    }

    const stat = await fs.stat(resolved.realPath).catch(err => {
      console.log('[api/file] fs.stat error:', err.message);
      return null;
    });

    if (!stat || !stat.isFile()) {
      console.log('[api/file] Kein File an Pfad:', resolved.realPath);
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }

    console.log('[api/file] Sende Datei:', resolved.realPath);
    return res.sendFile(resolved.realPath);
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
router.get('/api/version', auth.requireAuthApi, async (req, res) => {
  try {
    const info = await checkForUpdate();
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
  if (updateRunning) {
    return res.status(409).json({
      ok: false,
      message: 'Update läuft bereits'
    });
  }

  updateRunning = true;

  const scriptPath = path.join(__dirname, 'update.sh');

  console.log('[api/update] Starte Update-Script:', scriptPath);

  const child = execFile('bash', [scriptPath], {
    cwd: __dirname,
    detached: true
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

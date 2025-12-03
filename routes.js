// routes.js
const express = require('express');
const serveIndex = require('serve-index');
const path = require('path');
const fs = require('fs/promises');
const { execFile } = require('child_process');

const config = require('./config');
const pkg = require('./package.json');
const auth = require('./auth');
const { sortFilesByMTime } = require('./fileUtils');
const { getRoots, setRoots, validateRootsInput, isUnderAllowedBase } = require('./pathsStore');

const router = express.Router();

// -----------------------------------------------------------------------------
// IP-Whitelist Middleware
// -----------------------------------------------------------------------------
function ipWhitelist(req, res, next) {
  const clientIpRaw =
    (req.headers['x-forwarded-for'] ||
      req.connection.remoteAddress ||
      '')
      .split(',')[0]
      .trim();

  const clientIp = clientIpRaw.startsWith('::ffff:')
    ? clientIpRaw.slice(7)
    : clientIpRaw;

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

Object.keys(config.directories).forEach(dir => {
  const dirPath = config.directories[dir];
  router.use(`/files/${dir}`, ipWhitelist, express.static(dirPath));
  router.use(`/files/${dir}`, ipWhitelist, serveIndex(dirPath, { icons: true }));
});

router.post('/login', (req, res) => auth.login(req, res));
router.post('/logout', (req, res) => auth.logout(req, res));

router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'webSite', 'login.html'));
});

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

function getVisibleRoots(req) {
  const all = getRoots();
  if (isExpertMode(req)) {
    return all;
  }
  return all.filter(r => isUnderAllowedBase(r.path));
}

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

  if (!target.startsWith(base)) return null;
  return target;
}

// -----------------------------------------------------------------------------
// API: Root-Pfade verwalten (SettingsView)
// -----------------------------------------------------------------------------

router.get('/api/paths', auth.requireAuthApi, (req, res) => {
  const roots = getRoots();
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

    if (!relativePath) {
      const roots = getVisibleRoots(req);
      console.log('[api/list] -> Root-Liste', roots);
      return res.json({
        currentPath: '',
        items: roots.map(r => ({ name: r.name, type: 'folder' }))
      });
    }

    const targetPath = resolveTargetPath(relativePath, req);
    console.log('[api/list] targetPath =', targetPath);

    if (!targetPath) {
      return res.status(400).json({ error: 'Ungültiger Pfad' });
    }

    const stat = await fs.stat(targetPath).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      return res.status(404).json({ error: 'Verzeichnis nicht gefunden' });
    }

    const entries = await fs.readdir(targetPath, { withFileTypes: true });

    const folderNames = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name);

    const allSortedNames = await sortFilesByMTime(targetPath);
    const folderSet = new Set(folderNames);
    const fileNames = allSortedNames.filter(name => !folderSet.has(name));

    return res.json({
      currentPath: relativePath,
      items: [
        ...folderNames.map(n => ({ name: n, type: 'folder' })),
        ...fileNames.map(n => ({ name: n, type: 'file' }))
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

    const absPath = resolveTargetPath(relativePath, req);
    console.log('[api/file] absPath =', absPath);

    if (!absPath) {
      return res.status(400).json({ error: 'Ungültiger Pfad' });
    }

    const stat = await fs.stat(absPath).catch(() => null);
    if (!stat || !stat.isFile()) {
      return res.status(404).json({ error: 'Datei nicht gefunden' });
    }

    console.log('[api/file] Sende Datei:', absPath);
    return res.sendFile(absPath);
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
      const absPath = resolveTargetPath(relPath, req);
      if (!absPath) {
        failed.push({ path: relPath, reason: 'Ungültiger Pfad' });
        continue;
      }

      const stat = await fs.stat(absPath).catch(() => null);
      if (!stat) {
        failed.push({ path: relPath, reason: 'Datei existiert nicht' });
        continue;
      }

      if (stat.isDirectory()) {
        failed.push({ path: relPath, reason: 'Ordner-Löschen nicht erlaubt' });
        continue;
      }

      await fs.unlink(absPath);
      deleted.push(relPath);
    } catch (err) {
      failed.push({ path: relPath, reason: err.message });
    }
  }

  return res.status(failed.length === 0 ? 200 : 207).json({ deleted, failed });
});

// -----------------------------------------------------------------------------
// /api/version – Aktuelle Server-Version liefern
// -----------------------------------------------------------------------------

router.get('/api/version', auth.requireAuthApi, async (req, res) => {
  try {
    let buildInfo = null;

    try {
      const raw = await fs.readFile(path.join(__dirname, 'build-info.json'), 'utf8');
      buildInfo = JSON.parse(raw);
    } catch (e) {
      // Wenn Datei fehlt oder kaputt ist -> ignorieren, nur version zurückgeben
      console.warn('[api/version] Keine oder ungültige build-info.json:', e.message);
    }

    res.json({
      version: pkg.version || 'unknown',
      gitCommit: buildInfo?.gitCommit || null,
      buildTime: buildInfo?.buildTime || null
    });
  } catch (err) {
    console.error('[api/version] Fehler:', err);
    res.status(500).json({ error: 'Fehler beim Lesen der Version' });
  }
});

// -----------------------------------------------------------------------------
// /api/update – Update-Script starten
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
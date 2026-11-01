// pathsStore.js
const fs = require('fs');
const path = require('path');
const config = require('./config');

const CONFIG_FILE = path.join(__dirname, 'paths.json');

// -----------------------------------------------------------------------------
// 1) Erlaubte Basis-Verzeichnisse ("sicher")
// -----------------------------------------------------------------------------
// Optional: in config.js z.B.
//   allowedBasePaths: ['/home']
//
// Wenn nicht gesetzt, nehmen wir die Elternverzeichnisse deiner bisherigen
// config.directories als erlaubte Basis.
const configuredBases = Array.isArray(config.allowedBasePaths)
  ? config.allowedBasePaths
  : [];

const derivedBases = Object.values(config.directories || {}).map(dir =>
  path.dirname(path.resolve(dir))
);

const ALLOWED_BASES = (configuredBases.length > 0 ? configuredBases : derivedBases)
  .map(p => path.resolve(p));

console.log('[pathsStore] ALLOWED_BASES:', ALLOWED_BASES);

// Pfad liegt unter einem der erlaubten Basis-Verzeichnisse?
function isUnderAllowedBase(p) {
  const resolved = path.resolve(p);
  return ALLOWED_BASES.some(base => {
    const b = path.resolve(base);
    return resolved === b || resolved.startsWith(b + path.sep);
  });
}

// -----------------------------------------------------------------------------
// 2) Default-Roots aus config.directories
// -----------------------------------------------------------------------------
const defaultRoots = Object.entries(config.directories || {}).map(
  ([name, dirPath]) => ({
    name,
    path: path.resolve(dirPath)
  })
);

function readRootsFromDisk() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      console.log('[pathsStore] Keine paths.json gefunden, nutze config.directories als Default.');
      return defaultRoots;
    }

    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    const data = JSON.parse(raw);

    if (Array.isArray(data.roots)) {
      console.log('[pathsStore] roots aus paths.json geladen.');
      return data.roots.map(r => ({
        name: String(r.name),
        path: path.resolve(String(r.path))
      }));
    }

    console.warn('[pathsStore] paths.json ohne gültige roots, nutze Default.');
    return defaultRoots;
  } catch (err) {
    console.error('[pathsStore] Fehler beim Lesen von paths.json:', err);
    return defaultRoots;
  }
}

function writeRootsToDisk(roots) {
  try {
    // atomar schreiben, damit ein Absturz die Datei nicht halb geschrieben hinterlässt
    const tmp = CONFIG_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ roots }, null, 2), 'utf8');
    fs.renameSync(tmp, CONFIG_FILE);
    console.log('[pathsStore] roots in paths.json gespeichert.');
  } catch (err) {
    console.error('[pathsStore] Fehler beim Schreiben von paths.json:', err);
  }
}

// -----------------------------------------------------------------------------
// 3) Validierung von neuen Roots
// -----------------------------------------------------------------------------

function validateRootsInput(roots, options = {}) {
  const allowDangerous = !!options.allowDangerous;

  const cleaned = [];
  const errors = [];

  for (const r of roots) {
    if (!r || typeof r.name !== 'string' || typeof r.path !== 'string') {
      errors.push({
        name: r && r.name,
        path: r && r.path,
        reason: 'name/path müssen Strings sein'
      });
      continue;
    }

    const name = r.name.trim();
    const p = r.path.trim();

    if (!name || !p) {
      errors.push({ name, path: p, reason: 'name/path dürfen nicht leer sein' });
      continue;
    }

    const resolvedPath = path.resolve(p);

    if (!allowDangerous && !isUnderAllowedBase(resolvedPath)) {
      errors.push({
        name,
        path: resolvedPath,
        reason: 'Pfad liegt nicht unter einem erlaubten Basisverzeichnis (kein Expert-Mode)'
      });
      continue;
    }

    try {
      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        errors.push({
          name,
          path: resolvedPath,
          reason: 'Pfad ist kein Verzeichnis'
        });
        continue;
      }
    } catch (err) {
      errors.push({
        name,
        path: resolvedPath,
        reason: 'Verzeichnis existiert nicht oder ist nicht lesbar'
      });
      continue;
    }

    cleaned.push({ name, path: resolvedPath });
  }

  return { cleaned, errors };
}

let currentRoots = readRootsFromDisk();

module.exports = {
  getRoots() {
    return currentRoots;
  },

  setRoots(roots) {
    currentRoots = roots;
    writeRootsToDisk(roots);
  },

  validateRootsInput,
  isUnderAllowedBase
};

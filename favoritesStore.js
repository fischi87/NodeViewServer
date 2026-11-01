// favoritesStore.js
// Favoriten: { id, name, path, storedName?, origin?, alias? }
//  - path:       ursprünglicher relativer Pfad (Root/Ordner/Datei)
//  - storedName: Dateiname im geschützten Favoriten-Ordner (neue Favoriten)
//  - origin:     ursprünglicher absoluter Pfad, für das Zurückverschieben
const fs = require('fs');
const path = require('path');
const config = require('./config');

const FAVORITES_FILE = process.env.NVS_FAVORITES_FILE || path.join(__dirname, 'favorites.json');

// Ordner, in den Favoriten verschoben werden (außerhalb der freigegebenen Roots,
// damit externe Aufräum-/Löschroutinen sie nicht erreichen).
function getFavoritesDir() {
  return path.resolve(config.favoritesDir || path.join(__dirname, 'favorites'));
}

function readFavoritesFromDisk() {
  try {
    if (!fs.existsSync(FAVORITES_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf8'));
    if (Array.isArray(data.favorites)) {
      return data.favorites.filter(
        f => f && typeof f.name === 'string' && typeof f.path === 'string'
      );
    }
    return [];
  } catch (err) {
    console.error('[favoritesStore] Fehler beim Lesen:', err);
    return [];
  }
}

// atomar schreiben; wirft bei Fehler, damit Aufrufer (z. B. Verschieben) zurückrollen können
function writeFavoritesToDisk(favorites) {
  const tmp = FAVORITES_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ favorites }, null, 2), 'utf8');
  fs.renameSync(tmp, FAVORITES_FILE);
}

let currentFavorites = readFavoritesFromDisk();

module.exports = {
  getFavorites() {
    return currentFavorites;
  },
  setFavorites(favorites) {
    writeFavoritesToDisk(favorites);
    currentFavorites = favorites;
  },
  getFavoritesDir
};

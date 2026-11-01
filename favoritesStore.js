// favoritesStore.js
const fs = require('fs');
const path = require('path');

const FAVORITES_FILE = path.join(__dirname, 'favorites.json');

function readFavoritesFromDisk() {
  try {
    if (!fs.existsSync(FAVORITES_FILE)) return [];
    const raw = fs.readFileSync(FAVORITES_FILE, 'utf8');
    const data = JSON.parse(raw);
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

function writeFavoritesToDisk(favorites) {
  try {
    // atomar schreiben, damit ein Absturz die Datei nicht halb geschrieben hinterlässt
    const tmp = FAVORITES_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ favorites }, null, 2), 'utf8');
    fs.renameSync(tmp, FAVORITES_FILE);
  } catch (err) {
    console.error('[favoritesStore] Fehler beim Schreiben:', err);
  }
}

let currentFavorites = readFavoritesFromDisk();

module.exports = {
  getFavorites() {
    return currentFavorites;
  },
  setFavorites(favorites) {
    currentFavorites = favorites;
    writeFavoritesToDisk(favorites);
  }
};

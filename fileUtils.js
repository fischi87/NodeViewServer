// fileUtils.js
const fs = require('fs');
const path = require('path');

// Funktion zum Sortieren der Dateien nach Änderungsdatum
// -> Hidden-Dateien (Name beginnt mit ".") werden ignoriert
function sortFilesByMTime(dirPath) {
    return new Promise((resolve, reject) => {
        fs.readdir(dirPath, (err, files) => {
            if (err) {
                return reject('Fehler beim Lesen der Verzeichnisse');
            }

            // Versteckte Dateien ausfiltern (z. B. .DS_Store, .git, ...)
            const visibleFiles = files.filter(name => !name.startsWith('.'));

            const fileStatsPromises = visibleFiles.map(file => {
                return new Promise((resolve, reject) => {
                    fs.stat(path.join(dirPath, file), (err, stats) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({ file, mtime: stats.mtime });
                        }
                    });
                });
            });

            Promise.all(fileStatsPromises)
                .then(fileStats => {
                    fileStats.sort((a, b) => b.mtime - a.mtime);
                    resolve(fileStats.map(stat => stat.file));
                })
                .catch(err => reject('Fehler beim Sortieren der Dateien'));
        });
    });
}

module.exports = {
    sortFilesByMTime
};

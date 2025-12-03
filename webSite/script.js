// -----------------------------
// Einfache Dateibrowser-Logik
// Backend: /api/list + /api/file
// -----------------------------

let currentPath = ''; // "" = Root-Liste

// Hilfsfunktion: Text für Überschrift
function getTitleForPath(path) {
    if (!path) return 'Freigegebene Bereiche';
    return path;
}

// Pfad nach oben gehen
function goUp() {
    if (!currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop(); // letztes Segment entfernen
    currentPath = parts.join('/');
    loadCurrentDirectory();
}

// Ordner öffnen (Pfad nach unten)
function openFolder(name) {
    currentPath = currentPath ? `${currentPath}/${name}` : name;
    loadCurrentDirectory();
}

// Hauptfunktion: aktuelles Verzeichnis laden
async function loadCurrentDirectory() {
    const container = document.getElementById('directories');
    if (!container) return;

    container.innerHTML = '';

    // Directory-Card erstellen
    const directoryElement = document.createElement('div');
    directoryElement.classList.add('directory');

    directoryElement.innerHTML = `
        <h2>${getTitleForPath(currentPath)}</h2>
        <div class="directory-files">
            <p class="loading">Lade Inhalte...</p>
        </div>
    `;

    container.appendChild(directoryElement);

    const filesContainer = directoryElement.querySelector('.directory-files');

    try {
        const url = currentPath
            ? `/api/list?path=${encodeURIComponent(currentPath)}`
            : '/api/list';

        const response = await fetch(url, {
            method: 'GET'
            // wichtig: keine credentials-Option setzen -> Cookies werden bei same-origin automatisch gesendet
        });

        if (!response.ok) {
            filesContainer.innerHTML = `<p>Fehler beim Laden: ${response.status}</p>`;
            return;
        }

        const data = await response.json();

        // Erwartete Struktur:
        // {
        //   currentPath: 'Home/Bilder' oder '',
        //   items: [{ name: 'xyz', type: 'folder' | 'file' }, ...]
        // }

        filesContainer.innerHTML = '';

        const list = document.createElement('ul');

        // ".." nach oben, falls nicht in der Root-Liste
        if (currentPath) {
            const upItem = document.createElement('li');
            const upLink = document.createElement('a');
            upLink.href = '#';
            upLink.textContent = '..';
            upLink.addEventListener('click', (e) => {
                e.preventDefault();
                goUp();
            });
            upItem.appendChild(upLink);
            list.appendChild(upItem);
        }

        // Items rendern
        data.items.forEach(item => {
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.textContent = item.name;
            link.href = '#';

            if (item.type === 'folder') {
                // Ordner
                li.setAttribute('data-type', 'directory');
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    openFolder(item.name);
                });
            } else {
                // Datei
                const fullPath = currentPath
                    ? `${currentPath}/${item.name}`
                    : item.name;

                // Icons anhand des Typs / der Endung
                const lowerName = item.name.toLowerCase();
                if (lowerName.endsWith('.mp4')) {
                    li.setAttribute('data-file-type', 'video');
                } else if (lowerName.match(/\.(jpe?g|png|gif|bmp|webp)$/i)) {
                    li.setAttribute('data-file-type', 'image');
                } else {
                    li.setAttribute('data-file-type', 'file');
                }

                // Download-/View-Link
                link.href = `/api/file?path=${encodeURIComponent(fullPath)}`;
                link.target = '_blank';
            }

            li.appendChild(link);
            list.appendChild(li);
        });

        if (data.items.length === 0) {
            filesContainer.innerHTML = '<p>Keine Einträge vorhanden.</p>';
        } else {
            filesContainer.appendChild(list);
        }
    } catch (error) {
        console.error('Fehler beim Laden des Verzeichnisses:', error);
        filesContainer.innerHTML = `<p>Fehler: ${error.message}</p>`;
    }
}

async function fetchServerVersion() {
    try {
        const res = await fetch('/api/version');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const span = document.getElementById('server-version');
        span.textContent = `Server-Version: ${data.version}`;
    } catch (err) {
        console.error('Fehler beim Laden der Version:', err);
        const span = document.getElementById('server-version');
        if (span) span.textContent = 'Server-Version: unbekannt';
    }
}

async function triggerServerUpdate() {
    if (!confirm('Server-Update wirklich starten?')) return;

    try {
        const res = await fetch('/api/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 202 && data.ok) {
            alert('Update wurde gestartet. Der Server kann sich gleich neu starten.');
        } else {
            alert('Update konnte nicht gestartet werden: ' + (data.message || 'Unbekannter Fehler'));
        }
    } catch (err) {
        console.error('Fehler bei /api/update:', err);
        alert('Fehler beim Starten des Updates. Siehe Konsole/Server-Log.');
    }
}

// Beim Laden der Seite
document.addEventListener('DOMContentLoaded', () => {
    fetchServerVersion();

    const btnUpdate = document.getElementById('btn-update-server');
    if (btnUpdate) {
        btnUpdate.addEventListener('click', triggerServerUpdate);
    }

    // bestehendes init:
    loadDirectories();
});

// Zurück-Button (falls irgendwo im HTML vorhanden)
document.addEventListener('click', function(event) {
    if (event.target.matches('.back-button')) {
        window.location.href = '/';
    }
});

// Initiales Laden
document.addEventListener('DOMContentLoaded', loadCurrentDirectory);
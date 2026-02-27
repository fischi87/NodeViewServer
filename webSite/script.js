// script.js
// -----------------------------
// Dateibrowser + Update-Logik
// Backend: /api/list, /api/file, /api/delete, /api/version, /api/update
// -----------------------------

let currentPath = ''; // "" = Root-Liste

// Überschrift für den aktuellen Pfad
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
    currentPath = currentPath
        ? `${currentPath}/${name}`
        : name;
    loadCurrentDirectory();
}

// Hilfsfunktion: erstellt ein Listenelement für Datei/Ordner
function createItemElement(item) {
    const li = document.createElement('li');
    li.classList.add('directory-item');
    li.setAttribute('data-type', item.type);

    const span = document.createElement('span');
    span.textContent = item.name;

    if (item.type === 'folder') {
        span.classList.add('clickable-folder');
        span.addEventListener('click', () => openFolder(item.name));
    } else {
        span.classList.add('clickable-file');
        span.addEventListener('click', () => openFile(item.name));
    }

    li.appendChild(span);

    if (item.type === 'file') {
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Löschen';
        deleteBtn.classList.add('delete-button');
        deleteBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            deleteFile(item.name);
        });
        li.appendChild(deleteBtn);
    }

    return li;
}

// Aktuelles Verzeichnis vom Server laden
async function loadCurrentDirectory() {
    const container = document.getElementById('directories');
    if (!container) return;

    container.innerHTML = '';

    const title = document.createElement('h2');
    title.textContent = getTitleForPath(currentPath);
    container.appendChild(title);

    const listWrapper = document.createElement('div');
    listWrapper.classList.add('directory-files');
    container.appendChild(listWrapper);

    const ul = document.createElement('ul');
    listWrapper.appendChild(ul);

    // "Nach oben"-Eintrag, wenn wir nicht im Root sind
    if (currentPath) {
        const upLi = document.createElement('li');
        upLi.textContent = '⬆️ Eine Ebene nach oben';
        upLi.classList.add('clickable-folder');
        upLi.addEventListener('click', goUp);
        ul.appendChild(upLi);
    }

    try {
        const params = currentPath ? `?path=${encodeURIComponent(currentPath)}` : '';
        const res = await fetch(`/api/list${params}`);

        if (!res.ok) {
            throw new Error('HTTP ' + res.status);
        }

        const data = await res.json();

        if (!Array.isArray(data.items) || data.items.length === 0) {
            const emptyLi = document.createElement('li');
            emptyLi.textContent = '(Keine Einträge)';
            ul.appendChild(emptyLi);
            return;
        }

        data.items.forEach(item => {
            const li = createItemElement(item);
            ul.appendChild(li);
        });
    } catch (err) {
        console.error('[loadCurrentDirectory] Fehler:', err);
        const errLi = document.createElement('li');
        errLi.textContent = 'Fehler beim Laden des Verzeichnisses';
        ul.appendChild(errLi);
    }
}

// Datei öffnen (Download im Browser)
function openFile(fileName) {
    if (!currentPath) return;
    const relPath = `${currentPath}/${fileName}`;
    const url = `/api/file?path=${encodeURIComponent(relPath)}`;
    window.open(url, '_blank');
}

// Datei löschen
async function deleteFile(fileName) {
    if (!currentPath) return;
    const relPath = `${currentPath}/${fileName}`;

    if (!confirm(`Datei "${fileName}" wirklich löschen?`)) {
        return;
    }

    try {
        const res = await fetch('/api/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ paths: [relPath] })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok && res.status !== 207) {
            alert('Löschen fehlgeschlagen: ' + (data.error || res.status));
            return;
        }

        if (Array.isArray(data.deleted) && data.deleted.length > 0) {
            alert('Datei gelöscht: ' + data.deleted.join(', '));
        }

        if (Array.isArray(data.failed) && data.failed.length > 0) {
            const msgs = data.failed.map(f => `${f.path}: ${f.reason}`).join('\n');
            alert('Einige Dateien konnten nicht gelöscht werden:\n' + msgs);
        }

        // Verzeichnis neu laden
        loadCurrentDirectory();
    } catch (err) {
        console.error('[deleteFile] Fehler:', err);
        alert('Fehler beim Löschen der Datei.');
    }
}

// -----------------------------------------------------------------------------
// Version & Update-Logik
// -----------------------------------------------------------------------------

// /api/version -> Version + updateAvailable abfragen
async function fetchServerVersion() {
    const versionEl = document.getElementById('server-version');
    const badge     = document.getElementById('update-badge');
    const banner    = document.getElementById('update-banner');
    const details   = document.getElementById('update-details');
    const btn       = document.getElementById('btn-update-server');

    // Lade-Zustand
    if (versionEl) versionEl.textContent = 'lädt …';
    if (badge)     { badge.textContent = '⏳'; badge.className = 'update-badge'; }
    if (banner)    banner.style.display = 'none';

    try {
        const res = await fetch('/api/version');
        if (!res.ok) throw new Error('HTTP ' + res.status);

        const data = await res.json();

        if (versionEl) versionEl.textContent = `v${data.version || '?'}`;

        if (data.updateAvailable) {
            // Update verfügbar → Badge + Banner anzeigen
            if (badge) { badge.textContent = '↑ Update'; badge.className = 'update-badge is-available'; }
            if (details) details.textContent = data.latestMessage ? `Änderungen: ${data.latestMessage}` : '';
            if (banner) banner.style.display = 'flex';
            if (btn)    { btn.disabled = false; btn.textContent = '↑ Jetzt aktualisieren'; }
        } else {
            // Aktuell → grünes Badge, kein Banner
            if (badge) { badge.textContent = '✓ Aktuell'; badge.className = 'update-badge is-ok'; }
        }
    } catch (err) {
        console.error('Konnte /api/version nicht laden:', err);
        if (versionEl) versionEl.textContent = 'v?';
        if (badge)     { badge.textContent = '– –'; badge.className = 'update-badge is-error'; }
    }
}

// Update-Button -> /api/update + danach Logout
async function triggerServerUpdate() {
    if (!confirm('Server-Update wirklich starten?')) {
        return;
    }

    const btn = document.getElementById('btn-update-server');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Update läuft...';
    }

    try {
        const res = await fetch('/api/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await res.json().catch(() => ({}));

        if (res.status === 202 && data.ok) {
            alert('Update wurde gestartet. Der Server kann sich gleich neu starten.\nDu wirst jetzt abgemeldet.');

            // Versuche, den Nutzer sauber abzumelden
            try {
                await fetch('/logout', {
                    method: 'POST'
                });
            } catch (logoutErr) {
                console.warn('[triggerServerUpdate] Logout-Fehler (evtl. wegen Neustart):', logoutErr);
            }

            // Zur Login-Seite zurück
            window.location.href = '/';
        } else {
            alert('Update konnte nicht gestartet werden: ' + (data.message || 'Unbekannter Fehler'));
        }
    } catch (err) {
        console.error('[triggerServerUpdate] Fehler:', err);
        alert('Update fehlgeschlagen (Netzwerkfehler?).');
    } finally {
        // Falls wir NICHT weitergeleitet wurden (Update fehlgeschlagen),
        // Button wieder freigeben
        const btn2 = document.getElementById('btn-update-server');
        if (btn2) {
            btn2.disabled = false;
            btn2.textContent = '↑ Jetzt aktualisieren';
        }
    }
}

// -----------------------------------------------------------------------------
// Initialisierung beim Laden der Seite
// -----------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    // Version / Update-Status laden
    fetchServerVersion();

    // Dateibrowser starten
    loadCurrentDirectory();

    // Update-Button verbinden
    const btn = document.getElementById('btn-update-server');
    if (btn) {
        btn.addEventListener('click', triggerServerUpdate);
    }
});

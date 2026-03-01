// script.js – NodeViewServer
// Sidebar-Navigation · Dateibrowser · Breadcrumbs · Update-Logik

let currentPath = '';   // "" = Root, "Simulation" = Root-Ordner, "Simulation/logs" = Unterordner

// ─── HILFSFUNKTIONEN ─────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024)             return bytes + ' B';
  if (bytes < 1024 * 1024)     return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1048576 * 1024)  return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / (1048576 * 1024)).toFixed(2) + ' GB';
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ─── SVG ICONS (inline, no external deps) ────────────────────────────────────

const ICON_FOLDER = `<svg class="file-row__icon" viewBox="0 0 24 24" fill="currentColor">
  <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15ZM1.5 10.146V6a3 3 0 0 1 3-3h5.379a2.25 2.25 0 0 1 1.59.659l2.122 2.121c.459.46 1.187.687 1.932.687h4.477a3 3 0 0 1 3 3v1.354a4.484 4.484 0 0 0-1.5-.262h-15a4.484 4.484 0 0 0-1.5.262H1.5Z"/>
</svg>`;

const ICON_FILE = `<svg class="file-row__icon" viewBox="0 0 24 24" fill="currentColor">
  <path fill-rule="evenodd" d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0 0 16.5 9h-1.875a1.875 1.875 0 0 1-1.875-1.875V5.25A3.75 3.75 0 0 0 9 1.5H5.625ZM7.5 15a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 7.5 15Zm.75 2.25a.75.75 0 0 0 0 1.5H12a.75.75 0 0 0 0-1.5H8.25Z" clip-rule="evenodd"/>
  <path d="M12.971 1.816A5.23 5.23 0 0 1 14.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 0 1 3.434 1.279 9.768 9.768 0 0 0-6.963-6.963Z"/>
</svg>`;

const ICON_UP = `<svg class="file-row__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="15 18 9 12 15 6"/>
</svg>`;

// ─── BREADCRUMB ───────────────────────────────────────────────────────────────

function renderBreadcrumb() {
  const el = document.getElementById('breadcrumb');
  if (!el) return;
  el.innerHTML = '';

  if (!currentPath) {
    const seg = document.createElement('span');
    seg.className = 'breadcrumb__segment current';
    seg.textContent = 'Bereiche';
    el.appendChild(seg);
    return;
  }

  const parts = currentPath.split('/').filter(Boolean);

  parts.forEach((part, i) => {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb__sep';
    sep.textContent = '/';
    el.appendChild(sep);

    const seg = document.createElement('span');
    const isLast = i === parts.length - 1;
    seg.className = 'breadcrumb__segment' + (isLast ? ' current' : '');
    seg.textContent = part;

    if (!isLast) {
      const targetPath = parts.slice(0, i + 1).join('/');
      seg.addEventListener('click', () => {
        currentPath = targetPath;
        renderBreadcrumb();
        renderFileList();
      });
    }

    el.appendChild(seg);
  });
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────

let sidebarRoots = [];

async function loadSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  try {
    const res = await fetch('/api/list');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    sidebarRoots = Array.isArray(data.items) ? data.items : [];

    // Remove previously rendered items (keep the label div)
    sidebar.querySelectorAll('.sidebar__item').forEach(el => el.remove());

    sidebarRoots.forEach(root => {
      const item = document.createElement('div');
      item.className = 'sidebar__item';
      item.dataset.root = root.name;
      item.innerHTML = `${ICON_FOLDER}<span>${root.name}</span>`;
      item.querySelector('.file-row__icon')?.classList.replace('file-row__icon', 'sidebar__item-icon');
      item.addEventListener('click', () => {
        currentPath = root.name;
        updateSidebarActive();
        renderBreadcrumb();
        renderFileList();
      });
      sidebar.appendChild(item);
    });

    updateSidebarActive();
  } catch (err) {
    console.error('[loadSidebar] Fehler:', err);
  }
}

function updateSidebarActive() {
  document.querySelectorAll('.sidebar__item').forEach(item => {
    const root = item.dataset.root;
    const active = currentPath === root || currentPath.startsWith(root + '/');
    item.classList.toggle('active', active);
  });
}

// ─── FILE LIST ────────────────────────────────────────────────────────────────

async function renderFileList() {
  const container = document.getElementById('file-list');
  if (!container) return;

  container.innerHTML = '<div class="file-list__empty">Lädt …</div>';

  if (!currentPath) {
    container.innerHTML = '<div class="file-list__empty">Wähle einen Bereich in der Sidebar.</div>';
    return;
  }

  try {
    const res = await fetch(`/api/list?path=${encodeURIComponent(currentPath)}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];

    const parts = currentPath.split('/').filter(Boolean);
    const canGoUp = parts.length > 1;

    if (items.length === 0 && !canGoUp) {
      container.innerHTML = '<div class="file-list__empty">Keine Einträge</div>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'file-list__table';
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:100%">Name</th>
          <th>Größe</th>
          <th>Geändert</th>
          <th></th>
        </tr>
      </thead>
    `;

    const tbody = document.createElement('tbody');

    // "Up" row
    if (canGoUp) {
      const tr = document.createElement('tr');
      tr.className = 'file-row up-row';
      tr.innerHTML = `<td colspan="4"><div class="file-row__name">${ICON_UP}<span class="file-row__label">..</span></div></td>`;
      tr.addEventListener('click', () => {
        const p = currentPath.split('/').filter(Boolean);
        p.pop();
        currentPath = p.join('/');
        updateSidebarActive();
        renderBreadcrumb();
        renderFileList();
      });
      tbody.appendChild(tr);
    }

    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = 'file-row';

      const icon        = item.type === 'folder' ? ICON_FOLDER : ICON_FILE;
      const labelClass  = 'file-row__label' + (item.type === 'folder' ? ' is-folder' : '');
      const sizeCell    = item.type === 'file' ? formatSize(item.size) : '—';
      const dateCell    = formatDate(item.mtime);
      const deleteBtn   = item.type === 'file'
        ? `<button class="btn-delete" data-name="${item.name}">Löschen</button>`
        : '';

      tr.innerHTML = `
        <td><div class="file-row__name">${icon}<span class="${labelClass}">${item.name}</span></div></td>
        <td class="file-row__meta">${sizeCell}</td>
        <td class="file-row__meta">${dateCell}</td>
        <td class="file-row__actions">${deleteBtn}</td>
      `;

      if (item.type === 'folder') {
        tr.addEventListener('click', () => {
          currentPath = currentPath ? `${currentPath}/${item.name}` : item.name;
          updateSidebarActive();
          renderBreadcrumb();
          renderFileList();
        });
      } else {
        tr.addEventListener('click', e => {
          if (e.target.closest('.btn-delete')) return;
          openFile(item.name);
        });
        const btn = tr.querySelector('.btn-delete');
        if (btn) {
          btn.addEventListener('click', e => {
            e.stopPropagation();
            deleteFile(item.name);
          });
        }
      }

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);

  } catch (err) {
    console.error('[renderFileList] Fehler:', err);
    container.innerHTML = '<div class="file-list__empty">Fehler beim Laden des Verzeichnisses.</div>';
  }
}

// ─── DATEI ÖFFNEN / PREVIEW ───────────────────────────────────────────────────

const FILE_TYPES = {
  video:  ['mp4', 'webm', 'ogv', 'ogg', 'mov'],
  image:  ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'],
  audio:  ['mp3', 'wav', 'aac', 'flac', 'm4a', 'oga'],
  pdf:    ['pdf'],
  text:   ['txt', 'log', 'md', 'json', 'js', 'ts', 'py', 'sh', 'bash',
           'yaml', 'yml', 'xml', 'csv', 'html', 'css', 'ini', 'conf',
           'toml', 'env', 'gitignore', 'rs', 'go', 'java', 'c', 'cpp', 'h'],
};

function getFileType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  for (const [type, exts] of Object.entries(FILE_TYPES)) {
    if (exts.includes(ext)) return type;
  }
  return 'other';
}

function openFile(fileName) {
  const relPath = `${currentPath}/${fileName}`;
  const url     = `/api/file?path=${encodeURIComponent(relPath)}`;
  const type    = getFileType(fileName);

  if (type === 'other') {
    window.open(url, '_blank');
    return;
  }

  openPreviewModal(fileName, url, type);
}

// ─── PREVIEW MODAL ────────────────────────────────────────────────────────────

function openPreviewModal(fileName, url, type) {
  const overlay  = document.getElementById('preview-overlay');
  const body     = document.getElementById('preview-body');
  const title    = document.getElementById('preview-filename');
  const download = document.getElementById('preview-download');

  title.textContent = fileName;
  download.href     = url;
  body.innerHTML    = '';

  if (type === 'video') {
    body.innerHTML = `<video controls autoplay>
      <source src="${url}">
      Dein Browser unterstützt dieses Videoformat nicht.
    </video>`;

  } else if (type === 'image') {
    body.innerHTML = `<img src="${url}" alt="${fileName}">`;

  } else if (type === 'audio') {
    body.innerHTML = `<audio controls autoplay>
      <source src="${url}">
      Dein Browser unterstützt dieses Audioformat nicht.
    </audio>`;

  } else if (type === 'pdf') {
    body.innerHTML = `<iframe src="${url}" title="${fileName}"></iframe>`;

  } else if (type === 'text') {
    body.innerHTML = '<div class="file-list__empty">Lädt …</div>';
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(text => {
        const pre = document.createElement('pre');
        pre.textContent = text.length > 200_000
          ? text.slice(0, 200_000) + '\n\n… (Datei zu groß, Rest abgeschnitten)'
          : text;
        body.innerHTML = '';
        body.appendChild(pre);
      })
      .catch(() => {
        body.innerHTML = '<div class="preview-unsupported">Datei konnte nicht geladen werden.</div>';
      });
  }

  overlay.classList.add('open');
}

function closePreviewModal() {
  const overlay = document.getElementById('preview-overlay');
  const body    = document.getElementById('preview-body');
  overlay.classList.remove('open');
  body.innerHTML = '';   // stoppt Video/Audio-Wiedergabe
}

// ─── DATEI LÖSCHEN ────────────────────────────────────────────────────────────

async function deleteFile(fileName) {
  const relPath = `${currentPath}/${fileName}`;
  if (!confirm(`Datei "${fileName}" wirklich löschen?`)) return;

  try {
    const res = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: [relPath] })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok && res.status !== 207) {
      alert('Löschen fehlgeschlagen: ' + (data.error || res.status));
      return;
    }

    if (Array.isArray(data.failed) && data.failed.length > 0) {
      alert('Fehler:\n' + data.failed.map(f => `${f.path}: ${f.reason}`).join('\n'));
    }

    renderFileList();
  } catch (err) {
    console.error('[deleteFile] Fehler:', err);
    alert('Fehler beim Löschen der Datei.');
  }
}

// ─── VERSION & UPDATE ─────────────────────────────────────────────────────────

async function fetchServerVersion() {
  const versionEl = document.getElementById('server-version');
  const badge     = document.getElementById('update-badge');
  const banner    = document.getElementById('update-banner');
  const details   = document.getElementById('update-details');
  const btn       = document.getElementById('btn-update-server');

  if (versionEl) versionEl.textContent = 'lädt …';
  if (badge)  { badge.textContent = '⏳'; badge.className = 'update-badge'; }
  if (banner) banner.classList.remove('visible');

  try {
    const res  = await fetch('/api/version');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    if (versionEl) versionEl.textContent = `v${data.version || '?'}`;

    if (data.updateAvailable) {
      if (badge)   { badge.textContent = '↑ Update'; badge.className = 'update-badge is-available'; }
      if (details) details.textContent = data.latestMessage ? `Änderungen: ${data.latestMessage}` : 'Update verfügbar';
      if (banner)  banner.classList.add('visible');
      if (btn)     { btn.disabled = false; btn.textContent = '↑ Aktualisieren'; }
    } else {
      if (badge) { badge.textContent = '✓ Aktuell'; badge.className = 'update-badge is-ok'; }
    }
  } catch (err) {
    console.error('[fetchServerVersion] Fehler:', err);
    if (versionEl) versionEl.textContent = 'v?';
    if (badge)     { badge.textContent = '—'; badge.className = 'update-badge is-error'; }
  }
}

async function triggerServerUpdate() {
  if (!confirm('Server-Update wirklich starten?')) return;

  const btn = document.getElementById('btn-update-server');
  if (btn) { btn.disabled = true; btn.textContent = 'Update läuft …'; }

  try {
    const res  = await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 202 && data.ok) {
      alert('Update gestartet. Du wirst jetzt abgemeldet.');
      try { await fetch('/logout', { method: 'POST' }); } catch (_) {}
      window.location.href = '/';
    } else {
      alert('Update fehlgeschlagen: ' + (data.message || 'Unbekannter Fehler'));
    }
  } catch (err) {
    console.error('[triggerServerUpdate] Fehler:', err);
    alert('Netzwerkfehler beim Update.');
  } finally {
    const b = document.getElementById('btn-update-server');
    if (b) { b.disabled = false; b.textContent = '↑ Aktualisieren'; }
  }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  fetchServerVersion();

  loadSidebar().then(() => {
    // Ersten Bereich automatisch auswählen
    if (sidebarRoots.length > 0) {
      currentPath = sidebarRoots[0].name;
      updateSidebarActive();
    }
    renderBreadcrumb();
    renderFileList();
  });

  const btn = document.getElementById('btn-update-server');
  if (btn) btn.addEventListener('click', triggerServerUpdate);

  // Preview Modal schließen
  document.getElementById('preview-close')
    ?.addEventListener('click', closePreviewModal);

  document.getElementById('preview-overlay')
    ?.addEventListener('click', e => {
      if (e.target === e.currentTarget) closePreviewModal();
    });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePreviewModal();
  });
});

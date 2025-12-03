// Verzeichnisse, die geladen werden sollen
const directories = ['snapshot', 'vorne', 'hinten']; // Liste der Verzeichnisse

// Funktion zum Laden der Verzeichnisse
function loadDirectories() {
    const directoryContainer = document.getElementById('directories');
    directoryContainer.innerHTML = ''; // Leere den Container, falls bereits Inhalte vorhanden sind

    directories.forEach((dir, index) => {
        const directoryElement = document.createElement('div');
        directoryElement.classList.add('directory');
        directoryElement.innerHTML = `
            <h2>${dir.charAt(0).toUpperCase() + dir.slice(1)}</h2>
            <div class="directory-files" id="${dir}-files-${index}">
                <p class="loading">Loading...</p>
            </div>
        `;
        directoryContainer.appendChild(directoryElement);

        loadDirectoryFiles(dir, `${dir}-files-${index}`);
    });
}

// Funktion zum Laden der Dateien eines Verzeichnisses
function loadDirectoryFiles(dir, elementId) {
    fetch(`/files/${dir}`)
        .then(response => response.json())
        .then(files => {
            const container = document.getElementById(elementId);
            container.innerHTML = ''; // Leere den Container

            // Erstelle eine Liste der Dateien
            const ul = document.createElement('ul');
            files.forEach(file => {
                const li = document.createElement('li');

                // Datei-Endung prüfen und entsprechendes data-file-type-Attribut setzen
                if (file.endsWith('.mp4')) {
                    li.setAttribute('data-file-type', 'video');
                } else if (file.endsWith('.jpg') || file.endsWith('.jpg')) {
                    li.setAttribute('data-file-type', 'image');
                }

                const link = document.createElement('a');
                link.href = `/files/${dir}/${file}`;
                link.textContent = file;
                li.appendChild(link);
                ul.appendChild(li);
            });

            container.appendChild(ul);
        })
        .catch(error => {
            document.getElementById(elementId).innerHTML = `<p>Fehler: ${error.message}</p>`;
        });
}


// Zurück-Button-Verhalten
document.addEventListener('click', function(event) {
    if (event.target.matches('.back-button')) {
        window.location.href = '/';
    }
});

// Initiales Laden der Verzeichnisse
document.addEventListener('DOMContentLoaded', loadDirectories);

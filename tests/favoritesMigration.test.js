const fs = require('fs');
const path = require('path');

const work = fs.mkdtempSync('/tmp/nvs-mig-');
const mediaDir = path.join(work, 'media');
const favDir = path.join(work, 'favs');
fs.mkdirSync(mediaDir);
fs.writeFileSync(path.join(mediaDir, 'alt.mp4'), 'video');
process.env.NVS_FAVORITES_FILE = path.join(work, 'favorites.json');
// Altformat: nur Verweise (eine Datei existiert noch, eine wurde schon gelöscht)
fs.writeFileSync(process.env.NVS_FAVORITES_FILE, JSON.stringify({ favorites: [
    { name: 'alt.mp4', path: 'M/alt.mp4' },
    { name: 'weg.mp4', path: 'M/weg.mp4' }
] }));

const request = require('supertest');
const bcrypt = require('bcrypt');
const config = require('../config');
config.favoritesDir = favDir;
config.users.migtester = bcrypt.hashSync('pw', 4);
const app = require('../server');

test('Alte Favoriten werden geschützt bzw. als fehlend markiert', async () => {
    const store = require('../pathsStore');
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
    store.setRoots([{ name: 'M', path: mediaDir }]);
    jest.restoreAllMocks();

    const agent = request.agent(app);
    await agent.post('/login').send({ username: 'migtester', password: 'pw' });

    const res = await agent.get('/api/favorites');
    const [a, b] = res.body.favorites;
    expect(a.legacy).toBe(false);
    expect(a.missing).toBe(false);
    expect(b.missing).toBe(true);
    expect(fs.existsSync(path.join(mediaDir, 'alt.mp4'))).toBe(false);
    expect((await agent.get('/api/file').query({ fav: a.id })).statusCode).toBe(200);

    // fehlenden Favoriten entfernen funktioniert
    const rem = await agent.post('/api/favorites/remove').send({ id: b.id });
    expect(rem.statusCode).toBe(200);

    delete config.users.migtester;
    fs.rmSync(work, { recursive: true, force: true });
});

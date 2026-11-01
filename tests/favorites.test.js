const fs = require('fs');
const path = require('path');

const work = fs.mkdtempSync('/tmp/nvs-fav-');
const mediaDir = path.join(work, 'media');
const favDir = path.join(work, 'favs');
fs.mkdirSync(mediaDir);
process.env.NVS_FAVORITES_FILE = path.join(work, 'favorites.json');

const request = require('supertest');
const config = require('../config');
config.favoritesDir = favDir;
const bcrypt = require('bcrypt');
config.users.favtester = bcrypt.hashSync('pw', 4);
const app = require('../server');

describe('Favoriten schützen Dateien', () => {
    let agent, store;

    beforeAll(async () => {
        // Root nur im Speicher setzen – paths.json auf der Platte bleibt unberührt
        store = require('../pathsStore');
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
        store.setRoots([{ name: 'M', path: mediaDir }]);
        jest.restoreAllMocks();

        agent = request.agent(app);
        await agent.post('/login').send({ username: 'favtester', password: 'pw' });
    });

    afterAll(() => {
        delete config.users.favtester;
        fs.rmSync(work, { recursive: true, force: true });
    });

    test('Markieren verschiebt die Datei, Entfernen stellt sie wieder her', async () => {
        const file = path.join(mediaDir, 'v.mp4');
        fs.writeFileSync(file, Buffer.alloc(500));

        const add = await agent.post('/api/favorites/add').send({ path: 'M/v.mp4' });
        expect(add.statusCode).toBe(200);
        const fav = add.body.favorites[0];
        expect(fs.existsSync(file)).toBe(false);
        expect(fs.readdirSync(favDir)).toHaveLength(1);

        // Vorschau/Streaming aus dem geschützten Ordner
        const play = await agent.get('/api/file').query({ fav: fav.id }).set('Range', 'bytes=0-9');
        expect(play.statusCode).toBe(206);
        expect(play.headers['content-type']).toMatch(/video\/mp4/);

        // doppeltes Hinzufügen
        const dup = await agent.post('/api/favorites/add').send({ path: 'M/v.mp4' });
        expect(dup.statusCode).toBe(409);

        const rem = await agent.post('/api/favorites/remove').send({ id: fav.id });
        expect(rem.statusCode).toBe(200);
        expect(rem.body.favorites).toHaveLength(0);
        expect(fs.existsSync(file)).toBe(true);
        expect(fs.readdirSync(favDir)).toHaveLength(0);
    });

    test('Zurückverschieben überschreibt keine neue Datei gleichen Namens', async () => {
        const file = path.join(mediaDir, 'dup.mp4');
        fs.writeFileSync(file, 'alt');
        const add = await agent.post('/api/favorites/add').send({ path: 'M/dup.mp4' });
        fs.writeFileSync(file, 'neu');
        await agent.post('/api/favorites/remove').send({ id: add.body.favorites[0].id });
        expect(fs.readFileSync(file, 'utf8')).toBe('neu');
        expect(fs.readFileSync(path.join(mediaDir, 'dup (Favorit).mp4'), 'utf8')).toBe('alt');
    });

    test('Pfade außerhalb der Roots und unbekannte IDs werden abgelehnt', async () => {
        expect((await agent.post('/api/favorites/add').send({ path: 'M/../../etc/passwd' })).statusCode).toBe(404);
        expect((await agent.post('/api/favorites/remove').send({ id: 'nope' })).statusCode).toBe(404);
        expect((await agent.get('/api/file').query({ fav: '../x' })).statusCode).toBe(404);
    });

    test('Ohne Login kein Zugriff', async () => {
        expect((await request(app).post('/api/favorites/add').send({ path: 'M/x' })).statusCode).toBe(401);
    });
});

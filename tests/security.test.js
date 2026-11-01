const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('../server');
const auth = require('../auth');
const config = require('../config');

describe('Security', () => {
    test('Login lehnt Prototype-Namen und Nicht-Strings ab, ohne 500', async () => {
        for (const body of [
            { username: 'constructor', password: 'x' },
            { username: '__proto__', password: 'x' },
            { username: 'nobody', password: 'x' }
        ]) {
            const res = await request(app).post('/login').send(body);
            expect(res.statusCode).toBe(401);
        }
        const res = await request(app).post('/login').send({ username: 'a', password: { $ne: 1 } });
        expect(res.statusCode).toBe(400);
    });

    test('Security-Header sind gesetzt, x-powered-by nicht', async () => {
        const res = await request(app).get('/');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('DENY');
        expect(res.headers['x-powered-by']).toBeUndefined();
    });

    test('Schreibende Requests mit fremdem Origin werden abgelehnt (CSRF)', async () => {
        const res = await request(app)
            .post('/logout')
            .set('Origin', 'https://evil.example')
            .send({});
        expect(res.statusCode).toBe(403);
    });

    test('x-expert-mode Header ohne Auth bleibt wirkungslos (401)', async () => {
        const res = await request(app)
            .post('/api/paths')
            .set('x-expert-mode', 'true')
            .send({ roots: [{ name: 'root', path: '/' }] });
        expect(res.statusCode).toBe(401);
    });
});

describe('Eingeloggt', () => {
    let agent;
    let dir;

    beforeAll(async () => {
        dir = fs.mkdtempSync(path.join('/tmp', 'nvs-'));
        fs.writeFileSync(path.join(dir, 'a.html'), '<script>alert(1)</script>');
        // /tmp ist erlaubte Basis; Root über die Schnittstelle setzen
        // Nur im Speicher setzen – paths.json auf der Platte bleibt unberührt
        const store = require('../pathsStore');
        jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
        jest.spyOn(fs, 'renameSync').mockImplementation(() => {});
        store.setRoots([{ name: 'T', path: dir }]);
        jest.restoreAllMocks();

        // Login-Middleware für den Test umgehen: gültige Session via Hash erzeugen
        const bcrypt = require('bcrypt');
        config.users.tester = bcrypt.hashSync('pw', 4);
        agent = request.agent(app);
        await agent.post('/login').send({ username: 'tester', password: 'pw' });
    });

    afterAll(() => {
        delete config.users.tester;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('Expert-Header erlaubt keine Roots außerhalb der erlaubten Basis', async () => {
        const res = await agent
            .post('/api/paths')
            .set('x-expert-mode', 'true')
            .send({ roots: [{ name: 'root', path: '/etc' }] });
        expect(res.statusCode).toBe(400);
    });

    test('PDFs werden für die Vorschau inline mit fester Content-Type geliefert', async () => {
        fs.writeFileSync(path.join(dir, 'a.pdf'), '%PDF-1.4');
        const res = await agent.get('/api/file').query({ path: 'T/a.pdf' });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/pdf/);
        expect(res.headers['content-disposition']).toBeUndefined();
    });

    test('/api/file liefert Dateien nur als Download mit nosniff + CSP-Sandbox', async () => {
        const res = await agent.get('/api/file').query({ path: 'T/a.html' });
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-disposition']).toMatch(/^attachment/);
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['content-security-policy']).toContain('sandbox');
    });

    test('Path-Traversal wird abgewiesen', async () => {
        const res = await agent.get('/api/file').query({ path: 'T/../../etc/passwd' });
        expect(res.statusCode).toBe(400);
    });
});

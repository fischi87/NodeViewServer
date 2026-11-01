const request = require('supertest');
const app = require('../server');

describe('Server API Integration', () => {
    // Bevor wir irgendwas testen, warten wir kurz, falls der Server Zeit braucht (hier meist nicht nötig, aber sicher ist gut)

    test('GET / sollte Login-Seite liefern', async () => {
        const res = await request(app).get('/');
        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Login'); // Annahme: "Login" steht im HTML
        expect(res.type).toBe('text/html');
    });

    test('GET /main.html ohne Auth sollte Redirect zu / machen (oder 401 je nach Implementierung)', async () => {
        // Da checkAuthentication bei fail res.redirect('/') macht:
        const res = await request(app).get('/main.html');
        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('/');
    });

    test('POST /api/paths ohne Auth sollte 401 liefern', async () => {
        const res = await request(app)
            .post('/api/paths')
            .send({ roots: [] });

        expect(res.statusCode).toBe(401);
    });

    test('Geräteerkennung und Handy-CSS werden ausgeliefert', async () => {
        for (const f of ['device.js', 'mobile.css']) {
            const res = await request(app).get('/' + f);
            expect(res.statusCode).toBe(200);
        }
    });

    test('GET /api/version ohne Auth sollte 401 liefern', async () => {
        const res = await request(app).get('/api/version');
        expect(res.statusCode).toBe(401);
    });
});

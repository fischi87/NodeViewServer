const fs = require('fs');
const os = require('os');
const path = require('path');
const FileStore = require('../sessionStore');

describe('FileStore', () => {
    let dir, store;
    const SID = 'abcdefghijklmnop1234567890';
    const call = (fn, ...a) => new Promise((res, rej) => fn.call(store, ...a, (e, v) => e ? rej(e) : res(v)));

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nvs-sess-'));
        store = new FileStore({ dir: path.join(dir, 's') });
    });
    afterEach(() => { clearInterval(store.timer); fs.rmSync(dir, { recursive: true, force: true }); });

    test('speichert, liest und löscht Sessions', async () => {
        await call(store.set, SID, { loggedIn: true, cookie: { expires: new Date(Date.now() + 60000) } });
        expect((await call(store.get, SID)).loggedIn).toBe(true);
        await call(store.destroy, SID);
        expect(await call(store.get, SID)).toBeNull();
    });

    test('abgelaufene Sessions werden nicht geliefert', async () => {
        await call(store.set, SID, { loggedIn: true, cookie: { expires: new Date(Date.now() - 1000) } });
        expect(await call(store.get, SID)).toBeNull();
    });

    test('ungültige Session-IDs (Path-Traversal) werden abgelehnt', async () => {
        expect(await call(store.get, '../../etc/passwd')).toBeNull();
        await expect(call(store.set, '../evil', { cookie: {} })).rejects.toThrow();
    });

    test('Session-Dateien haben Rechte 0600', async () => {
        await call(store.set, SID, { cookie: {} });
        const mode = fs.statSync(path.join(store.dir, SID + '.json')).mode & 0o777;
        expect(mode).toBe(0o600);
    });
});

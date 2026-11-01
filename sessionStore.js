// sessionStore.js
// Kleiner dateibasierter Session-Store: Sessions überleben Neustarts/Updates,
// ohne zusätzliche Abhängigkeit. Eine Datei pro Session (Rechte 0600).
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const SID_RE = /^[A-Za-z0-9_-]{16,128}$/;

class FileStore extends session.Store {
  constructor({ dir, ttlMs = 7 * 24 * 60 * 60 * 1000, cleanupMs = 60 * 60 * 1000 } = {}) {
    super();
    this.dir = dir;
    this.ttlMs = ttlMs;
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.cleanup();
    this.timer = setInterval(() => this.cleanup(), cleanupMs);
    this.timer.unref();
  }

  file(sid) {
    return SID_RE.test(sid) ? path.join(this.dir, sid + '.json') : null;
  }

  expiry(sess) {
    const exp = sess && sess.cookie && sess.cookie.expires;
    return exp ? new Date(exp).getTime() : Date.now() + this.ttlMs;
  }

  get(sid, cb) {
    const f = this.file(sid);
    if (!f) return cb(null, null);
    fs.readFile(f, 'utf8', (err, raw) => {
      if (err) return cb(err.code === 'ENOENT' ? null : err, null);
      try {
        const { expires, sess } = JSON.parse(raw);
        if (expires <= Date.now()) return this.destroy(sid, () => cb(null, null));
        cb(null, sess);
      } catch (e) {
        this.destroy(sid, () => cb(null, null));
      }
    });
  }

  set(sid, sess, cb = () => {}) {
    const f = this.file(sid);
    if (!f) return cb(new Error('Ungültige Session-ID'));
    const tmp = f + '.tmp';
    const data = JSON.stringify({ expires: this.expiry(sess), sess });
    fs.writeFile(tmp, data, { mode: 0o600 }, (err) => {
      if (err) return cb(err);
      fs.rename(tmp, f, cb);
    });
  }

  touch(sid, sess, cb = () => {}) {
    this.set(sid, sess, cb);
  }

  destroy(sid, cb = () => {}) {
    const f = this.file(sid);
    if (!f) return cb();
    fs.unlink(f, (err) => cb(err && err.code !== 'ENOENT' ? err : null));
  }

  cleanup() {
    let names;
    try { names = fs.readdirSync(this.dir); } catch (_) { return; }
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      const f = path.join(this.dir, n);
      try {
        const { expires } = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (expires <= Date.now()) fs.unlinkSync(f);
      } catch (_) {
        try { fs.unlinkSync(f); } catch (__) { /* ignore */ }
      }
    }
  }
}

module.exports = FileStore;

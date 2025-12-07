// auth.js
const bcrypt = require('bcrypt');
const config = require('./config');

// Middleware zur Authentifizierung
function checkAuthentication(req, res, next) {
  if (req.session.loggedIn) {
    next();
  } else {
    res.redirect('/');
  }
}

// Login-Logik mit Session-Regeneration (Fixation-Schutz)
async function login(req, res) {
  const { username, password } = req.body;
  const hashedPassword = config.users[username];

  if (!hashedPassword || !(await bcrypt.compare(password, hashedPassword))) {
    return res.status(401).json({ success: false, message: 'Ungültige Anmeldedaten' });
  }

  req.session.regenerate(err => {
    if (err) {
      console.error('[login] Session regenerate failed:', err);
      return res.status(500).send('Fehler beim Erstellen der Sitzung');
    }

    req.session.loggedIn = true;
    req.session.username = username;

    req.session.save(saveErr => {
      if (saveErr) {
        console.error('[login] Session save failed:', saveErr);
        return res.status(500).send('Fehler beim Speichern der Sitzung');
      }
      res.redirect('/main.html');
    });
  });
}

function requireAuthApi(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// Logout-Logik
function logout(req, res) {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Fehler beim Beenden der Sitzung');
    }
    res.redirect('/');
  });
}

module.exports = {
  checkAuthentication,
  login,
  logout,
  requireAuthApi
};

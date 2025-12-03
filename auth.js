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

// Login-Logik
async function login(req, res) {
    const { username, password } = req.body;
    const hashedPassword = config.users[username];

    if (hashedPassword && await bcrypt.compare(password, hashedPassword)) {
        req.session.loggedIn = true;
        res.redirect('/main.html');
    } else {
        res.status(401).json({ success: false, message: 'Ungültige Anmeldedaten' });
    }
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


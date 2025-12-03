// hashPassword.js
// Tool, um ein Passwort in einen Bcrypt-Hash zu verwandeln,
// ohne dass irgendwo ein Klartext-Passwort im Code steht.

const bcrypt = require('bcrypt');
const readline = require('readline');

async function createHash(password) {
    if (!password) {
        console.error('Kein Passwort übergeben.');
        process.exit(1);
    }
    try {
        const hash = await bcrypt.hash(password, 10);
        console.log('\nBcrypt-Hash:\n');
        console.log(hash);
        console.log('\nDiesen Hash kannst du z.B. in der .env eintragen (USER_<NAME>_HASH=...).\n');
        process.exit(0);
    } catch (err) {
        console.error('Fehler beim Hashen:', err);
        process.exit(1);
    }
}

const argPassword = process.argv[2];

if (argPassword) {
    // Variante: node hashPassword.js MeinPasswort123
    createHash(argPassword);
} else {
    // Variante: interaktive Eingabe
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('Passwort, das gehasht werden soll: ', async (pw) => {
        rl.close();
        await createHash(pw);
    });
}

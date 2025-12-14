const pathsStore = require('../pathsStore');
const path = require('path');

// Wir mocken fs, damit wir keine echten Dateien brauchen
jest.mock('fs', () => ({
    statSync: jest.fn((p) => {
        if (p.includes('nicht_existent')) {
            throw new Error('Datei nicht gefunden');
        }
        return {
            isDirectory: () => !p.includes('kein_ordner')
        };
    }),
    existsSync: jest.fn(() => true),
    readFileSync: jest.fn(() => JSON.stringify({ roots: [] })),
    writeFileSync: jest.fn()
}));

// Mock config
jest.mock('../config', () => ({
    directories: {
        'Home': '/Users/axel/test_home'
    },
    // Wir simulieren, dass /Users/axel/test_home erlaubt ist
    allowedBasePaths: ['/Users/axel/test_home']
}));

describe('pathsStore', () => {
    const ALLOWED_BASE = path.resolve('/Users/axel/test_home');

    describe('isUnderAllowedBase', () => {
        test('sollte true zurückgeben für Pfade innerhalb der Base', () => {
            const p = path.join(ALLOWED_BASE, 'subfolder');
            expect(pathsStore.isUnderAllowedBase(p)).toBe(true);
        });

        test('sollte true zurückgeben für die Base selbst', () => {
            expect(pathsStore.isUnderAllowedBase(ALLOWED_BASE)).toBe(true);
        });

        test('sollte false zurückgeben für Pfade außerhalb', () => {
            expect(pathsStore.isUnderAllowedBase('/etc/passwd')).toBe(false);
            expect(pathsStore.isUnderAllowedBase('/Users/axel/other')).toBe(false);
        });

        test('sollte false zurückgeben für parent traversal', () => {
            const p = path.join(ALLOWED_BASE, '..');
            expect(pathsStore.isUnderAllowedBase(p)).toBe(false);
        });
    });

    describe('validateRootsInput', () => {
        test('sollte ungültige Eingaben filtern (kein String)', () => {
            const input = [{ name: 123, path: '/tmp' }];
            const result = pathsStore.validateRootsInput(input);
            expect(result.errors).toHaveLength(1);
            expect(result.cleaned).toHaveLength(0);
        });

        test('sollte Pfade außerhalb der Base ablehnen (ohne ExpertMode)', () => {
            const input = [{ name: 'Test', path: '/etc' }];
            const result = pathsStore.validateRootsInput(input, { allowDangerous: false });
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].reason).toMatch(/nicht unter einem erlaubten Basisverzeichnis/);
        });

        test('sollte Pfade außerhalb der Base erlauben (mit ExpertMode)', () => {
            // Mock fs.statSync to allow this specific "outside" path for this test
            const fs = require('fs');
            fs.statSync.mockImplementationOnce(() => ({ isDirectory: () => true }));

            const input = [{ name: 'Root', path: '/etc' }];
            const result = pathsStore.validateRootsInput(input, { allowDangerous: true });
            expect(result.cleaned).toHaveLength(1);
            expect(result.cleaned[0].path).toBe('/etc');
        });

        test('sollte nicht existierende Pfade ablehnen', () => {
            const input = [{ name: 'Ghost', path: path.join(ALLOWED_BASE, 'nicht_existent') }];
            const result = pathsStore.validateRootsInput(input);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].reason).toContain('nicht oder ist nicht lesbar');
        });

        test('sollte Dateien (keine Ordner) ablehnen', () => {
            const input = [{ name: 'File', path: path.join(ALLOWED_BASE, 'kein_ordner') }];
            const result = pathsStore.validateRootsInput(input);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].reason).toContain('kein Verzeichnis');
        });
    });
});

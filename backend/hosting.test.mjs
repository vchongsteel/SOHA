import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './test-database.mjs';
test('hosting HTTPS, cookies seguras, origen restringido e interfaz sin exponer la API', async () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'soha-hosting-')), db = join(carpeta, 'test.sqlite');
    let server;
    const old = { NODE_ENV: process.env.NODE_ENV, APP_URL: process.env.APP_URL, STATIC_DIR: process.env.STATIC_DIR };
    const iniciar = async () => { server = (await createApp(db)); server.listen(0, '127.0.0.1'); await once(server, 'listening'); return `http://127.0.0.1:${server.address().port}`; };
    try {
        let base = await iniciar();
        await fetch(base + '/api/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario: 'admin', nombre: 'Prueba', password: 'Prueba88' }) });
        await new Promise(r => server.close(r));
        writeFileSync(join(carpeta, 'index.html'), '<!doctype html><title>SOHA</title>');
        writeFileSync(join(carpeta, 'main-1234.js'), 'console.log(1)');
        process.env.NODE_ENV = 'production';
        process.env.APP_URL = 'https://soha.example';
        process.env.STATIC_DIR = carpeta;
        base = await iniciar();
        let r = await fetch(base + '/personal');
        assert.equal(r.status, 200);
        assert.match(r.headers.get('content-type'), /text\/html/);
        r = await fetch(base + '/main-1234.js');
        assert.match(r.headers.get('cache-control'), /immutable/);
        assert.equal((await fetch(base + '/perdido.png')).status, 404);
        assert.equal((await fetch(base + '/api/colaboradores')).status, 401);
        assert.equal((await fetch(base + '/api/health')).status, 200);
        assert.equal((await fetch(base + '/api/auth/setup', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://soha.example' }, body: '{}' })).status, 403);
        const login = { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://otro.example' }, body: JSON.stringify({ usuario: 'admin', password: 'Prueba88' }) };
        assert.equal((await fetch(base + '/api/auth/login', login)).status, 403);
        login.headers.Origin = 'https://soha.example';
        r = await fetch(base + '/api/auth/login', login);
        assert.equal(r.status, 200);
        assert.match(r.headers.get('set-cookie'), /Secure/);
        assert.match(r.headers.get('set-cookie'), /HttpOnly/);
    }
    finally {
        if (server?.listening)
            await new Promise(r => server.close(r));
        for (const [key, value] of Object.entries(old)) {
            if (value === undefined)
                delete process.env[key];
            else
                process.env[key] = value;
        }
        rmSync(carpeta, { recursive: true, force: true });
    }
});

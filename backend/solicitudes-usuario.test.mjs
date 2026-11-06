import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './test-database.mjs';
test('registro público queda pendiente, no permite elegir permisos y solo el administrador aprueba', async () => {
    const server = (await createApp(':memory:'));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let cookie = '';
    const r = async (method, path, data) => { const res = await fetch(`http://127.0.0.1:${server.address().port}` + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: data === undefined ? undefined : JSON.stringify(data) }); return { status: res.status, b: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] }; };
    try {
        const admin = (await r('POST', '/api/auth/setup', { nombre: 'Admin', usuario: 'admin', password: 'Prueba88' })).cookie;
        const datos = { nombre: 'Solicitante de prueba', usuario: 'nuevo', password: 'Prueba88' };
        assert.equal((await r('POST', '/api/auth/registro', { ...datos, rol: 'Administrador' })).status, 400);
        assert.equal((await r('POST', '/api/auth/registro', { ...datos, password: '1234567' })).status, 400);
        const solicitud = await r('POST', '/api/auth/registro', datos);
        assert.equal(solicitud.status, 201);
        assert.equal(solicitud.b.estado, 'Pendiente');
        assert.equal(solicitud.cookie, undefined);
        assert.equal((await r('POST', '/api/auth/login', { usuario: 'nuevo', password: 'Prueba88' })).status, 401);
        assert.equal((await r('POST', '/api/auth/registro', { ...datos, usuario: 'NUEVO' })).status, 409);
        assert.equal((await r('GET', '/api/solicitudes-usuario')).status, 401);
        cookie = admin;
        let lista = (await r('GET', '/api/solicitudes-usuario')).b;
        assert.equal(lista.length, 1);
        assert.equal(lista[0].clave, undefined);
        const id = lista[0].id;
        await r('POST', '/api/usuarios', { nombre: 'Consulta', usuario: 'consulta', password: 'Prueba88', rol: 'Consulta', activo: 1 });
        cookie = (await r('POST', '/api/auth/login', { usuario: 'consulta', password: 'Prueba88' })).cookie;
        assert.equal((await r('POST', '/api/solicitudes-usuario/' + id + '/aprobar', { rol: 'Administrador' })).status, 403);
        cookie = admin;
        const aprobado = await r('POST', '/api/solicitudes-usuario/' + id + '/aprobar', { rol: 'Registro' });
        assert.equal(aprobado.status, 200);
        assert.equal(aprobado.b.rol, 'Registro');
        assert.equal(aprobado.b.clave, undefined);
        assert.equal((await r('POST', '/api/solicitudes-usuario/' + id + '/aprobar', {})).status, 409);
        const login = await r('POST', '/api/auth/login', { usuario: 'nuevo', password: 'Prueba88' });
        assert.equal(login.status, 200);
        assert.equal(login.b.usuario.rol, 'Registro');
        cookie = '';
        await r('POST', '/api/auth/registro', { ...datos, usuario: 'rechazado' });
        cookie = admin;
        lista = (await r('GET', '/api/solicitudes-usuario')).b;
        await r('POST', '/api/solicitudes-usuario/' + lista[0].id + '/rechazar', {});
        assert.equal((await r('POST', '/api/auth/login', { usuario: 'rechazado', password: 'Prueba88' })).status, 401);
    }
    finally {
        await new Promise(r => server.close(r));
    }
});

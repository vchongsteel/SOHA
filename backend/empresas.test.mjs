import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from './test-database.mjs';
test('inventario por empresa diferencia falta de saldo, traslado y cero confirmado', async () => {
    const server = (await createApp(':memory:'));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let cookie = '';
    const request = async (method, path, data) => { const r = await fetch(`http://127.0.0.1:${server.address().port}` + path, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: data === undefined ? undefined : JSON.stringify(data) }); return { status: r.status, b: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] }; };
    try {
        cookie = (await request('POST', '/api/auth/setup', { usuario: 'admin', nombre: 'Admin', password: 'Prueba88' })).cookie;
        const empresas = (await request('GET', '/api/inventario-empresas')).b;
        assert.deepEqual(empresas.map(e => e.empresa).sort(), ['IEM', 'STEEL']);
        const datos = { codigo: 'EPP1', descripcion: 'Guante', variante: 'M', unidad: 'Por definir', minimo: 0, activo: 1, proveedores: [] };
        let articulo = (await request('POST', '/api/articulos', datos)).b;
        const movimiento = { solicitud: 'inicial', tipo: 'SALDO_INICIAL', fecha: '2026-01-01', articulo_id: articulo.id, destino_id: 'inventario-STEEL', cantidad: 10, motivo: 'Conteo verificado de prueba' };
        assert.equal((await request('POST', '/api/movimientos', movimiento)).status, 400);
        let saldos = (await request('GET', '/api/existencias-empresa')).b;
        assert.equal(saldos.length, 2);
        assert.ok(saldos.every(s => s.registros === 0));
        articulo = (await request('PUT', '/api/articulos/' + articulo.id, { ...datos, unidad: 'Par', version: articulo.version })).b;
        assert.equal((await request('POST', '/api/movimientos', movimiento)).status, 201);
        assert.equal((await request('POST', '/api/movimientos', { ...movimiento, solicitud: 'traslado', tipo: 'TRASLADO', origen_id: 'inventario-STEEL', destino_id: 'inventario-IEM', cantidad: 10 })).status, 201);
        saldos = (await request('GET', '/api/existencias-empresa')).b;
        assert.equal(saldos.find(s => s.empresa === 'STEEL').cantidad, 0);
        assert.ok(saldos.find(s => s.empresa === 'STEEL').registros > 0);
        assert.equal(saldos.find(s => s.empresa === 'IEM').cantidad, 10);
        assert.equal((await request('PUT', '/api/articulos/' + articulo.id, { ...datos, unidad: 'Caja', version: articulo.version })).status, 409);
        assert.equal((await request('GET', '/api/existencias-empresa?fecha=2026-02-30')).status, 400);
    }
    finally {
        await new Promise(r => server.close(r));
    }
});

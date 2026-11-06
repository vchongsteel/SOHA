import { configurarSolicitudes } from './solicitudes-usuario.mjs';
import { servirInterfaz } from './interfaz.mjs';
import { configurarCapacitaciones } from './capacitaciones.mjs';
import { createServer } from 'node:http';
import { openDatabase } from './database.mjs';
import { readFileSync } from 'node:fs';
import { migrarSqlite } from './migrar-postgresql.mjs';
import { respaldarPostgresql } from './respaldo-postgresql.mjs';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const hashToken = token => createHash('sha256').update(token).digest('hex');
const roles = ['Administrador', 'Registro', 'Consulta'];
const fail = (status, message, code) => { throw Object.assign(new Error(message), { status, code }); };
function text(value, label, max = 120, optional = false) {
    if (optional && (value == null || value === ''))
        return '';
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
        fail(400, `Revisá ${label}.`);
    return value.trim();
}
function option(value, allowed, label) { if (!allowed.includes(value))
    fail(400, `Seleccioná ${label}.`); return value; }
function integer(value, label, min = 0) { if (!Number.isSafeInteger(value) || value < min || value > 100000000)
    fail(400, `Revisá ${label}: debe ser un número entero válido.`); return value; }
function passwordHash(password) {
    if (typeof password !== 'string' || password.length < 8 || password.length > 128)
        fail(400, 'La contraseña debe tener entre 8 y 128 caracteres.');
    const salt = randomBytes(16).toString('hex');
    return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
function passwordMatches(password, stored) {
    if (typeof password !== 'string' || password.length > 128)
        return false;
    const [salt, hash] = stored.split(':');
    return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}
export async function createApp(dbPath) {
    const produccion = process.env.NODE_ENV === 'production';
    const origenConfigurado = process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '');
    const origenPublico = origenConfigurado ? new URL(origenConfigurado).origin : null;
    if (produccion && (!origenPublico || !origenPublico.startsWith('https://')))
        throw Error('Configurá APP_URL con el dominio HTTPS del sistema.');
    const cookieSegura = produccion ? '; Secure' : '';
    const db = await openDatabase(dbPath);
    if (db.dialect === 'postgresql') {
        await db.exec(readFileSync(new URL('./postgresql.sql', import.meta.url), 'utf8'));
        if (process.env.MIGRATE_FROM_SQLITE)
            await migrarSqlite(db, process.env.MIGRATE_FROM_SQLITE);
    }
    else {
        (await db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS proyectos (id TEXT PRIMARY KEY,codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,nombre TEXT NOT NULL,empresa TEXT NOT NULL CHECK(empresa IN ('STEEL','IEM')),activo INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS colaboradores (id TEXT PRIMARY KEY,codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,nombre TEXT NOT NULL,puesto TEXT NOT NULL,area TEXT NOT NULL,estado TEXT NOT NULL CHECK(estado IN ('Activo','Inactivo')),creado TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS usuarios (id TEXT PRIMARY KEY,usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,nombre TEXT NOT NULL,rol TEXT NOT NULL CHECK(rol IN ('Administrador','Registro','Consulta')),activo INTEGER NOT NULL DEFAULT 1,clave TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sesiones (token TEXT PRIMARY KEY,usuario_id TEXT NOT NULL REFERENCES usuarios(id),vence INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS proveedores (id TEXT PRIMARY KEY,codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,nombre TEXT NOT NULL,contacto TEXT NOT NULL DEFAULT '',activo INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS articulos (id TEXT PRIMARY KEY,codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,descripcion TEXT NOT NULL,variante TEXT NOT NULL DEFAULT '',unidad TEXT NOT NULL DEFAULT 'Unidad',ficha_url TEXT NOT NULL DEFAULT '',minimo INTEGER NOT NULL DEFAULT 0,activo INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS articulo_proveedor (articulo_id TEXT NOT NULL REFERENCES articulos(id),proveedor_id TEXT NOT NULL REFERENCES proveedores(id),codigo_proveedor TEXT NOT NULL DEFAULT '',PRIMARY KEY(articulo_id,proveedor_id));
    CREATE TABLE IF NOT EXISTS ubicaciones (id TEXT PRIMARY KEY,codigo TEXT NOT NULL UNIQUE COLLATE NOCASE,nombre TEXT NOT NULL,tipo TEXT NOT NULL CHECK(tipo IN ('Bodega','Proyecto')),empresa TEXT NOT NULL CHECK(empresa IN ('STEEL','IEM')),proyecto_id TEXT REFERENCES proyectos(id),activo INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS saldos (articulo_id TEXT NOT NULL REFERENCES articulos(id),ubicacion_id TEXT NOT NULL REFERENCES ubicaciones(id),cantidad INTEGER NOT NULL CHECK(cantidad>=0),PRIMARY KEY(articulo_id,ubicacion_id));
    CREATE TABLE IF NOT EXISTS movimientos (id TEXT PRIMARY KEY,solicitud TEXT NOT NULL UNIQUE,contenido TEXT NOT NULL,tipo TEXT NOT NULL,articulo_id TEXT NOT NULL REFERENCES articulos(id),origen_id TEXT REFERENCES ubicaciones(id),destino_id TEXT REFERENCES ubicaciones(id),cantidad INTEGER NOT NULL,fecha TEXT NOT NULL,motivo TEXT NOT NULL,usuario_id TEXT NOT NULL REFERENCES usuarios(id),creado TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE TABLE IF NOT EXISTS lineas_movimiento (movimiento_id TEXT NOT NULL REFERENCES movimientos(id),articulo_id TEXT NOT NULL REFERENCES articulos(id),ubicacion_id TEXT NOT NULL REFERENCES ubicaciones(id),delta INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS lineas_saldo ON lineas_movimiento(articulo_id,ubicacion_id);
    CREATE TABLE IF NOT EXISTS auditoria (id TEXT PRIMARY KEY,fecha TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),usuario_id TEXT,accion TEXT NOT NULL,entidad TEXT NOT NULL,registro_id TEXT NOT NULL);
  `));
    }
    const column = async (table, name, sql) => { if (!(await db.columns(table)).some(col => col.name === name))
        (await db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${sql}`)); };
    (await column('colaboradores', 'empresa', "TEXT CHECK(empresa IN ('STEEL','IEM'))"));
    (await column('colaboradores', 'proyecto_id', 'TEXT REFERENCES proyectos(id)'));
    const all = async (sql, ...params) => (await db.all(sql, ...params));
    const one = async (sql, ...params) => (await db.one(sql, ...params));
    const run = async (sql, ...params) => (await db.run(sql, ...params));
    const tx = fn => db.transaction(fn);
    const audit = async (user, accion, entidad, id) => (await run('INSERT INTO auditoria(id,usuario_id,accion,entidad,registro_id) VALUES(?,?,?,?,?)', randomUUID(), user?.id || null, accion, entidad, id));
    const userView = user => ({ id: user.id, usuario: user.usuario, nombre: user.nombre, rol: user.rol, activo: user.activo, version: user.version });
    const failures = new Map();
    const reference = async (table, id, label, active = true) => {
        const row = (await one(`SELECT * FROM ${table} WHERE id=?`, id));
        if (!row || (active && !row.activo))
            fail(400, `${label} no existe o está inactivo.`);
        return row;
    };
    const masters = { proyectos: ['codigo', 'nombre', 'empresa', 'activo'], proveedores: ['codigo', 'nombre', 'contacto', 'activo'], articulos: ['codigo', 'descripcion', 'variante', 'unidad', 'ficha_url', 'minimo', 'activo'], ubicaciones: ['codigo', 'nombre', 'tipo', 'empresa', 'proyecto_id', 'activo'] };
    for (const empresa of ['STEEL', 'IEM'])
        (await run("INSERT OR IGNORE INTO ubicaciones(id,codigo,nombre,tipo,empresa) VALUES(?,?,?,'Bodega',?)", 'inventario-' + empresa, 'INV-EMP-' + empresa, empresa, empresa));
    const listArticles = async () => Promise.all((await all('SELECT * FROM articulos ORDER BY descripcion,codigo')).map(async (a) => ({ ...a, proveedores: await all('SELECT ap.proveedor_id,ap.codigo_proveedor,p.nombre,p.activo FROM articulo_proveedor ap JOIN proveedores p ON p.id=ap.proveedor_id WHERE ap.articulo_id=?', a.id) })));
    const personSql = 'SELECT c.*,p.nombre AS proyecto_nombre FROM colaboradores c LEFT JOIN proyectos p ON p.id=c.proyecto_id';
    const stockSql = `SELECT a.id AS articulo_id,a.codigo,a.descripcion,a.variante,a.unidad,a.minimo,a.activo AS articulo_activo,u.id AS ubicacion_id,u.nombre AS ubicacion,u.empresa,u.activo AS ubicacion_activa,COALESCE(SUM(l.delta),0) AS cantidad FROM articulos a CROSS JOIN ubicaciones u LEFT JOIN (SELECT lm.* FROM lineas_movimiento lm JOIN movimientos m ON m.id=lm.movimiento_id WHERE m.fecha<=?) l ON l.articulo_id=a.id AND l.ubicacion_id=u.id GROUP BY a.id,u.id ORDER BY a.descripcion,u.nombre`;
    const movementsSql = `SELECT m.id,m.solicitud,m.tipo,m.fecha,m.creado,m.cantidad,m.motivo,a.codigo,a.descripcion,a.variante,o.nombre AS origen,d.nombre AS destino,u.nombre AS responsable FROM movimientos m JOIN articulos a ON a.id=m.articulo_id LEFT JOIN ubicaciones o ON o.id=m.origen_id LEFT JOIN ubicaciones d ON d.id=m.destino_id JOIN usuarios u ON u.id=m.usuario_id ORDER BY m.creado DESC,m.rowid DESC`;
    const rutasCapacitaciones = (await configurarCapacitaciones(db));
    const rutasSolicitudes = (await configurarSolicitudes(db));
    if (produccion && db.dialect === 'postgresql') await respaldarPostgresql(db, true);
    const server = createServer(async (req, res) => {
        const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
        try {
            const url = new URL(req.url, 'http://localhost');
            const path = url.pathname;
            if (!path.startsWith('/api/')) {
                if (await servirInterfaz(req, res, process.env.STATIC_DIR))
                    return;
                return send(404, { message: 'Ruta no encontrada.' });
            }
            const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
            if (write) {
                if (req.headers['sec-fetch-site'] === 'cross-site')
                    fail(403, 'Origen no permitido.');
                if (req.headers.origin) {
                    const origin = new URL(req.headers.origin);
                    if (produccion ? origin.origin !== origenPublico : !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
                        fail(403, 'Origen no permitido.');
                }
            }
            if (req.method === 'GET' && path === '/api/health') {
                await db.one('SELECT 1 AS ok');
                return send(200, { ok: true, database: db.dialect });
            }
            const cookie = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('so_session='))?.slice(11);
            const user = cookie ? (await one('SELECT u.* FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token=? AND s.vence>? AND u.activo=1', hashToken(cookie), Date.now())) : null;
            if (req.method === 'GET' && path === '/api/auth/session')
                return send(200, { usuario: user ? userView(user) : null, requiereConfiguracion: !(await one('SELECT id FROM usuarios LIMIT 1')) });
            let input = {};
            if (write) {
                if (!req.headers['content-type']?.startsWith('application/json'))
                    fail(415, 'Se requiere JSON.');
                let size = 0;
                const chunks = [];
                for await (const chunk of req) {
                    size += chunk.length;
                    if (size > 1048576)
                        fail(413, 'La solicitud es demasiado grande.');
                    chunks.push(chunk);
                }
                try {
                    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                }
                catch {
                    fail(400, 'El contenido JSON no es válido.');
                }
                if (!input || typeof input !== 'object' || Array.isArray(input))
                    fail(400, 'Datos inválidos.');
            }
            const startSession = async (current) => {
                const token = randomBytes(32).toString('hex');
                (await run('DELETE FROM sesiones WHERE vence<=?', Date.now()));
                (await run('INSERT INTO sesiones VALUES(?,?,?)', hashToken(token), current.id, Date.now() + 8 * 60 * 60 * 1000));
                res.setHeader('Set-Cookie', `so_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${cookieSegura}`);
                return userView(current);
            };
            if (req.method === 'POST' && path === '/api/auth/setup') {
                if (produccion)
                    fail(403, 'El administrador inicial debe configurarse antes de publicar el sistema.');
                const nombre = text(input.nombre, 'el nombre');
                const username = text(input.usuario, 'el usuario', 60).toLowerCase();
                const clave = passwordHash(input.password);
                const id = (await tx(async () => { if ((await one('SELECT id FROM usuarios LIMIT 1')))
                    fail(409, 'El administrador inicial ya fue creado.'); const id = randomUUID(); (await run('INSERT INTO usuarios(id,usuario,nombre,rol,clave) VALUES(?,?,?,?,?)', id, username, nombre, 'Administrador', clave)); (await audit({ id }, 'CREAR', 'usuarios', id)); return id; }));
                return send(201, { usuario: (await startSession((await one('SELECT * FROM usuarios WHERE id=?', id)))) });
            }
            if (req.method === 'POST' && path === '/api/auth/login') {
                const key = req.socket.remoteAddress || 'local';
                const now = Date.now();
                const attempt = failures.get(key);
                if (attempt && attempt.until > now && attempt.count >= 8)
                    fail(429, 'Demasiados intentos. Esperá unos minutos.');
                const found = (await one('SELECT * FROM usuarios WHERE usuario=? COLLATE NOCASE', text(input.usuario, 'el usuario', 60)));
                if (!found || !passwordMatches(input.password, found.clave) || !found.activo) {
                    failures.set(key, { count: attempt && attempt.until > now ? attempt.count + 1 : 1, until: now + 5 * 60000 });
                    fail(401, 'Usuario o contraseña incorrectos.');
                }
                failures.delete(key);
                (await audit(found, 'INGRESAR', 'usuarios', found.id));
                return send(200, { usuario: (await startSession(found)) });
            }
            if ((await rutasSolicitudes({ path, method: req.method, input, user, send, text, fail, tx, audit, passwordHash, userView })))
                return;
            if (!user)
                fail(401, 'Iniciá sesión para continuar.');
            if (req.method === 'POST' && path === '/api/auth/logout') {
                (await run('DELETE FROM sesiones WHERE token=?', hashToken(cookie)));
                res.setHeader('Set-Cookie', `so_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSegura}`);
                return send(200, { ok: true });
            }
            if ((await rutasCapacitaciones({ path, method: req.method, input, user, url, send, tx, audit, text, fail })))
                return;
            if (write && user.rol === 'Consulta')
                fail(403, 'Tu usuario tiene permiso de consulta; no puede registrar cambios.');
            const admin = () => { if (user.rol !== 'Administrador')
                fail(403, 'Esta operación requiere un administrador.'); };
            if (path === '/api/usuarios' || path.startsWith('/api/usuarios/')) {
                admin();
                if (req.method === 'GET')
                    return send(200, (await all('SELECT id,usuario,nombre,rol,activo,version FROM usuarios ORDER BY nombre')));
                const id = path.split('/')[3];
                const old = id ? (await one('SELECT * FROM usuarios WHERE id=?', id)) : null;
                if (req.method !== 'POST' && req.method !== 'PUT')
                    fail(405, 'Método no permitido.');
                if (req.method === 'PUT' && !old)
                    fail(404, 'Usuario no encontrado.');
                const values = { usuario: text(input.usuario, 'el usuario', 60).toLowerCase(), nombre: text(input.nombre, 'el nombre'), rol: option(input.rol, roles, 'el rol'), activo: integer(input.activo, 'el estado', 0) };
                if (values.activo > 1)
                    fail(400, 'Estado inválido.');
                if (old?.id === user.id && (!values.activo || values.rol !== 'Administrador'))
                    fail(400, 'No podés quitar tu propio acceso de administrador.');
                const clave = input.password ? passwordHash(input.password) : old?.clave;
                if (!clave)
                    fail(400, 'Ingresá una contraseña de al menos 8 caracteres.');
                const saved = (await tx(async () => {
                    if (old) {
                        if (input.version !== old.version)
                            fail(409, 'El usuario cambió; actualizá la lista.');
                        (await run('UPDATE usuarios SET usuario=?,nombre=?,rol=?,activo=?,clave=?,version=version+1 WHERE id=?', values.usuario, values.nombre, values.rol, values.activo, clave, id));
                        (await run('DELETE FROM sesiones WHERE usuario_id=?', id));
                    }
                    else {
                        values.id = randomUUID();
                        (await run('INSERT INTO usuarios(id,usuario,nombre,rol,activo,clave) VALUES(?,?,?,?,?,?)', values.id, values.usuario, values.nombre, values.rol, values.activo, clave));
                    }
                    const key = id || values.id;
                    (await audit(user, old ? 'EDITAR' : 'CREAR', 'usuarios', key));
                    return userView((await one('SELECT * FROM usuarios WHERE id=?', key)));
                }));
                return send(old ? 200 : 201, saved);
            }
            if (req.method === 'GET' && path === '/api/auditoria') {
                admin();
                return send(200, (await all('SELECT a.*,u.nombre AS responsable FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id ORDER BY a.fecha DESC,a.rowid DESC LIMIT 500')));
            }
            if (req.method === 'GET' && path === '/api/resumen')
                return send(200, { personal: (await one('SELECT count(*) AS n FROM colaboradores')).n, activos: (await one("SELECT count(*) AS n FROM colaboradores WHERE estado='Activo'")).n, articulos: (await one('SELECT count(*) AS n FROM articulos WHERE activo=1')).n, capacitaciones: (await one('SELECT count(*) AS n FROM catalogo_capacitaciones WHERE activo=1')).n, movimientos: (await one('SELECT count(*) AS n FROM movimientos')).n });
            const personMatch = path.match(/^\/api\/colaboradores(?:\/([\w-]+))?$/);
            if (personMatch) {
                const id = personMatch[1];
                const old = id ? (await one('SELECT * FROM colaboradores WHERE id=?', id)) : null;
                if (req.method === 'GET') {
                    if (id && !old)
                        fail(404, 'No encontramos este colaborador.');
                    return send(200, id ? (await one(personSql + ' WHERE c.id=?', id)) : (await all(personSql + ' ORDER BY c.creado DESC')));
                }
                if (!['POST', 'PUT'].includes(req.method))
                    fail(405, 'Método no permitido.');
                if (req.method === 'PUT' && !old)
                    fail(404, 'Colaborador no encontrado.');
                const codigo = text(input.codigo, 'el código', 40).toUpperCase(), nombre = text(input.nombre, 'el nombre'), puesto = text(input.puesto, 'el puesto', 80), area = text(input.area, 'el área', 80);
                const empresa = option(input.empresa, ['STEEL', 'IEM'], 'STEEL o IEM'), estado = option(input.estado, ['Activo', 'Inactivo'], 'el estado');
                const proyecto = input.proyecto_id || null;
                if (proyecto) {
                    const p = (await reference('proyectos', proyecto, 'El proyecto', !old || old.proyecto_id !== proyecto));
                    if (p.empresa !== empresa)
                        fail(400, 'El proyecto debe pertenecer a la misma empresa del trabajador.');
                }
                const saved = (await tx(async () => {
                    let key = id;
                    if (old) {
                        integer(input.version, 'la versión', 1);
                        const result = (await run('UPDATE colaboradores SET codigo=?,nombre=?,puesto=?,area=?,estado=?,empresa=?,proyecto_id=?,version=version+1 WHERE id=? AND version=?', codigo, nombre, puesto, area, estado, empresa, proyecto, id, input.version));
                        if (!result.changes)
                            fail(409, 'El registro cambió en otra ventana. Actualizá la lista.');
                    }
                    else {
                        key = randomUUID();
                        (await run('INSERT INTO colaboradores(id,codigo,nombre,puesto,area,estado,empresa,proyecto_id) VALUES(?,?,?,?,?,?,?,?)', key, codigo, nombre, puesto, area, estado, empresa, proyecto));
                    }
                    (await audit(user, old ? 'EDITAR' : 'CREAR', 'colaboradores', key));
                    return (await one(personSql + ' WHERE c.id=?', key));
                }));
                return send(old ? 200 : 201, saved);
            }
            const masterMatch = path.match(/^\/api\/(proyectos|proveedores|articulos|ubicaciones)(?:\/([\w-]+))?$/);
            if (masterMatch) {
                const [, table, id] = masterMatch, fields = masters[table];
                const old = id ? (await one(`SELECT * FROM ${table} WHERE id=?`, id)) : null;
                if (req.method === 'GET')
                    return send(200, table === 'articulos' ? (await listArticles()) : (await all(`SELECT * FROM ${table} ORDER BY nombre,codigo`)));
                if (!['POST', 'PUT'].includes(req.method))
                    fail(405, 'Método no permitido.');
                if (req.method === 'PUT' && !old)
                    fail(404, 'Registro no encontrado.');
                const clean = { codigo: text(input.codigo, 'el código', 40).toUpperCase(), activo: integer(input.activo, 'el estado') };
                if (clean.activo > 1)
                    fail(400, 'Estado inválido.');
                if (table !== 'articulos')
                    clean.nombre = text(input.nombre, 'el nombre');
                if (['proyectos', 'ubicaciones'].includes(table))
                    clean.empresa = option(input.empresa, ['STEEL', 'IEM'], 'la empresa');
                if (table === 'proveedores')
                    clean.contacto = text(input.contacto, 'el contacto', 200, true);
                if (table === 'ubicaciones') {
                    clean.tipo = option(input.tipo, ['Bodega', 'Proyecto'], 'el tipo');
                    clean.proyecto_id = input.proyecto_id || null;
                    if (clean.tipo === 'Proyecto' && !clean.proyecto_id)
                        fail(400, 'Seleccioná el proyecto de esta ubicación.');
                    if (clean.proyecto_id) {
                        const p = (await reference('proyectos', clean.proyecto_id, 'El proyecto', !old || old.proyecto_id !== clean.proyecto_id));
                        if (p.empresa !== clean.empresa)
                            fail(400, 'La ubicación y el proyecto deben pertenecer a la misma empresa.');
                    }
                }
                if (table === 'articulos') {
                    clean.descripcion = text(input.descripcion, 'la descripción', 1000);
                    clean.variante = text(input.variante, 'la talla o variante', 80, true);
                    clean.unidad = text(input.unidad, 'la unidad', 30);
                    if (old && old.unidad !== clean.unidad && (await one('SELECT id FROM movimientos WHERE articulo_id=? LIMIT 1', old.id)))
                        fail(409, 'El artículo ya tiene movimientos. No se puede cambiar su unidad sin una conversión de inventario.');
                    clean.ficha_url = text(input.ficha_url, 'el enlace de ficha técnica', 2000, true);
                    clean.minimo = integer(input.minimo, 'el mínimo');
                    if (clean.ficha_url) {
                        let link;
                        try {
                            link = new URL(clean.ficha_url);
                        }
                        catch {
                            fail(400, 'El enlace de ficha técnica no es válido.');
                        }
                        if (!['http:', 'https:'].includes(link.protocol))
                            fail(400, 'Usá un enlace http o https.');
                    }
                    if (!Array.isArray(input.proveedores) || input.proveedores.length > 100)
                        fail(400, 'Revisá los proveedores del artículo.');
                    const seen = new Set();
                    for (const p of input.proveedores) {
                        if (seen.has(p.proveedor_id))
                            fail(400, 'No repitás proveedores.');
                        seen.add(p.proveedor_id);
                        (await reference('proveedores', p.proveedor_id, 'El proveedor', false));
                        text(p.codigo_proveedor, 'el código del proveedor', 80, true);
                    }
                }
                const saved = (await tx(async () => {
                    let key = id;
                    if (old) {
                        const r = (await run(`UPDATE ${table} SET ${fields.map(f => f + '=?').join(',')},version=version+1 WHERE id=? AND version=?`, ...fields.map(f => clean[f]), id, integer(input.version, 'la versión', 1)));
                        if (!r.changes)
                            fail(409, 'El registro cambió. Actualizá la lista antes de editar.');
                    }
                    else {
                        key = randomUUID();
                        (await run(`INSERT INTO ${table}(id,${fields.join(',')}) VALUES(${['id', ...fields].map(() => '?').join(',')})`, key, ...fields.map(f => clean[f])));
                    }
                    if (table === 'articulos') {
                        (await run('DELETE FROM articulo_proveedor WHERE articulo_id=?', key));
                        for (const p of input.proveedores)
                            (await run('INSERT INTO articulo_proveedor VALUES(?,?,?)', key, p.proveedor_id, p.codigo_proveedor?.trim() || ''));
                    }
                    (await audit(user, old ? 'EDITAR' : 'CREAR', table, key));
                    return table === 'articulos' ? (await listArticles()).find(a => a.id === key) : (await one(`SELECT * FROM ${table} WHERE id=?`, key));
                }));
                return send(old ? 200 : 201, saved);
            }
            if (req.method === 'GET' && path === '/api/inventario-empresas')
                return send(200, (await all("SELECT * FROM ubicaciones WHERE id IN ('inventario-STEEL','inventario-IEM') ORDER BY empresa DESC")));
            if (req.method === 'GET' && path === '/api/existencias-empresa') {
                const fecha = url.searchParams.get('fecha') || new Date().toISOString().slice(0, 10);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha)) || new Date(fecha).toISOString().slice(0, 10) !== fecha)
                    fail(400, 'Fecha inválida.');
                return send(200, (await all(`SELECT a.id AS articulo_id,a.codigo,a.descripcion,a.variante,a.unidad,a.minimo,a.activo AS articulo_activo,'inventario-'||u.empresa AS ubicacion_id,u.empresa AS ubicacion,u.empresa,1 AS ubicacion_activa,COALESCE(SUM(l.delta),0) AS cantidad,COUNT(l.movimiento_id) AS registros FROM articulos a CROSS JOIN ubicaciones u LEFT JOIN (SELECT lm.* FROM lineas_movimiento lm JOIN movimientos m ON m.id=lm.movimiento_id WHERE m.fecha<=?) l ON l.articulo_id=a.id AND l.ubicacion_id=u.id GROUP BY a.id,u.empresa ORDER BY a.descripcion,u.empresa`, fecha)));
            }
            if (req.method === 'GET' && path === '/api/existencias') {
                const date = url.searchParams.get('fecha') || new Date().toISOString().slice(0, 10);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))
                    fail(400, 'Fecha inválida.');
                return send(200, (await all(stockSql, date)));
            }
            if (req.method === 'GET' && path === '/api/movimientos')
                return send(200, (await all(movementsSql)));
            if (req.method === 'POST' && path === '/api/movimientos') {
                const tipo = option(input.tipo, ['SALDO_INICIAL', 'ENTRADA', 'TRASLADO', 'AJUSTE'], 'el tipo de movimiento');
                if (tipo === 'AJUSTE')
                    admin();
                const cantidad = integer(input.cantidad, 'la cantidad', tipo === 'AJUSTE' ? -100000000 : 1);
                if (!cantidad)
                    fail(400, 'La cantidad no puede ser cero.');
                const articulo = text(input.articulo_id, 'el artículo', 80), solicitud = text(input.solicitud, 'la solicitud', 100), motivo = text(input.motivo, 'el motivo o referencia', 500);
                const fecha = text(input.fecha, 'la fecha', 10);
                const today = new Date().toISOString().slice(0, 10);
                if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha)) || new Date(fecha).toISOString().slice(0, 10) !== fecha || fecha > today)
                    fail(400, 'La fecha debe ser válida y no estar en el futuro.');
                const origen = tipo === 'TRASLADO' ? text(input.origen_id, 'el origen', 80) : null;
                const destino = text(input.destino_id, 'la ubicación de destino', 80);
                if (origen === destino)
                    fail(400, 'El origen y el destino deben ser distintos.');
                const contenido = JSON.stringify({ tipo, cantidad, articulo, motivo, fecha, origen, destino });
                const result = (await tx(async () => {
                    const previous = (await one('SELECT * FROM movimientos WHERE solicitud=?', solicitud));
                    if (previous) {
                        if (previous.contenido !== contenido || previous.usuario_id !== user.id)
                            fail(409, 'La solicitud ya se usó para otro movimiento.');
                        return { id: previous.id, repetido: true };
                    }
                    const producto = (await reference('articulos', articulo, 'El artículo'));
                    if (producto.unidad === 'Por definir')
                        fail(400, 'Definí la unidad de medida del artículo en el catálogo antes de registrar existencias.');
                    (await reference('ubicaciones', destino, 'La ubicación de destino'));
                    if (origen)
                        (await reference('ubicaciones', origen, 'La ubicación de origen'));
                    if (tipo === 'SALDO_INICIAL' && (await one('SELECT movimiento_id FROM lineas_movimiento WHERE articulo_id=? AND ubicacion_id=? LIMIT 1', articulo, destino)))
                        fail(409, 'Esta combinación ya tiene movimientos. Usá entrada o ajuste.');
                    const lines = origen ? [[origen, -cantidad], [destino, cantidad]] : [[destino, cantidad]];
                    // Validate historical and current balances before posting a backdated movement.
                    for (const [location, delta] of lines) {
                        const history = (await all('SELECT m.fecha,SUM(l.delta) AS delta FROM lineas_movimiento l JOIN movimientos m ON m.id=l.movimiento_id WHERE l.articulo_id=? AND l.ubicacion_id=? GROUP BY m.fecha ORDER BY m.fecha', articulo, location));
                        const daily = new Map(history.map(r => [r.fecha, r.delta]));
                        daily.set(fecha, (daily.get(fecha) || 0) + delta);
                        let balance = 0;
                        for (const date of [...daily.keys()].sort()) {
                            balance += daily.get(date);
                            if (balance < 0)
                                fail(409, 'Saldo insuficiente en la fecha indicada o en movimientos posteriores.');
                        }
                        if (balance > 100000000)
                            fail(400, 'La cantidad supera el límite del inventario.');
                    }
                    const id = randomUUID();
                    (await run('INSERT INTO movimientos(id,solicitud,contenido,tipo,articulo_id,origen_id,destino_id,cantidad,fecha,motivo,usuario_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, solicitud, contenido, tipo, articulo, origen, destino, cantidad, fecha, motivo, user.id));
                    for (const [location, delta] of lines) {
                        (await run('INSERT INTO lineas_movimiento VALUES(?,?,?,?)', id, articulo, location, delta));
                        const actual = (await one('SELECT cantidad FROM saldos WHERE articulo_id=? AND ubicacion_id=?', articulo, location))?.cantidad || 0;
                        (await run('INSERT INTO saldos VALUES(?,?,?) ON CONFLICT(articulo_id,ubicacion_id) DO UPDATE SET cantidad=excluded.cantidad', articulo, location, actual + delta));
                    }
                    (await audit(user, tipo, 'movimientos', id));
                    return { id, repetido: false };
                }));
                return send(result.repetido ? 200 : 201, result);
            }
            fail(404, 'Ruta no encontrada.');
        }
        catch (error) {
            let status = error.status || 500, message = error.message;
            if (error.code === '23505' || message?.includes('UNIQUE constraint failed')) {
                status = 409;
                message = 'Este código o usuario ya está registrado.';
            }
            if (['23503', '23514'].includes(error.code) || message?.includes('FOREIGN KEY constraint failed')) {
                status = 400;
                message = 'El registro relacionado no es válido.';
            }
            if (status === 500) {
                console.error('API:', error.code || 'ERROR_INTERNO');
                message = 'No se pudo completar la operación.';
            }
            if (!res.headersSent)
                send(status, { message, code: error.code });
        }
    });
    server.on('close', async () => (await db.close()));
    return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const server = (await createApp(process.env.DATABASE_URL ? undefined : process.env.DB_PATH || fileURLToPath(new URL('./data/salud.sqlite', import.meta.url))));
    server.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () => console.log('API Salud Ocupacional en http://127.0.0.1:' + (process.env.PORT || 3001)));
    for (const signal of ['SIGINT', 'SIGTERM'])
        process.on(signal, () => server.close());
}

import { randomUUID } from 'node:crypto';
export async function configurarCapacitaciones(db) {
    if (db.dialect === 'sqlite')
        (await db.exec(`CREATE TABLE IF NOT EXISTS catalogo_capacitaciones(id TEXT PRIMARY KEY,nombre TEXT NOT NULL,clave TEXT NOT NULL UNIQUE,descripcion TEXT NOT NULL DEFAULT '',activo INTEGER NOT NULL DEFAULT 1);`));
    if (db.dialect === 'sqlite')
        (await db.exec(`CREATE TABLE IF NOT EXISTS capacitaciones(id TEXT PRIMARY KEY,solicitud TEXT NOT NULL UNIQUE,contenido TEXT NOT NULL,tema TEXT NOT NULL,curso_clave TEXT NOT NULL,fecha TEXT NOT NULL,instructor TEXT NOT NULL,lugar TEXT NOT NULL,observaciones TEXT NOT NULL,usuario_id TEXT NOT NULL REFERENCES usuarios(id),anulada INTEGER NOT NULL DEFAULT 0,motivo_anulacion TEXT,creado TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE TABLE IF NOT EXISTS constancias(id TEXT PRIMARY KEY,capacitacion_id TEXT NOT NULL REFERENCES capacitaciones(id),colaborador_id TEXT NOT NULL REFERENCES colaboradores(id),vence TEXT,UNIQUE(capacitacion_id,colaborador_id));
    CREATE TABLE IF NOT EXISTS avisos_leidos(usuario_id TEXT NOT NULL REFERENCES usuarios(id),constancia_id TEXT NOT NULL REFERENCES constancias(id),estado TEXT NOT NULL,PRIMARY KEY(usuario_id,constancia_id,estado));`));
    const one = async (sql, ...params) => (await db.one(sql, ...params)), all = async (sql, ...params) => (await db.all(sql, ...params)), run = async (sql, ...params) => (await db.run(sql, ...params));
    const columnas = (await db.columns('capacitaciones')).map(c => c.name);
    if (!columnas.includes('catalogo_id'))
        (await db.exec('ALTER TABLE capacitaciones ADD COLUMN catalogo_id TEXT REFERENCES catalogo_capacitaciones(id)'));
    if (!columnas.includes('modalidad'))
        (await db.exec("ALTER TABLE capacitaciones ADD COLUMN modalidad TEXT NOT NULL DEFAULT 'Grupal'"));
    for (const c of (await all('SELECT MIN(tema) AS tema,curso_clave FROM capacitaciones GROUP BY curso_clave'))) {
        (await run('INSERT OR IGNORE INTO catalogo_capacitaciones(id,nombre,clave) VALUES(?,?,?)', randomUUID(), c.tema, c.curso_clave));
        (await run('UPDATE capacitaciones SET catalogo_id=(SELECT id FROM catalogo_capacitaciones WHERE clave=?) WHERE curso_clave=? AND catalogo_id IS NULL', c.curso_clave, c.curso_clave));
    }
    const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const fechaValida = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
    const listado = `SELECT c.*,u.nombre AS registrado_por,(SELECT count(*) FROM constancias t WHERE t.capacitacion_id=c.id) AS participantes FROM capacitaciones c JOIN usuarios u ON u.id=c.usuario_id`;
    const detalle = async (id) => { const c = (await one(listado + ' WHERE c.id=?', id)); return c ? { ...c, asistentes: (await all('SELECT t.*,p.nombre,p.codigo,p.empresa FROM constancias t JOIN colaboradores p ON p.id=t.colaborador_id WHERE t.capacitacion_id=? ORDER BY p.nombre', id)) } : null; };
    const avisos = async (usuario, dias) => {
        const today = hoy(), limite = new Date(Date.parse(today) + dias * 86400000).toISOString().slice(0, 10);
        return (await all(`SELECT t.id,t.colaborador_id,t.vence,p.nombre,p.codigo,p.empresa,c.tema,c.fecha,c.id AS capacitacion_id,
      CASE WHEN t.vence<? THEN 'Vencido' ELSE 'Por vencer' END AS estado,
      EXISTS(SELECT 1 FROM avisos_leidos l WHERE l.usuario_id=? AND l.constancia_id=t.id AND l.estado=CASE WHEN t.vence<? THEN 'Vencido' ELSE 'Por vencer' END) AS leida
      FROM constancias t JOIN colaboradores p ON p.id=t.colaborador_id JOIN capacitaciones c ON c.id=t.capacitacion_id
      WHERE c.anulada=0 AND p.estado='Activo' AND t.vence IS NOT NULL AND t.vence<=?
      AND NOT EXISTS(SELECT 1 FROM constancias t2 JOIN capacitaciones c2 ON c2.id=t2.capacitacion_id WHERE t2.colaborador_id=t.colaborador_id AND c2.curso_clave=c.curso_clave AND c2.anulada=0 AND (c2.fecha>c.fecha OR (c2.fecha=c.fecha AND c2.rowid>c.rowid)))
      ORDER BY t.vence,p.nombre LIMIT 500`, today, usuario.id, today, limite)).map(r => ({ ...r, dias: Math.round((Date.parse(r.vence) - Date.parse(today)) / 86400000) }));
    };
    return async ({ path, method, input, user, url, send, tx, audit, text, fail }) => {
        if (method === 'GET' && path === '/api/catalogo-capacitaciones')
            return send(200, (await all('SELECT * FROM catalogo_capacitaciones ORDER BY nombre'))), true;
        const catalogoMatch = path.match(/^\/api\/catalogo-capacitaciones\/([\w-]+)$/);
        if ((method === 'POST' && path === '/api/catalogo-capacitaciones') || (method === 'PUT' && catalogoMatch)) {
            if (user.rol === 'Consulta')
                fail(403, 'Tu usuario solo puede consultar.');
            const nombre = text(input.nombre, 'el nombre', 200), descripcion = text(input.descripcion, 'la descripción', 1000, true), clave = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ');
            const id = catalogoMatch?.[1] || randomUUID(), activo = input.activo === 0 ? 0 : 1;
            (await tx(async () => {
                if (catalogoMatch && !(await one('SELECT id FROM catalogo_capacitaciones WHERE id=?', id)))
                    fail(404, 'Curso no encontrado.');
                if ((await one('SELECT id FROM catalogo_capacitaciones WHERE clave=? AND id<>?', clave, id)))
                    fail(409, 'Ya existe una capacitación con ese nombre.');
                if (catalogoMatch) {
                    if ((await one('SELECT id FROM capacitaciones WHERE catalogo_id=? LIMIT 1', id)) && (await one('SELECT clave FROM catalogo_capacitaciones WHERE id=?', id)).clave !== clave)
                        fail(409, 'El curso ya tiene historial. Conservá el nombre y creá otro curso si es diferente.');
                    (await run('UPDATE catalogo_capacitaciones SET nombre=?,clave=?,descripcion=?,activo=? WHERE id=?', nombre, clave, descripcion, activo, id));
                }
                else
                    (await run('INSERT INTO catalogo_capacitaciones(id,nombre,clave,descripcion,activo) VALUES(?,?,?,?,?)', id, nombre, clave, descripcion, activo));
                (await audit(user, catalogoMatch ? 'EDITAR' : 'CREAR', 'catalogo_capacitaciones', id));
            }));
            return send(catalogoMatch ? 200 : 201, (await one('SELECT * FROM catalogo_capacitaciones WHERE id=?', id))), true;
        }
        if (method === 'GET' && path === '/api/notificaciones') {
            const dias = Number(url.searchParams.get('dias') || 30);
            if (!Number.isInteger(dias) || dias < 1 || dias > 365)
                fail(400, 'El plazo debe ser de 1 a 365 días.');
            return send(200, { dias, avisos: (await avisos(user, dias)) }), true;
        }
        if (method === 'POST' && path === '/api/notificaciones/leidas') {
            if (!Array.isArray(input.ids) || input.ids.length > 500)
                fail(400, 'Selección de avisos inválida.');
            const disponibles = (await avisos(user, 365));
            (await tx(async () => { for (const id of new Set(input.ids)) {
                const a = disponibles.find(a => a.id === id);
                if (a)
                    (await run('INSERT OR IGNORE INTO avisos_leidos VALUES(?,?,?)', user.id, a.id, a.estado));
            } }));
            return send(200, { ok: true }), true;
        }
        const persona = path.match(/^\/api\/colaboradores\/([\w-]+)\/capacitaciones$/);
        if (method === 'GET' && persona)
            return send(200, (await all(`SELECT c.id,c.tema,c.fecha,c.instructor,c.anulada,t.vence FROM constancias t JOIN capacitaciones c ON c.id=t.capacitacion_id WHERE t.colaborador_id=? ORDER BY c.fecha DESC,c.rowid DESC`, persona[1]))), true;
        if (method === 'GET' && path === '/api/capacitaciones')
            return send(200, (await all(listado + ' ORDER BY c.fecha DESC,c.rowid DESC'))), true;
        const detalleMatch = path.match(/^\/api\/capacitaciones\/([\w-]+)$/);
        if (method === 'GET' && detalleMatch) {
            const c = (await detalle(detalleMatch[1]));
            if (!c)
                fail(404, 'Capacitación no encontrada.');
            return send(200, c), true;
        }
        if (method === 'POST' && path === '/api/capacitaciones') {
            if (user.rol === 'Consulta')
                fail(403, 'Tu usuario solo puede consultar.');
            const curso = input.catalogo_id ? (await one('SELECT * FROM catalogo_capacitaciones WHERE id=? AND activo=1', input.catalogo_id)) : null;
            if (input.catalogo_id && !curso)
                fail(400, 'Seleccioná una capacitación activa del catálogo.');
            const modalidad = input.modalidad || 'Grupal';
            if (!['Individual', 'Grupal'].includes(modalidad))
                fail(400, 'Modalidad inválida.');
            const tema = curso?.nombre || text(input.tema, 'el tema', 200), instructor = text(input.instructor, 'el instructor', 120), lugar = text(input.lugar, 'el lugar o modalidad', 120), observaciones = text(input.observaciones, 'las observaciones', 1000, true), solicitud = text(input.solicitud, 'la solicitud', 100);
            if (!fechaValida(input.fecha) || input.fecha > hoy())
                fail(400, 'La fecha de capacitación debe ser válida y no estar en el futuro.');
            const vence = input.vence || null;
            if (vence && (!fechaValida(vence) || vence < input.fecha))
                fail(400, 'El vencimiento no puede ser anterior a la capacitación.');
            if (!Array.isArray(input.participantes) || !input.participantes.length || input.participantes.length > 500)
                fail(400, 'Seleccioná entre 1 y 500 participantes.');
            const participantes = [...new Set(input.participantes)].sort();
            if (participantes.length !== input.participantes.length)
                fail(400, 'No repitás participantes.');
            if (modalidad === 'Individual' && participantes.length !== 1)
                fail(400, 'La capacitación individual requiere exactamente un trabajador.');
            const vencimientos = input.vencimientos;
            if (vencimientos !== undefined && (!vencimientos || typeof vencimientos !== 'object' || Array.isArray(vencimientos)))
                fail(400, 'Revisá los vencimientos individuales.');
            if (vencimientos && Object.keys(vencimientos).some(id => !participantes.includes(id)))
                fail(400, 'Hay fechas de trabajadores no seleccionados.');
            const fechas = Object.fromEntries(participantes.map(id => { const fecha = vencimientos && Object.hasOwn(vencimientos, id) ? vencimientos[id] || null : vence; if (fecha && (!fechaValida(fecha) || fecha < input.fecha))
                fail(400, 'El vencimiento individual no puede ser anterior a la capacitación.'); return [id, fecha]; }));
            const contenido = JSON.stringify({ tema, instructor, lugar, observaciones, fecha: input.fecha, vence, participantes, ...(vencimientos ? { vencimientos: fechas } : {}), ...(input.catalogo_id ? { catalogo_id: input.catalogo_id, modalidad } : {}) });
            const resultado = (await tx(async () => {
                const previous = (await one('SELECT * FROM capacitaciones WHERE solicitud=?', solicitud));
                if (previous) {
                    if (previous.contenido !== contenido || previous.usuario_id !== user.id)
                        fail(409, 'La solicitud ya se usó con otros datos.');
                    return (await detalle(previous.id));
                }
                for (const id of participantes) {
                    if (typeof id !== 'string' || !(await one("SELECT id FROM colaboradores WHERE id=? AND estado='Activo'", id)))
                        fail(400, 'Uno de los participantes no existe o está inactivo. Actualizá la lista.');
                }
                const id = randomUUID(), clave = tema.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ');
                (await run('INSERT INTO capacitaciones(id,solicitud,contenido,tema,curso_clave,fecha,instructor,lugar,observaciones,usuario_id) VALUES(?,?,?,?,?,?,?,?,?,?)', id, solicitud, contenido, tema, clave, input.fecha, instructor, lugar, observaciones, user.id));
                const catalogoId = curso?.id || (await one('SELECT id FROM catalogo_capacitaciones WHERE clave=?', clave))?.id || randomUUID();
                (await run('INSERT OR IGNORE INTO catalogo_capacitaciones(id,nombre,clave) VALUES(?,?,?)', catalogoId, tema, clave));
                (await run('UPDATE capacitaciones SET catalogo_id=?,modalidad=? WHERE id=?', catalogoId, modalidad, id));
                for (const persona of participantes)
                    (await run('INSERT INTO constancias VALUES(?,?,?,?)', randomUUID(), id, persona, fechas[persona]));
                (await audit(user, 'REGISTRAR_GRUPO', 'capacitaciones', id));
                return (await detalle(id));
            }));
            return send(201, resultado), true;
        }
        const anular = path.match(/^\/api\/capacitaciones\/([\w-]+)\/anular$/);
        if (method === 'POST' && anular) {
            if (user.rol !== 'Administrador')
                fail(403, 'La anulación requiere un administrador.');
            const motivo = text(input.motivo, 'el motivo de anulación', 500);
            (await tx(async () => { const c = (await one('SELECT * FROM capacitaciones WHERE id=?', anular[1])); if (!c)
                fail(404, 'Capacitación no encontrada.'); if (c.anulada)
                fail(409, 'La capacitación ya está anulada.'); (await run('UPDATE capacitaciones SET anulada=1,motivo_anulacion=? WHERE id=?', motivo, c.id)); (await audit(user, 'ANULAR', 'capacitaciones', c.id)); }));
            return send(200, (await detalle(anular[1]))), true;
        }
        return false;
    };
}

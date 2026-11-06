import {DatabaseSync, backup} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';

export const tablas = ['proyectos','usuarios','proveedores','articulos','colaboradores','ubicaciones',
  'catalogo_capacitaciones','capacitaciones','constancias','sesiones','articulo_proveedor','saldos',
  'movimientos','lineas_movimiento','avisos_leidos','auditoria','solicitudes_usuario','importaciones_excel'];
const ordenadas = new Set(['movimientos','auditoria','capacitaciones']);
const clave = 'sqlite-a-postgresql-v1';
const digest = rows => createHash('sha256').update(JSON.stringify(rows.map(r =>
  Object.fromEntries(Object.keys(r).sort().map(k => [k,r[k]]))).map(r=>JSON.stringify(r)).sort())).digest('hex');

export async function migrarSqlite(db, origen) {
  if (await db.one('SELECT clave FROM migraciones_soha WHERE clave=?',clave)) return;
  const carpeta = resolve(process.env.BACKUP_DIR || resolve(dirname(origen),'respaldos'));
  mkdirSync(carpeta,{recursive:true});
  const archivo = resolve(carpeta,`antes-postgresql-${Date.now()}.sqlite`);
  const original = new DatabaseSync(origen,{readOnly:true});
  try {await backup(original,archivo);} finally {original.close();}
  const sqlite = new DatabaseSync(archivo,{readOnly:true});
  try {
    if(sqlite.prepare('PRAGMA integrity_check').get().integrity_check!=='ok' || sqlite.prepare('PRAGMA foreign_key_check').all().length) throw Error('La base de origen no supera la verificación de integridad.');
    const existentes=sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name);
    if(existentes.some(t=>!tablas.includes(t))) throw Error('La base contiene tablas sin una migración definida.');
    const resumen={};
    await db.transaction(async()=>{
      // One migration at a time, without ever clearing an existing destination.
      await db.one('SELECT pg_advisory_xact_lock(7364202601)');
      if(await db.one('SELECT clave FROM migraciones_soha WHERE clave=?',clave)) return;
      for(const table of tablas) if((await db.one(`SELECT count(*) AS n FROM ${table}`)).n) throw Error('El destino contiene datos: se canceló la migración para protegerlos.');
      for(const table of tablas) {
        if(!existentes.includes(table)){resumen[table]=0;continue;}
        const columnas=sqlite.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
        const destino=(await db.columns(table)).map(c=>c.name);
        if(columnas.some(c=>!destino.includes(c))) throw Error(`Faltan columnas de migración en ${table}.`);
        const rows=sqlite.prepare(`SELECT ${ordenadas.has(table)?'rowid AS orden,':''}* FROM ${table}`).all();
        for(const row of rows) {
          const cols=Object.keys(row);
          await db.run(`INSERT INTO ${table}(${cols.map(c=>'"'+c+'"').join(',')}) VALUES(${cols.map(()=>'?').join(',')})`,...cols.map(c=>row[c]));
        }
        const selected=[...(ordenadas.has(table)?['orden']:[]),...columnas];
        const copia=await db.all(`SELECT ${selected.map(c=>'"'+c+'"').join(',')} FROM ${table}`);
        if(rows.length!==copia.length || digest(rows)!==digest(copia)) throw Error(`No coincide la verificación de ${table}.`);
        resumen[table]=rows.length;
        if(ordenadas.has(table)) await db.one(`SELECT setval(pg_get_serial_sequence('${table}','orden'),COALESCE((SELECT MAX(orden) FROM ${table}),1),EXISTS(SELECT 1 FROM ${table}))`);
      }
      await db.run('INSERT INTO migraciones_soha(clave,fecha,resumen) VALUES(?,?,?)',clave,new Date().toISOString(),JSON.stringify(resumen));
    });
    console.log('Migración PostgreSQL verificada (cantidades): '+JSON.stringify(resumen));
  } finally {sqlite.close();}
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {createApp} from './test-database.mjs';
import {createApp as sqliteApp} from './server.mjs';
import {openDatabase} from './database.mjs';
import {migrarSqlite} from './migrar-postgresql.mjs';
import {DatabaseSync} from 'node:sqlite';
import {respaldarPostgresql} from './respaldo-postgresql.mjs';

const url=process.env.SOHA_TEST_DATABASE_URL;
test('PostgreSQL: migración íntegra e idempotente; conserva hashes, sesiones y metadatos', {skip:!url},async()=>{
  const schema='soha_test_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString:url});
  const dir=mkdtempSync(join(tmpdir(),'soha-pg-'));
  const source=join(dir,'origen.sqlite');
  let db;
  try {
    const server=await sqliteApp(source);
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const r=await fetch(`http://127.0.0.1:${server.address().port}/api/auth/setup`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nombre:'Prueba',usuario:'prueba',password:'Prueba88'})});
    assert.equal(r.status,201);
    await new Promise(resolve=>server.close(resolve));
    const sqlite=new DatabaseSync(source);
    sqlite.exec(`ALTER TABLE colaboradores ADD COLUMN datos_origen TEXT;
      ALTER TABLE articulos ADD COLUMN datos_origen TEXT;
      ALTER TABLE catalogo_capacitaciones ADD COLUMN datos_origen TEXT;
      CREATE TABLE importaciones_excel(hash TEXT PRIMARY KEY,fecha TEXT NOT NULL,resumen TEXT NOT NULL);
      INSERT INTO colaboradores(id,codigo,nombre,puesto,area,estado,empresa,datos_origen) VALUES('p','P1','Prueba','Técnico','Campo','Activo','IEM','{"origen":"prueba"}');
      INSERT INTO catalogo_capacitaciones(id,nombre,clave,datos_origen) VALUES('c','Curso','CURSO','{"origen":"prueba"}');
      INSERT INTO importaciones_excel VALUES('prueba','2026-01-01','{}');`);
    const hash=sqlite.prepare('SELECT clave FROM usuarios').get().clave;
    sqlite.close();
    await admin.query(`CREATE SCHEMA ${schema}`);
    db=await openDatabase({url,schema});
    await db.exec(readFileSync(new URL('./postgresql.sql',import.meta.url),'utf8'));
    await migrarSqlite(db,source);
    assert.equal((await db.one('SELECT clave FROM usuarios')).clave,hash);
    assert.equal((await db.one('SELECT count(*) AS n FROM sesiones')).n,1);
    assert.equal((await db.one('SELECT datos_origen FROM colaboradores')).datos_origen,'{"origen":"prueba"}');
    await db.run("UPDATE colaboradores SET nombre='Cambiado' WHERE id='p'");
    await migrarSqlite(db,source);
    assert.equal((await db.one("SELECT nombre FROM colaboradores WHERE id='p'")).nombre,'Cambiado');
    assert.equal((await db.one('SELECT count(*) AS n FROM migraciones_soha')).n,1);
    const anterior=process.env.BACKUP_DIR;
    process.env.BACKUP_DIR=dir;
    try {await respaldarPostgresql(db,true);await respaldarPostgresql(db,true);}
    finally {if(anterior===undefined)delete process.env.BACKUP_DIR;else process.env.BACKUP_DIR=anterior;}
    const archivos=readdirSync(dir).filter(n=>n.endsWith('.json.gz'));
    assert.equal(archivos.length,1);
    const copia=JSON.parse(gunzipSync(readFileSync(join(dir,archivos[0]))));
    assert.equal(createHash('sha256').update(copia.payload).digest('hex'),copia.sha256);
    assert.equal(JSON.parse(copia.payload).tablas.usuarios[0].clave,hash);
    await db.run('DELETE FROM migraciones_soha');
    await assert.rejects(()=>migrarSqlite(db,source),/destino contiene datos/);
    assert.equal((await db.one('SELECT count(*) AS n FROM usuarios')).n,1);
  } finally {
    if(db)await db.close();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();
    rmSync(dir,{recursive:true,force:true});
  }
});

test('retiros simultáneos no permiten saldos negativos ni registros parciales',async()=>{
  const server=await createApp(':memory:');
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  let cookie='';
  const request=async(path,data)=>{
    const r=await fetch(base+path,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',Cookie:cookie},body:data?JSON.stringify(data):undefined});
    return {status:r.status,b:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  };
  try {
    cookie=(await request('/api/auth/setup',{nombre:'Prueba',usuario:'admin',password:'Prueba88'})).cookie;
    const a=await request('/api/articulos',{codigo:'P1',descripcion:'Prueba',variante:'',unidad:'Par',minimo:0,activo:1,proveedores:[]});
    assert.equal(a.status,201);
    const movimiento={solicitud:'inicio',tipo:'SALDO_INICIAL',articulo_id:a.b.id,destino_id:'inventario-STEEL',cantidad:10,fecha:new Date().toISOString().slice(0,10),motivo:'Prueba'};
    assert.equal((await request('/api/movimientos',movimiento)).status,201);
    const results=await Promise.all(['a','b'].map(s=>request('/api/movimientos',{...movimiento,tipo:'AJUSTE',solicitud:s,cantidad:-7})));
    assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
    const stock=(await request('/api/existencias-empresa')).b;
    assert.equal(stock.find(r=>r.empresa==='STEEL').cantidad,3);
    assert.equal((await request('/api/movimientos')).b.length,2);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

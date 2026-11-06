import {mkdirSync,existsSync,writeFileSync,readFileSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {tablas} from './migrar-postgresql.mjs';

const hash=text=>createHash('sha256').update(text).digest('hex');
export async function respaldarPostgresql(db,diario=false) {
  const carpeta=resolve(process.env.BACKUP_DIR || '../respaldos/base-datos');
  mkdirSync(carpeta,{recursive:true});
  const fecha=new Date().toISOString().slice(0,10);
  const archivo=resolve(carpeta,`postgresql-${diario?fecha:new Date().toISOString().replace(/[:.]/g,'-')}.json.gz`);
  if(diario && existsSync(archivo))return;
  const datos=await db.transaction(async()=>{
    await db.exec('SET TRANSACTION READ ONLY');
    const data={};
    for(const table of [...tablas,'migraciones_soha'])data[table]=await db.all(`SELECT * FROM ${table}`);
    return {formato:'soha-postgresql-v1',fecha:new Date().toISOString(),tablas:data};
  });
  const payload=JSON.stringify(datos);
  const copia=JSON.stringify({sha256:hash(payload),payload});
  const temporal=archivo+'.tmp';
  writeFileSync(temporal,gzipSync(copia),{mode:0o600});
  const comprobacion=JSON.parse(gunzipSync(readFileSync(temporal)));
  if(hash(comprobacion.payload)!==comprobacion.sha256)throw Error('No se pudo verificar el respaldo PostgreSQL.');
  renameSync(temporal,archivo);
  console.log('Respaldo PostgreSQL verificado: '+archivo);
}

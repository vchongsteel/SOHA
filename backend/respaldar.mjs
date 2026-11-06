import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {openDatabase} from './database.mjs';
import {respaldarPostgresql} from './respaldo-postgresql.mjs';

if(process.env.DATABASE_URL){
 const db=await openDatabase();
 try{await respaldarPostgresql(db,process.argv.includes('--diario'));}finally{await db.close();}
}else{
const raiz=dirname(fileURLToPath(import.meta.url));
const origen=resolve(process.env.DB_PATH || resolve(raiz,'data/salud.sqlite'));
if(!existsSync(origen)){console.log('No hay una base de datos para respaldar todavía.');process.exit(0);}
const destino=resolve(process.env.BACKUP_DIR || resolve(raiz,'../respaldos/base-datos'));
mkdirSync(destino,{recursive:true});
const fecha=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Costa_Rica',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const nombre=process.argv.includes('--diario')?`salud-${fecha}.sqlite`:`salud-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`;
const archivo=resolve(destino,nombre);
if(existsSync(archivo)){console.log('El respaldo de hoy ya existe.');process.exit(0);}
const db=new DatabaseSync(origen,{readOnly:true});
try{await backup(db,archivo);}finally{db.close();}
const copia=new DatabaseSync(archivo,{readOnly:true});
try{if(copia.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||copia.prepare('PRAGMA foreign_key_check').all().length)throw Error('La copia no superó la verificación de integridad.');}finally{copia.close();}
console.log('Respaldo verificado: '+archivo);
}

import {after} from 'node:test';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createApp as app} from './server.mjs';

const schemas=new Map();
const url=process.env.SOHA_TEST_DATABASE_URL;
const admin=url ? new pg.Pool({connectionString:url}) : null;
export async function createApp(path) {
  if(!url) return app(path);
  let schema=schemas.get(path);
  if(!schema){
    schema='soha_test_'+randomUUID().replaceAll('-','');
    await admin.query(`CREATE SCHEMA ${schema}`);
    schemas.set(path,schema);
  }
  return app({url,schema});
}
after(async()=>{
  if(!admin)return;
  for(const schema of schemas.values()) {
    if(!/^soha_test_[a-f0-9]{32}$/.test(schema))throw Error('Esquema de prueba inválido.');
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  }
  await admin.end();
});

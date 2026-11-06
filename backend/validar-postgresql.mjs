import {spawnSync} from 'node:child_process';
if(!process.env.DATABASE_URL)throw Error('Falta la conexión PostgreSQL privada.');
const result=spawnSync(process.execPath,['--test','server.test.mjs','capacitaciones.test.mjs','empresas.test.mjs','hosting.test.mjs','solicitudes-usuario.test.mjs','postgresql.test.mjs'],{
  stdio:'inherit',env:{...process.env,NODE_ENV:'test',APP_URL:'',DATABASE_URL:'',MIGRATE_FROM_SQLITE:'',SOHA_TEST_DATABASE_URL:process.env.DATABASE_URL}
});
process.exit(result.status??1);
